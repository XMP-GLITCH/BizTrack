/**
 * Photos to and from Supabase Storage.
 *
 * Same contract as `syncOnce`: deferred, silent on failure, never blocking.
 * Being offline is the normal state for this audience, not an error worth
 * interrupting someone mid-sale to report.
 *
 * WHY THERE IS NO NEW SYNCED FIELD. The object path is
 * `{userId}/{photoId}.jpg`, which is derivable from the signed-in user and the
 * `photoId` already on the item. So a device that pulls an item knows exactly
 * where its photo lives without a column to keep in step, and the path is also
 * what the storage policies authorise against.
 *
 * `remotePath` on the LOCAL record is therefore a cache of "this one is already
 * up", not the source of truth. Losing it costs a re-upload, not a photo.
 */

import { supabase, isBackendConfigured } from "./supabase.js";
import { getPhoto, listPhotoIds, markUploaded, putRemotePhoto } from "../utils/photos.js";

const BUCKET = "product-photos";

/** The one place the path is spelled, because the policies depend on its shape. */
export const photoPath = (userId, photoId) => `${userId}/${photoId}.jpg`;

/**
 * Upload every local photo that has not reached the server.
 *
 * Sequential on purpose. This runs on a phone on metered mobile data, and
 * firing twenty parallel uploads is how you saturate a weak connection and make
 * every one of them time out. Slower and finishing beats faster and failing.
 *
 * Returns counts rather than throwing: the caller is a background loop.
 */
export async function pushPhotos(userId, { limit = 25 } = {}) {
  if (!isBackendConfigured || !userId) return { ok: false, reason: "not-configured", uploaded: 0 };

  let uploaded = 0;
  let failed = 0;
  try {
    const ids = await listPhotoIds();
    for (const id of ids.slice(0, limit)) {
      const row = await getPhoto(id);
      // Already up, or nothing to send. `remotePath` is only trusted as a
      // "skip" hint; if it is wrong the worst case is one wasted upload.
      if (!row?.blob || row.remotePath) continue;

      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(photoPath(userId, id), row.blob, {
          contentType: row.type || "image/jpeg",
          // The blob for a given id never changes: replacing a photo mints a
          // new id and deletes the old one. So an existing object is the SAME
          // bytes, and overwriting it would spend the user's data to upload
          // something already there.
          upsert: false,
        });

      if (error) {
        // A duplicate is success that arrived earlier: a previous run uploaded
        // it and died before recording that it had. Anything else is a real
        // failure and simply waits for the next pass.
        const already = error.statusCode === "409" || /exists/i.test(error.message || "");
        if (!already) { failed += 1; continue; }
      }
      await markUploaded(id, photoPath(userId, id));
      uploaded += 1;
    }
    return { ok: true, uploaded, failed };
  } catch (err) {
    console.warn("[BizTrack] Photo upload deferred:", err.message);
    return { ok: false, reason: "offline", error: err.message, uploaded, failed };
  }
}

/**
 * Fetch one photo this device does not have.
 *
 * This is the new-phone case: the items synced, so the app knows a photo EXISTS
 * and what its id is, but the blob was never on this device. Called lazily from
 * the component that needs it rather than by a bulk download, because a fresh
 * sign-in on mobile data should not pull the whole gallery before the owner has
 * asked to look at anything.
 *
 * Resolves null rather than throwing. A missing photo is a blank slot, which is
 * what the UI already renders when there is no photo at all.
 */
export async function fetchPhoto(userId, photoId) {
  if (!isBackendConfigured || !userId || !photoId) return null;
  try {
    const { data, error } = await supabase.storage.from(BUCKET).download(photoPath(userId, photoId));
    if (error || !data) return null;
    // Cache it locally under the id it already has, so the next read is offline
    // and the second render does not hit the network again.
    await putRemotePhoto(photoId, data, photoPath(userId, photoId));
    return data;
  } catch (err) {
    console.warn("[BizTrack] Photo fetch deferred:", err.message);
    return null;
  }
}

/**
 * Remove a photo from the server.
 *
 * Best effort, and deliberately NOT tied to deleting an item: items are
 * soft-deleted so their tombstones can travel, and a hard storage delete cannot
 * be undone by a sync that later decides the delete was the stale side. This is
 * for the explicit "remove this photo" action and for account deletion.
 */
export async function deleteRemotePhoto(userId, photoId) {
  if (!isBackendConfigured || !userId || !photoId) return false;
  try {
    const { error } = await supabase.storage.from(BUCKET).remove([photoPath(userId, photoId)]);
    return !error;
  } catch {
    return false;
  }
}

/**
 * The signed-in user, for callers that have no context to thread one through.
 *
 * `getSession()` reads supabase-js's in-memory session rather than the network,
 * so this is cheap enough to call per photo and has ONE source of truth. The
 * alternative was a module-level "current user" set at boot, which is a second
 * copy of the session that can be stale at exactly the moment it matters: just
 * after a sign-out.
 */
async function currentUserId() {
  if (!isBackendConfigured) return null;
  try {
    const { data } = await supabase.auth.getSession();
    return data?.session?.user?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * The BLOB for a photo: this device first, then the server.
 *
 * The second half is the new-phone case. Items sync, so the app knows a photo
 * exists and what its id is, but the blob has never been on this device.
 *
 * Lazy, per photo, rather than a bulk download after sign-in. Someone who has
 * just restored on mobile data should pay for the six thumbnails on screen, not
 * for a gallery they have not asked to look at. `fetchPhoto` caches what it
 * pulls, so this costs once per photo per device.
 */
export async function resolvePhotoBlob(photoId) {
  if (!photoId) return null;
  const local = await getPhoto(photoId);
  if (local?.blob) return local.blob;

  const userId = await currentUserId();
  if (!userId) return null;
  return await fetchPhoto(userId, photoId);
}

/**
 * The same thing as a URL, for anything that renders an <img>.
 *
 * The CALLER owns the URL and must revoke it: every object URL pins its blob in
 * memory until it is revoked or the document unloads.
 */
export async function resolvePhotoUrl(photoId) {
  const blob = await resolvePhotoBlob(photoId);
  return blob ? URL.createObjectURL(blob) : null;
}
