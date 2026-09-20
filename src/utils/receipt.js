/**
 * A receipt, drawn to a canvas and shared as a PNG.
 *
 * DERIVED, NOT STORED, and that is a change from the original plan. The plan
 * said a receipt must be a snapshot taken at issue time, because re-rendering
 * one later could contradict the copy already in a customer's hands. Reading
 * `makeSale` showed the snapshot ALREADY EXISTS: a sale carries its own
 * `itemName`, `qty`, `unitPrice` and `occurredAt`, captured when it was
 * recorded and never recomputed from the item. So the money on a receipt cannot
 * drift, and a second copy of it would be one more thing to keep in step.
 *
 * That removes a whole entity: no receipts table, no store actions, no sync
 * mappers, no RLS, no migration. The receipt number is a pure function of the
 * sale's id and date, both immutable, so it is stable by construction rather
 * than by being written down.
 *
 * PNG rather than PDF, and no library. This audience sends business documents
 * on WhatsApp, where an image previews inline and a PDF is an attachment
 * someone has to open. A PDF library is also 90 to 400KB against an explicit
 * kilobytes-on-3G budget; a canvas is already in the browser.
 */

import { formatMoney } from "../domain/money.js";

/**
 * The receipt number for a sale.
 *
 * Pure, so it is the same on every device and on every reprint without anything
 * being stored or synced. `id` and `occurredAt` never change once a sale is
 * recorded, which is what makes that safe.
 *
 * NOT sequential, deliberately. Sequential numbering across two offline phones
 * is the same conflict the stock ledger exists to avoid: both devices would
 * issue number 47. This app also does not claim to produce a fiscal document,
 * and inventing an official-looking sequence would imply otherwise.
 *
 * Hex from a UUID is 0-9a-f, so there is no O to read as a zero and no I to
 * read as a one when someone reads it down a phone.
 */
export function receiptNumber(saleOrSales) {
  // A basket is numbered by its GROUP, so every line on one receipt shares one
  // number and a reprint matches the copy the customer holds. A sale recorded
  // on its own has no group and falls back to its own id. Both are immutable,
  // which is what makes either safe to derive from rather than store.
  const sale = Array.isArray(saleOrSales) ? saleOrSales[0] : saleOrSales;
  const seed = String(sale?.groupId || sale?.id || "");

  // Hashed, not sliced. The first version took the leading six hex characters
  // of the id, which is fine for a random UUID and collapses the moment ids
  // share a prefix: the test books produced `R-260915-000000` for every sale,
  // because their ids all begin with zeros. Depending on the SHAPE of an id is
  // depending on luck. FNV-1a mixes the whole string, so any id gives a spread
  // suffix, including ids from a restored backup written by an older version.
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  const suffix = h.toString(16).toUpperCase().padStart(8, "0").slice(-6);
  const day = String(sale?.occurredAt || "").slice(0, 10).replace(/-/g, "").slice(2) || "000000";
  return `R-${day}-${suffix}`;
}

/**
 * The lines a receipt shows, and it is a SHORT list on purpose.
 *
 * A receipt goes to the buyer. `unitCost` sits on the same sale record as
 * `unitPrice`, and `saleProfit` is one import away, so the single worst thing
 * this file could do is put the owner's margin on a document they hand to a
 * customer. Nothing here reads cost, and nothing should be added that does.
 */
export function receiptLines(saleOrSales, currency) {
  const sales = Array.isArray(saleOrSales) ? saleOrSales : [saleOrSales];
  const lines = sales.map((sale) => {
    const qty = Math.max(1, Number(sale?.qty) || 1);
    const unit = Number(sale?.unitPrice) || 0;
    return {
      itemId: sale?.itemId || null,
      // A sale calls it `itemName`, an invoice line calls it `name`. One reader
      // for both, so the drawing does not care which document it is making.
      name: String(sale?.itemName || sale?.name || "Item"),
      qty,
      unitLabel: `${qty} × ${formatMoney(unit, currency)}`,
      total: qty * unit,
      totalLabel: formatMoney(qty * unit, currency),
      note: String(sale?.note || "").trim(),
    };
  });
  const total = lines.reduce((n, l) => n + l.total, 0);
  return { lines, total, totalLabel: formatMoney(total, currency) };
}

const INK = "#2C1810";
const MUTED = "#7A5A42";
const GROUND = "#FAF8F4";
const HAIRLINE = "#E4DCD2";

/** Wrap on measured width, not on a guessed character count. */
function wrap(ctx, text, maxWidth) {
  const words = String(text).split(/\s+/).filter(Boolean);
  if (!words.length) return [""];
  const lines = [];
  let line = words[0];
  for (const word of words.slice(1)) {
    const next = line + " " + word;
    if (ctx.measureText(next).width <= maxWidth) line = next;
    else { lines.push(line); line = word; }
  }
  lines.push(line);
  return lines;
}

/** A rounded rectangle path. `ctx.roundRect` is too new for the Android builds
 *  this ships to, so the arcs are drawn by hand. */
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

const font = (weight, size) => `${weight} ${size}px "DM Sans", system-ui, sans-serif`;

/**
 * Draw the receipt and hand back a PNG blob.
 *
 * Always light, whatever theme the app is in. A receipt is a document that
 * leaves the phone and may be printed; a near-black rectangle is not what
 * someone wants in their WhatsApp, and it is not the app's surface any more
 * once it has been sent.
 *
 * Drawn at 2x and declared at 1x so it is crisp when a phone opens it full
 * screen and when it previews in a chat.
 */
export async function drawReceipt({
  business, sales, ownerName, bitmapByItemId,
  // Everything below is what makes the same engine draw an INVOICE. A second
  // canvas routine for a document that differs by a heading, a name and a due
  // date would drift from this one within a session.
  kind = "RECEIPT",
  number,
  customerName,
  customerContact,
  dueAt,
  paidAt,
  footerNote,
}) {
  const list = Array.isArray(sales) ? sales : [sales];
  const currency = business?.currency;
  const doc = receiptLines(list, currency);
  const photos = bitmapByItemId || new Map();

  // Wait for the web font, or the first receipt of a session silently renders
  // in the fallback face while every later one uses DM Sans.
  try { await document.fonts?.ready; } catch { /* no font API, fall through */ }

  const W = 720;
  const PAD = 48;
  const SCALE = 2;
  const inner = W - PAD * 2;
  const THUMB = 72;

  // Measure first, then size the canvas. A name can wrap, and with several
  // lines a fixed height would either clip the last one or leave a gap under a
  // short basket.
  const probe = document.createElement("canvas").getContext("2d");
  const measured = doc.lines.map((l) => {
    const hasPhoto = photos.has(l.itemId);
    probe.font = font(600, 26);
    const nameLines = wrap(probe, l.name, inner - (hasPhoto ? THUMB + 20 : 0) - 160);
    probe.font = font(400, 20);
    const noteLines = l.note ? wrap(probe, l.note, inner - (hasPhoto ? THUMB + 20 : 0)) : [];
    const textH = nameLines.length * 34 + 28 + noteLines.length * 26;
    return { ...l, hasPhoto, nameLines, noteLines, h: Math.max(hasPhoto ? THUMB : 0, textH) + 22 };
  });

  // Summed from the same steps the drawing takes, not a trailing constant. The
  // first version guessed one and left the footer baseline 6px from the bottom
  // edge, so the descender on "Thank you" was cut off the finished PNG.
  // The header grows with the optional invoice lines, so it is measured rather
  // than fixed. A constant here is what clipped the footer last time.
  const HEAD = 210 + (customerName ? 30 : 0) + (dueAt ? 28 : 0);
  const GAP = 34;
  const bodyH = measured.reduce((n, m) => n + m.h, 0);
  const TOTALS = 58 + 64;
  const FOOT = 44 + 28;
  const H = HEAD + GAP + bodyH + TOTALS + FOOT;

  const canvas = document.createElement("canvas");
  canvas.width = W * SCALE;
  canvas.height = H * SCALE;
  const ctx = canvas.getContext("2d");
  ctx.scale(SCALE, SCALE);

  ctx.fillStyle = GROUND;
  ctx.fillRect(0, 0, W, H);

  // The shop's own colour along the top edge, which is the same identity the
  // Home list is built on.
  ctx.fillStyle = /^#[0-9a-f]{6}$/i.test(business?.color || "") ? business.color : "#C17F5A";
  ctx.fillRect(0, 0, W, 10);

  let y = 76;
  ctx.textBaseline = "alphabetic";
  ctx.font = font(700, 34);
  ctx.fillStyle = INK;
  ctx.fillText((business?.emoji ? business.emoji + "  " : "") + String(business?.name || "Business"), PAD, y);

  y += 34;
  ctx.font = font(400, 22);
  ctx.fillStyle = MUTED;
  ctx.fillText(ownerName ? `Sold by ${ownerName}` : "Receipt", PAD, y);

  y += 44;
  ctx.font = font(600, 20);
  ctx.fillStyle = MUTED;
  ctx.fillText(kind, PAD, y);
  ctx.font = font(400, 20);
  ctx.textAlign = "right";
  ctx.fillText(new Date(list[0]?.occurredAt || Date.now()).toLocaleDateString("en-GB", {
    day: "numeric", month: "long", year: "numeric",
  }), W - PAD, y);
  ctx.textAlign = "left";

  y += 26;
  ctx.font = font(600, 22);
  ctx.fillStyle = INK;
  ctx.fillText(number || receiptNumber(list), PAD, y);

  if (customerName) {
    y += 30;
    ctx.font = font(400, 20);
    ctx.fillStyle = MUTED;
    ctx.fillText("For", PAD, y);
    ctx.font = font(600, 22);
    ctx.fillStyle = INK;
    ctx.fillText(customerName + (customerContact ? `  ·  ${customerContact}` : ""), PAD + 46, y);
  }
  if (dueAt) {
    y += 28;
    ctx.font = font(400, 20);
    ctx.fillStyle = MUTED;
    ctx.fillText(`Due ${new Date(dueAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}`, PAD, y);
  }

  y += 30;
  ctx.fillStyle = HAIRLINE;
  ctx.fillRect(PAD, y, inner, 1);

  // ── the lines ──────────────────────────────────────────────────────────────
  y += GAP;
  for (const m of measured) {
    const top = y - 20;
    const textLeft = m.hasPhoto ? PAD + THUMB + 20 : PAD;

    if (m.hasPhoto) {
      ctx.save();
      roundRect(ctx, PAD, top, THUMB, THUMB, 12);
      ctx.clip();
      const bmp = photos.get(m.itemId);
      // Cover, not stretch: a portrait photo squashed into a square is worse
      // than a cropped one.
      const side = Math.min(bmp.width, bmp.height);
      ctx.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, PAD, top, THUMB, THUMB);
      ctx.restore();
    }

    let ly = y;
    ctx.font = font(600, 26);
    ctx.fillStyle = INK;
    for (const l of m.nameLines) { ctx.fillText(l, textLeft, ly); ly += 34; }

    ctx.font = font(400, 22);
    ctx.fillStyle = MUTED;
    ctx.fillText(m.unitLabel, textLeft, ly);

    // The line's own total, right-aligned on the same baseline as its name, so
    // a basket reads as a column of amounts rather than a paragraph.
    ctx.font = font(600, 26);
    ctx.fillStyle = INK;
    ctx.textAlign = "right";
    ctx.fillText(m.totalLabel, W - PAD, y);
    ctx.textAlign = "left";

    ly += 26;
    if (m.noteLines.length) {
      ctx.font = font(400, 20);
      ctx.fillStyle = MUTED;
      for (const l of m.noteLines) { ctx.fillText(l, textLeft, ly); ly += 26; }
    }

    y += m.h;
  }

  ctx.fillStyle = HAIRLINE;
  ctx.fillRect(PAD, y - 20, inner, 1);

  // ── the total ──────────────────────────────────────────────────────────────
  y += 38;
  ctx.font = font(500, 26);
  ctx.fillStyle = MUTED;
  // "Total paid" on a receipt is a statement of fact. On an unpaid invoice it
  // would be a false one, so the label follows what the document actually is.
  const totalLabel = kind === "INVOICE"
    ? (paidAt ? "Paid in full" : "Amount due")
    : "Total paid";
  ctx.fillText(doc.lines.length > 1 ? `${totalLabel} · ${doc.lines.length} items` : totalLabel, PAD, y);
  ctx.font = font(700, 40);
  ctx.fillStyle = INK;
  ctx.textAlign = "right";
  ctx.fillText(doc.totalLabel, W - PAD, y + 4);
  ctx.textAlign = "left";

  y += 64;
  ctx.fillStyle = HAIRLINE;
  ctx.fillRect(PAD, y, inner, 1);

  y += 44;
  ctx.font = font(400, 20);
  ctx.fillStyle = MUTED;
  ctx.fillText(footerNote || "Thank you", PAD, y);
  ctx.textAlign = "right";
  ctx.fillText("Recorded with BizTrack", W - PAD, y);
  ctx.textAlign = "left";

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("The receipt could not be created."));
    }, "image/png");
  });
}

/**
 * Hand the PNG to whatever the phone shares with, or fall back to a download.
 *
 * `navigator.share` needs transient activation, which an await can outlive. The
 * caller therefore draws the receipt when the sheet OPENS and passes a blob
 * that is already made, so the tap that shares has nothing to wait for. That
 * also means the owner sees what they are about to send before they send it,
 * which is right for a document going to a customer.
 */
export async function shareReceipt({ blob, filename, title }) {
  const file = new File([blob], filename, { type: "image/png" });
  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title });
      return "shared";
    }
  } catch (err) {
    // Dismissing the share sheet rejects. That is a choice, not a failure, and
    // falling through to a download would hand someone a file they just
    // declined to send.
    if (err?.name === "AbortError") return "cancelled";
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoking immediately can cancel the download on some Android builds.
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return "downloaded";
}
