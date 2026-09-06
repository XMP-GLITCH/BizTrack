import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import { newId } from '../domain/ids.js'
import { DEFAULT_CURRENCY, normalizeCurrency } from '../domain/money.js'
import { MOVEMENT, deriveInventory, deriveItemState } from '../domain/inventory.js'
import { SCHEMA_VERSION, makeBusiness, makeItem, makeSale, makeStockMovement } from '../domain/schema.js'
import { migrateState } from '../domain/migrate.js'

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
      name: 'biztrack-storage-v3',
      version: SCHEMA_VERSION,
      // Proper versioned migration. Bumping the storage KEY is what orphaned
      // data in earlier releases and forced the emergency rescue system; the
      // key stays fixed from here and the version does the work.
      migrate: (persisted, version) => (version < SCHEMA_VERSION ? migrateState(persisted) : persisted),
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
