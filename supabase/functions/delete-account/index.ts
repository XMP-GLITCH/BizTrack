/**
 * Account deletion.
 *
 * A client cannot delete its own auth user — that needs the service role — so
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

  const { error: delErr } = await admin.auth.admin.deleteUser(user.id);
  if (delErr) {
    return json({ error: `could not delete account: ${delErr.message}` }, 500);
  }

  return json({ ok: true, deleted: user.id });
});
