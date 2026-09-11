import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import { newId } from '../domain/ids.js'
import { DEFAULT_CURRENCY, normalizeCurrency } from '../domain/money.js'
import { MOVEMENT, deriveInventory, deriveItemState } from '../domain/inventory.js'
import { SCHEMA_VERSION, makeBusiness, makeItem, makeSale, makeStockMovement } from '../domain/schema.js'
import { migrateState, verifyMigration } from '../domain/migrate.js'

/**
 * Store.
 *
 * Every mutation is a TARGETED change to one record, never a whole-array swap.
 * The old `setBusinesses([...everything])` pattern could only express final
 * state, not what changed, so two devices doing it would clobber each other and
 * sync was impossible. Each action now touches one record and stamps its
 * updatedAt, which is exactly what an outbox needs to push.
 *
 * Deletes are soft. A hard delete cannot sync -- the other device has no way to
 * distinguish "deleted" from "not seen yet" -- so records get a deletedAt and
 * the selectors filter them out.
 */

export const STORAGE_KEY = 'biztrack-storage-v3'

/**
 * Untouched copy of the pre-ledger data, written once immediately before the
 * first migration and never overwritten afterwards.
 *
 * The migration is covered by tests, but tests run on inputs we thought of.
 * This runs on the only copy of a real person's books, so there is a verbatim
 * original to fall back on no matter what happens next.
 */
export const SNAPSHOT_KEY = 'biztrack-pre-ledger-backup'

function preserveSnapshot(persisted, version) {
  try {
    if (typeof localStorage === 'undefined') return
    if (localStorage.getItem(SNAPSHOT_KEY)) return // never clobber the original
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify({
      savedAt: new Date().toISOString(),
      fromVersion: version ?? 0,
      state: persisted,
    }))
    console.info('[BizTrack] Saved a pre-upgrade snapshot of your data.')
  } catch (err) {
    // Out of quota, or storage disabled. Migration still proceeds: refusing to
    // migrate would leave the app reading a shape it no longer understands,
    // which looks exactly like data loss to the person holding the phone.
    console.error('[BizTrack] Could not save a pre-upgrade snapshot.', err)
  }
}

/** The raw pre-upgrade snapshot, if one was taken. */
export function readSnapshot() {
  try {
    if (typeof localStorage === 'undefined') return null
    const raw = localStorage.getItem(SNAPSHOT_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

const now = () => new Date().toISOString()
const touch = (record) => ({ ...record, updatedAt: now() })
const live = (records) => (records || []).filter((r) => !r.deletedAt)

/** Apply `updater` to one business, leaving every other reference untouched. */
const mapBusiness = (businesses, bizId, updater) =>
  businesses.map((b) => (b.id === bizId ? touch(updater(b)) : b))

const mapItem = (business, itemId, updater) => ({
  ...business,
  items: business.items.map((i) => (i.id === itemId ? touch(updater(i)) : i)),
})

export const useStore = create(
  persist(
    (set, get) => ({
      /* ── data ──────────────────────────────────────────────────────────── */
      businesses: [],

      /* ── settings & profile ────────────────────────────────────────────── */
      currency: DEFAULT_CURRENCY,          // default for NEW businesses
      lowStockThreshold: 3,
      userName: 'Business Owner',
      userEmail: '',
      userAvatar: '/avatars/avatar1.png',
      isDarkMode: false,
      onboardingComplete: false,
      hasSeenGuide: false,
      joinDate: now(),

      /* ── local device lock ─────────────────────────────────────────────── */
      // Not encryption. A convenience lock over local data; real protection
      // arrives with server-side auth.
      // Set by the persist migration below when it could not complete cleanly.
      migrationFailed: false,
      migrationIssues: null,

      /* ── sync cursors ──────────────────────────────────────────────────── */
      // Persisted so a reopened app resumes where it left off instead of
      // re-uploading everything over metered mobile data.
      lastPushedAt: null,
      lastPulledAt: null,
      setSyncCursors: ({ lastPushedAt, lastPulledAt }) => set((s) => ({
        lastPushedAt: lastPushedAt ?? s.lastPushedAt,
        lastPulledAt: lastPulledAt ?? s.lastPulledAt,
      })),
      // Cleared on sign-out: the next account must not inherit another's cursor
      // and conclude it has already pulled everything.
      resetSyncCursors: () => set({ lastPushedAt: null, lastPulledAt: null }),

      hashedPin: null,
      hashedRecoveryKey: null,
      isPinEnabled: false,
      loginAttempts: 0,
      lockoutUntil: null,

      /* ── businesses ────────────────────────────────────────────────────── */
      addBusiness: (input) => {
        const business = makeBusiness({ ...input, currency: input?.currency || get().currency })
        set((s) => ({ businesses: [...s.businesses, business] }))
        return business.id
      },

      updateBusiness: (bizId, patch) =>
        set((s) => ({ businesses: mapBusiness(s.businesses, bizId, (b) => ({ ...b, ...patch })) })),

      deleteBusiness: (bizId) =>
        set((s) => ({ businesses: mapBusiness(s.businesses, bizId, (b) => ({ ...b, deletedAt: now() })) })),

      /* ── inventory ─────────────────────────────────────────────────────── */
      // Creating an item opens its ledger with a purchase, so quantity and cost
      // are recorded as facts rather than as counters to be mutated later.
      addItem: (bizId, { name, unitPrice, qty, unitCost }) => {
        const item = makeItem({ name, unitPrice })
        const opening = makeStockMovement({
          itemId: item.id,
          delta: qty,
          unitCost,
          reason: MOVEMENT.INITIAL,
          occurredAt: now(),
        })
        set((s) => ({
          businesses: mapBusiness(s.businesses, bizId, (b) => ({
            ...b,
            items: [...b.items, item],
            stockMovements: [...b.stockMovements, opening],
          })),
        }))
        return item.id
      },

      updateItem: (bizId, itemId, patch) =>
        set((s) => ({ businesses: mapBusiness(s.businesses, bizId, (b) => mapItem(b, itemId, (i) => ({ ...i, ...patch }))) })),

      deleteItem: (bizId, itemId) =>
        set((s) => ({
          businesses: mapBusiness(s.businesses, bizId, (b) =>
            mapItem(b, itemId, (i) => ({ ...i, deletedAt: now() }))),
        })),

      // A restock is an event at its own price. It never rewrites the cost of
      // stock already on the shelf; the weighted average absorbs it.
      restockItem: (bizId, itemId, { qty, unitCost }) =>
        set((s) => ({
          businesses: mapBusiness(s.businesses, bizId, (b) => ({
            ...b,
            stockMovements: [...b.stockMovements, makeStockMovement({
              itemId, delta: qty, unitCost, reason: MOVEMENT.RESTOCK, occurredAt: now(),
            })],
          })),
        })),

      /** Manual correction, e.g. reconciling a negative balance after a merge. */
      adjustStock: (bizId, itemId, { delta, unitCost = 0 }) =>
        set((s) => ({
          businesses: mapBusiness(s.businesses, bizId, (b) => ({
            ...b,
            stockMovements: [...b.stockMovements, makeStockMovement({
              itemId, delta, unitCost, reason: MOVEMENT.ADJUSTMENT, occurredAt: now(),
            })],
          })),
        })),

      /* ── sales ─────────────────────────────────────────────────────────── */
      /**
       * Records the sale and, for inventory sales, the stock it consumed.
       * Overselling is NOT blocked: the sale happened, so it is recorded, and
       * the resulting negative balance is surfaced for reconciliation instead.
       * Returns the affected item's post-sale state so the caller can decide
       * whether to raise a low-stock alert.
       */
      recordSale: (bizId, input) => {
        const saleId = newId()
        const occurredAt = now()
        const sale = makeSale({ ...input, id: saleId, occurredAt })

        set((s) => ({
          businesses: mapBusiness(s.businesses, bizId, (b) => ({
            ...b,
            sales: [sale, ...b.sales],
            stockMovements: sale.itemId
              ? [...b.stockMovements, makeStockMovement({
                  itemId: sale.itemId,
                  delta: -sale.qty,
                  unitCost: sale.unitCost,
                  reason: MOVEMENT.SALE,
                  saleId,
                  occurredAt,
                })]
              : b.stockMovements,
          })),
        }))

        if (!sale.itemId) return { sale, item: null }
        const business = get().businesses.find((b) => b.id === bizId)
        const item = business?.items.find((i) => i.id === sale.itemId)
        const state = deriveItemState((business?.stockMovements || []).filter((m) => m.itemId === sale.itemId))
        return { sale, item: item ? { ...item, ...state } : null }
      },

      /* ── bulk replace (import / rescue only) ───────────────────────────── */
      // The one remaining whole-array write. Restoring a backup genuinely does
      // replace everything, and its input is validated by parseBackup first.
      replaceBusinesses: (businesses) => set({ businesses }),

      /* ── settings ──────────────────────────────────────────────────────── */
      setCurrency: (currency) => set({ currency: normalizeCurrency(currency) }),
      setLowStockThreshold: (lowStockThreshold) => set({ lowStockThreshold }),
      setUserName: (userName) => set({ userName }),
      setUserEmail: (userEmail) => set({ userEmail }),
      setUserAvatar: (userAvatar) => set({ userAvatar }),
      setIsDarkMode: (isDarkMode) => set({ isDarkMode }),
      setOnboardingComplete: (onboardingComplete) => set({ onboardingComplete }),
      setHasSeenGuide: (hasSeenGuide) => set({ hasSeenGuide }),
      setHashedPin: (hashedPin) => set({ hashedPin }),
      setHashedRecoveryKey: (hashedRecoveryKey) => set({ hashedRecoveryKey }),
      setIsPinEnabled: (isPinEnabled) => set({ isPinEnabled }),
      setLoginAttempts: (loginAttempts) => set({ loginAttempts }),
      setLockoutUntil: (lockoutUntil) => set({ lockoutUntil }),
    }),
    {
      name: STORAGE_KEY,
      version: SCHEMA_VERSION,
      // Proper versioned migration. Bumping the storage KEY is what orphaned
      // data in earlier releases and forced the emergency rescue system; the
      // key stays fixed from here and the version does the work.
      //
      // This function must never throw. It runs on a real device holding data
      // that exists nowhere else, so every outcome is handled explicitly:
      // snapshot first, convert defensively, then verify the result against the
      // source before accepting it.
      migrate: (persisted, version) => {
        if (version >= SCHEMA_VERSION) return persisted

        preserveSnapshot(persisted, version)

        try {
          const next = migrateState(persisted)
          const report = verifyMigration(persisted?.businesses, next.businesses)

          if (!report.ok) {
            // The data is still here; something just does not add up. Surface it
            // rather than reporting a clean upgrade, and keep the snapshot.
            console.error('[BizTrack] Migration check found discrepancies:', report.issues)
            return { ...next, migrationIssues: report.issues }
          }
          return next
        } catch (err) {
          // Nothing is deleted: the original is in the snapshot, and the app
          // shows a recovery screen instead of an empty dashboard that would
          // invite the user to start over.
          console.error('[BizTrack] Migration failed; original data preserved.', err)
          return { ...persisted, businesses: [], migrationFailed: true }
        }
      },
    }
  )
)

/* ── selectors ───────────────────────────────────────────────────────────── */
// Soft-deleted records stay in the store so their tombstones can sync; reads go
// through these so the UI never sees them.

export const selectBusinesses = (state) => live(state.businesses)

export const selectBusiness = (state, bizId) =>
  live(state.businesses).find((b) => b.id === bizId) || null

/** A business with its items resolved to current quantity and average cost. */
export function selectInventory(state, bizId) {
  const business = selectBusiness(state, bizId)
  if (!business) return []
  return deriveInventory({ ...business, items: live(business.items) })
}

export const selectSales = (state, bizId) => live(selectBusiness(state, bizId)?.sales)
