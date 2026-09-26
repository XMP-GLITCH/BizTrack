/**
 * Account deletion.
 *
 * A client cannot delete its own auth user, which needs the service role, so
 * this exists to give people a right-to-erasure path that does not depend on
 * emailing us and waiting.
 *
 * The identity is taken from the caller's own access token and NEVER from the
 * request body. A user id in a body would let anyone delete anyone; the token
 * is the only thing here that proves who is asking.
 *
 * Deleting the auth user is sufficient. Every table references
 * auth.users(id) with ON DELETE CASCADE, so profiles, businesses,
 * business_members, items, sales, stock_movements and queued notifications all
 * go with it. That is deliberate schema design, not an accident, and it is why
 * this function is short.
 *
 * What it does NOT touch is the copy on the user's own device. That is theirs,
 * it may be their only copy, and erasing it from here would be the one thing
 * this product has promised never to do. The client says so before confirming.
 */

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...cors },
  });

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ error: "not signed in" }, 401);

  // Resolve the token to a user with the anon key, exactly as any client would.
  // If the token is expired or forged, this fails and nothing is deleted.
  const asUser = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: whoErr } = await asUser.auth.getUser();
  const user = userData?.user;
  if (whoErr || !user) return json({ error: "not signed in" }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // ── product photos, BEFORE the user row ────────────────────────────────────
  //
  // Deleting the auth user cascades DATABASE rows. It does not empty Storage,
  // so without this every photograph the owner ever took of their stock stays
  // in the bucket after they have exercised a legal right to be deleted, with
  // no account left that could ever reach or remove it.
  //
  // Before, not after: once `deleteUser` returns there is no `auth.uid()` to
  // scope a cleanup to, and a failure here should abort the whole thing rather
  // than leave files behind that nothing can name.
  //
  // Objects live at `{userId}/{photoId}.jpg`, which is also what the storage
  // policies authorise against, so listing that one folder is the complete set.
  // Paged, because `list` caps at a page and a shop that has traded for years
  // can hold more photos than one page holds. Leaving the tail behind would
  // make "your data was deleted" false, on the one path where that sentence is
  // a legal claim rather than a convenience.
  //
  // It always re-reads the FIRST page rather than walking an offset forward:
  // each pass deletes what it read, so the next page slides down into the space
  // just cleared and advancing an offset would step straight over it.
  //
  // `rounds` is a stop, not an expectation. Without it, a remove that reports
  // success while deleting nothing turns a cleanup into an endless loop inside
  // a function the user is waiting on.
  try {
    const PAGE = 100;
    for (let rounds = 0; rounds < 200; rounds += 1) {
      const { data: files, error: listErr } = await admin.storage
        .from("product-photos")
        .list(user.id, { limit: PAGE });
      if (listErr) throw listErr;
      if (!files?.length) break;

      const paths = files.map((f) => `${user.id}/${f.name}`);
      const { error: rmErr } = await admin.storage.from("product-photos").remove(paths);
      if (rmErr) throw rmErr;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return json({ error: `could not delete your photos, so nothing was deleted: ${message}` }, 500);
  }

  const { error: delErr } = await admin.auth.admin.deleteUser(user.id);
  if (delErr) {
    return json({ error: `could not delete account: ${delErr.message}` }, 500);
  }

  return json({ ok: true, deleted: user.id });
});
