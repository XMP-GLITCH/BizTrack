/**
 * Product photos: compression, and a blob store that is not localStorage.
 *
 * Both real users asked for this before anything else. Someone selling from a
 * stall knows their stock by sight, not by name, and "Denim Jacket" is three
 * different jackets.
 *
 * WHY INDEXEDDB, AND WHY THIS IS NOT NEGOTIABLE. The books live in
 * localStorage under `biztrack-storage-v3`, inside a per-origin quota that is
 * about 5MB. One uncompressed phone photo is 3-5MB. Putting a photo anywhere
 * near that quota risks a write of the LEDGER failing, and this project already
 * has a v1.5.3-v1.5.7 emergency-rescue history created by exactly one storage
 * decision going wrong. Photos therefore live in their own IndexedDB database,
 * as blobs, and the store keeps nothing but an id.
 *
 * The database is deliberately NOT called `keyval-store`. `checkRescue` in
 * App.jsx opens that database by name and JSON.parses whatever it finds, so a
 * JPEG landing in it would be fed to a JSON parser on the data-rescue path,
 * which is the last path in the app that should ever see a surprise.
 */

const DB_NAME = "biztrack-photos";
const DB_VERSION = 1;
const STORE = "photos";

/** Long edge, in CSS pixels. A product photo is read at thumbnail size and
 *  occasionally opened; 1000 survives both and a phone camera's 4000px does
 *  not need to reach a metered connection. */
export const MAX_EDGE = 1000;
export const JPEG_QUALITY = 0.72;

let dbPromise = null;

function openOnce(version) {
  return new Promise((resolve, reject) => {
    const req = version ? indexedDB.open(DB_NAME, version) : indexedDB.open(DB_NAME);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("Could not open photo storage."));
    // Firefox in permanent-private mode, and a few Android WebViews, neither
    // succeed nor error. Without this the caller's await never settles.
    req.onblocked = () => reject(new Error("Photo storage is busy."));
  });
}

/**
 * A cached connection can outlive its database. "Clear site data" in Chrome, or
 * another tab deleting or upgrading it, leaves this handle open but useless,
 * and the cache would go on handing it out for the rest of the session: every
 * photo read and write failing until the app is restarted, with nothing on
 * screen to explain why. Dropping the cache means the next call reopens.
 */
function watch(db) {
  db.onclose = () => { dbPromise = null; };
  db.onversionchange = () => { dbPromise = null; db.close(); };
  return db;
}

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = (async () => {
    if (typeof indexedDB === "undefined") throw new Error("This browser cannot store photos.");
    let db = await openOnce(DB_VERSION);

    // The database can exist AT THIS VERSION and still have no object store.
    // An upgrade transaction that aborted part way leaves exactly that, and so
    // does anything else that opened this name without creating the store. It
    // is not self-healing: `onupgradeneeded` fires only when the version
    // CHANGES, so reopening at the same version returns the same broken
    // database forever, and photos are dead for that user with no route back.
    // Bumping past it is the only way to get an upgrade transaction at all.
    if (!db.objectStoreNames.contains(STORE)) {
      const next = db.version + 1;
      db.close();
      db = await openOnce(next);
    }
    return watch(db);
  })();
  // Never cache a rejection. One transient failure would otherwise disable
  // photos for the rest of the session.
  dbPromise.catch(() => { dbPromise = null; });
  return dbPromise;
}

function tx(mode, run, retried = false) {
  return openDb()
    .then(
      (db) =>
        new Promise((resolve, reject) => {
          let t;
          let store;
          let out;
          try {
            // Inside the try: on a connection whose database has been deleted,
            // `transaction()` itself throws NotFoundError synchronously. Left
            // outside, that escapes the promise instead of rejecting it, and
            // the caller's await never settles.
            t = db.transaction(STORE, mode);
            store = t.objectStore(STORE);
            out = run(store);
          } catch (err) {
            reject(err);
            return;
          }
          t.oncomplete = () => resolve(out && out.result !== undefined ? out.result : out);
          t.onerror = () => reject(t.error || new Error("Photo storage failed."));
          t.onabort = () => reject(t.error || new Error("Photo storage was interrupted."));
        }),
    )
    .catch((err) => {
      // One retry, once, on exactly the symptom of a stale handle. Reopening
      // recreates the object store through `onupgradeneeded`, so the operation
      // that would have failed permanently succeeds on the second attempt.
      if (!retried && err && err.name === "NotFoundError") {
        dbPromise = null;
        return tx(mode, run, true);
      }
      throw err;
    });
}

/**
 * The target box for a photo, preserving aspect ratio.
 *
 * Pure, and exported, because it is the only part of the pipeline a test can
 * reach: there is no canvas and no ImageBitmap in node.
 *
 * Never scales UP. A 400px photo stays 400px; re-encoding it larger would cost
 * bytes on a metered connection to add no detail that was ever captured.
 */
export function fitWithin(width, height, maxEdge = MAX_EDGE) {
  const w = Math.max(1, Math.round(width || 0));
  const h = Math.max(1, Math.round(height || 0));
  const longest = Math.max(w, h);
  if (longest <= maxEdge) return { width: w, height: h, scaled: false };
  const ratio = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(w * ratio)),
    height: Math.max(1, Math.round(h * ratio)),
    scaled: true,
  };
}

/** Decode to something drawable, with the camera's rotation already applied. */
async function decode(file) {
  // Android cameras write portrait photos as landscape plus an EXIF rotation
  // flag. `imageOrientation: "from-image"` is what applies it; without this
  // every portrait product photo is stored on its side, and a canvas redraw
  // makes that permanent rather than merely displayed wrong.
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      /* Safari <15 rejects the options bag. Fall through to the <img> path. */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("That file could not be read as an image."));
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Encode a canvas, and VERIFY WHAT CAME BACK.
 *
 * `canvas.toBlob(cb, "image/webp")` on a browser without WebP encoding does not
 * throw and does not return null: it silently encodes PNG instead. A photo that
 * was meant to be a 90KB JPEG comes back as a 2MB PNG, which is worse than the
 * original on a metered connection and would be invisible in every test that
 * only checks a blob exists. So the type is checked, not assumed.
 */
function encode(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    if (typeof canvas.toBlob !== "function") {
      reject(new Error("This browser cannot process photos."));
      return;
    }
    canvas.toBlob(
      (blob) => {
        if (!blob) reject(new Error("The photo could not be processed."));
        else resolve(blob);
      },
      type,
      quality,
    );
  });
}

/**
 * A camera file, reduced to something worth keeping and sending.
 *
 * Returns the blob plus what it cost, because the caller shows the size: this
 * audience pays for every megabyte and a silent upload is not a kindness.
 */
export async function compressImage(file, { maxEdge = MAX_EDGE, quality = JPEG_QUALITY } = {}) {
  if (!file || !String(file.type || "").startsWith("image/")) {
    throw new Error("Choose an image file.");
  }
  const source = await decode(file);
  const box = fitWithin(source.width, source.height, maxEdge);

  const canvas = document.createElement("canvas");
  canvas.width = box.width;
  canvas.height = box.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser cannot process photos.");
  // White rather than transparent: the output is JPEG, which has no alpha, and
  // an unpainted canvas encodes as black. A PNG logo with a transparent
  // background would otherwise come out as a black rectangle.
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, box.width, box.height);
  ctx.drawImage(source, 0, 0, box.width, box.height);
  if (typeof source.close === "function") source.close();

  let blob = await encode(canvas, "image/jpeg", quality);
  if (blob.type !== "image/jpeg") {
    // Extremely unlikely for JPEG, but the check is cheap and the failure it
    // guards against is silent. Better to keep the original than to store a
    // surprise encoding under a JPEG's name.
    blob = file;
  }
  // Re-encoding a small, already-compressed photo can make it bigger. When it
  // does, and the pixels did not need scaling anyway, the original wins.
  if (!box.scaled && file.size && blob.size > file.size) blob = file;

  return { blob, width: box.width, height: box.height, bytes: blob.size, type: blob.type };
}

/**
 * Ask the browser not to evict this origin.
 *
 * Without it, Chrome treats IndexedDB as "best effort" and may clear it when
 * the device is low on space. For most sites that means a lost cache; here it
 * would mean a shop's product photos disappearing with no action by the owner,
 * which is this project's oldest failure mode wearing new clothes.
 *
 * On Android it is granted silently for an installed PWA and declined silently
 * otherwise, so this never prompts and never needs handling. It also protects
 * localStorage, where the books are, which is reason enough on its own.
 */
export async function requestPersistence() {
  try {
    if (!navigator.storage?.persist) return null;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return null;
  }
}

/** What photos are costing, for the row that has to tell the owner. */
export async function photoStorageEstimate() {
  try {
    const ids = await listPhotoIds();
    const bytes = await tx("readonly", (store) => {
      const req = store.getAll();
      return req;
    }).then((rows) => (Array.isArray(rows) ? rows.reduce((n, r) => n + (r?.bytes || 0), 0) : 0));
    let quota = null;
    if (navigator.storage?.estimate) {
      const e = await navigator.storage.estimate();
      quota = e?.quota ?? null;
    }
    return { count: ids.length, bytes, quota };
  } catch {
    return { count: 0, bytes: 0, quota: null };
  }
}

function quotaError(err) {
  return (
    err &&
    (err.name === "QuotaExceededError" ||
      err.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
      err.code === 22)
  );
}

/**
 * Compress and keep a photo. Resolves with the id to put on the item.
 *
 * A full disk raises rather than resolving, and the caller says so out loud.
 * Silently dropping a photo the owner watched themselves take is the worst
 * possible behaviour: they would find out weeks later, with no way back.
 */
/** A fallback encode for a phone that has run out of room. Half the long edge
 *  is a QUARTER of the pixels, so this is far smaller than the quality step
 *  alone suggests. Still legible as a product photo on a 48px row and when
 *  opened. */
const TIGHT_EDGE = 640;
const TIGHT_QUALITY = 0.55;

const readable = (n) => (n >= 1048576
  ? `${(n / 1048576).toFixed(1)}MB`
  : `${Math.max(1, Math.round(n / 1024))}KB`);

export async function savePhoto(file, id) {
  const photoId = id || (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()));
  const write = async (shot) => {
    await tx("readwrite", (store) => store.put({
      id: photoId,
      blob: shot.blob,
      type: shot.type,
      width: shot.width,
      height: shot.height,
      bytes: shot.bytes,
      createdAt: new Date().toISOString(),
      // Set once the photo reaches Supabase Storage. Until then this device
      // holds the only copy, which the backup copy has to know about.
      remotePath: null,
    }));
    return { id: photoId, width: shot.width, height: shot.height, bytes: shot.bytes };
  };

  let shot = await compressImage(file);
  try {
    return await write(shot);
  } catch (err) {
    console.error("[BizTrack] savePhoto failed:", err?.name, err?.message, { bytes: shot.bytes, type: shot.type });

    /**
     * OUT OF ROOM IS NOT THE END OF THE ATTEMPT.
     *
     * Verified rather than assumed: with the origin's quota squeezed below one
     * photo, the write raises a real `QuotaExceededError` (code 22), so the
     * classifier is right and the sentence was true -- the phone really had no
     * room. Which left the owner with a message and no way forward.
     *
     * So try once more at a quarter of the pixels. A phone that cannot take
     * 240KB will often take 60, and this audience's devices are cheap and
     * usually close to full. The result is a softer picture, which is a real
     * cost and the honest trade: a slightly soft photo of the product beats no
     * photo, and the field prints the saved size, so the smaller figure is on
     * screen rather than hidden.
     *
     * Only for a quota failure. Retrying a broken encoder or a missing object
     * store would just fail twice and take twice as long to say so.
     */
    if (!quotaError(err)) {
      throw new Error(`The photo could not be saved: ${err?.name || "unknown error"}. Nothing was changed.`, { cause: err });
    }

    try {
      shot = await compressImage(file, { maxEdge: TIGHT_EDGE, quality: TIGHT_QUALITY });
      return await write(shot);
    } catch (second) {
      /**
       * Still no. Now say how much of the room BIZTRACK is using, because
       * "out of space" on its own is a dead end: it does not tell the owner
       * whether to delete photos in this app or somewhere else on the phone.
       * `photoStorageEstimate` was written for exactly this and had no caller.
       */
      let held = "";
      try {
        const est = await photoStorageEstimate();
        if (est.count > 0) held = ` BizTrack is holding ${est.count} photo${est.count === 1 ? "" : "s"} (${readable(est.bytes)}).`;
      } catch { /* the figure is a courtesy; its absence must not replace the real error */ }

      // `second`, not a pick between the two: this attempt is what failed, and
      // the lint rule is right that naming the earlier error as the cause
      // misreports which one it is. Nothing is lost -- the first is a quota
      // error by construction, since anything else threw above, and it is
      // already in the console line.
      throw new Error(
        `There is no room left on this phone, so the photo was not saved.${held} Free some space and try again.`,
        { cause: second },
      );
    }
  }
}

export async function getPhoto(id) {
  if (!id) return null;
  try {
    const row = await tx("readonly", (store) => store.get(id));
    return row || null;
  } catch {
    return null;
  }
}

/**
 * An object URL for a photo, or null.
 *
 * The CALLER owns the URL and must revoke it. Every object URL pins its blob in
 * memory until revoked or the document unloads, and an inventory list that
 * creates one per row per render leaks the whole gallery.
 */
export async function getPhotoUrl(id) {
  const row = await getPhoto(id);
  if (!row?.blob) return null;
  return URL.createObjectURL(row.blob);
}

export async function deletePhoto(id) {
  if (!id) return;
  try {
    await tx("readwrite", (store) => store.delete(id));
  } catch {
    /* A photo that cannot be deleted is orphaned, not lost data. Never block
       the delete of the ITEM on it. */
  }
}

/**
 * Record that a photo reached the server.
 *
 * A read-modify-write in ONE transaction. Read and write as two transactions
 * and an upload finishing while the owner replaces the same photo can put the
 * old blob back, because the read captured the record before the replace and
 * the write puts all of it back afterwards.
 */
export async function markUploaded(id, remotePath) {
  if (!id) return false;
  try {
    await tx("readwrite", (store) => {
      const req = store.get(id);
      req.onsuccess = () => {
        const row = req.result;
        // Gone already: the photo was removed while the upload was in flight.
        // Writing it back would resurrect a blob the owner deleted.
        if (row) store.put({ ...row, remotePath });
      };
      return req;
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Cache a blob pulled down from the server.
 *
 * Marked with its remote path on the way in, so the upload sweep never sends
 * back something it just downloaded.
 */
export async function putRemotePhoto(id, blob, remotePath) {
  if (!id || !blob) return false;
  try {
    await tx("readwrite", (store) => store.put({
      id,
      blob,
      type: blob.type || "image/jpeg",
      width: null,
      height: null,
      bytes: blob.size,
      createdAt: new Date().toISOString(),
      remotePath,
    }));
    return true;
  } catch (err) {
    if (quotaError(err)) return false;
    return false;
  }
}

export async function listPhotoIds() {
  try {
    const keys = await tx("readonly", (store) => store.getAllKeys());
    return Array.isArray(keys) ? keys : [];
  } catch {
    return [];
  }
}

/**
 * Drop every photo no item points at any more.
 *
 * Deleting an item deletes its photo directly, but a RESTORE replaces the whole
 * book at once and can strand any number of them. Without this, storage would
 * only ever grow.
 */
export async function pruneOrphans(keepIds) {
  const keep = new Set([...(keepIds || [])].filter(Boolean));
  const all = await listPhotoIds();
  const gone = all.filter((id) => !keep.has(id));
  for (const id of gone) await deletePhoto(id);
  return gone.length;
}

/** Used by the factory reset and by account deletion. */
export async function deleteAllPhotos() {
  try {
    await tx("readwrite", (store) => store.clear());
    return true;
  } catch {
    return false;
  }
}
