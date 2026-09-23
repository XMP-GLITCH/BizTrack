import { useState, useEffect, useRef, lazy, Suspense } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Archive, ArrowLeft, Award, BarChart2, Camera, Check, CheckCircle2, ChevronDown, ChevronRight, Cloud, Coins, DollarSign, Download, Home, ImagePlus, Info, Lock, LogOut, Moon, Package, Plus, PlusSquare, RefreshCw, ScrollText, Settings, Share, Shield, Smartphone, Sparkles, Store, Sun, Trash2, TrendingUp, Upload, X } from "lucide-react";
import { useStore, selectBusinesses, selectInventory, readSnapshot, STORAGE_KEY } from "./store/useStore";
import { formatMoney, formatMoneyParts, toMinor, toMajor, marginPercent, CURRENCIES } from "./domain/money.js";
import { calcBizStats, calcPortfolioStats, portfolioFinding, inventoryHealth, stockValue, STOCK, startOfMonth, weeklyProfit, monthlyProfit, itemPerformance, saleRevenue, saleCost, saleProfit, saleDiscount, getStatus, liveSales } from "./domain/stats.js";
import { deriveInventory, hasStockDiscrepancy } from "./domain/inventory.js";
import { parseBackup, migrateState, verifyMigration } from "./domain/migrate.js";
import { invoiceTotal } from "./domain/schema.js";
import { newId } from "./domain/ids.js";
import { isBackendConfigured } from "./backend/supabase.js";
import { useAuth } from "./backend/useAuth.js";
import { useSync } from "./backend/useSync.js";
import { useClaim } from "./backend/useClaim.js";
import { signOut, deleteAccount, rememberSignedIn, recordSetupComplete } from "./backend/auth.js";
import AuthScreen from "./screens/AuthScreen.jsx";
import LegalScreen from "./screens/LegalScreen.jsx";
// Recharts is the biggest dependency after supabase-js and is needed on one
// screen. Splitting it out keeps it off the first paint, which on a low-end
// Android over metered data is the load that actually costs the user money.
const ProfitChart = lazy(() => import("./screens/ProfitChart.jsx"));
// Its own lazy module, but Recharts is already a shared vendor chunk, so the
// ring costs the bundle nothing beyond its own few lines.
// Not lazy and not Recharts: a proportional stacked bar is flexbox, so the
// "profit by business" section no longer pulls a chart library at all.
// `ShareRing.jsx` is still on disk while the owner compares the two.
import ShareBar from "./screens/ShareBar.jsx";
import ClaimScreen from "./screens/ClaimScreen.jsx";
import ConsentScreen from "./screens/ConsentScreen.jsx";
import { DOCUMENTS, LEGAL_VERSION, ENTITY } from "./legal/documents.js";
import { track, startAnalytics, setAppVersion, getConsent, setConsent, flush as flushAnalytics } from "./analytics/analytics.js";
import { installErrorCapture } from "./analytics/errors.js";
import { useRegisterSW } from "virtual:pwa-register/react";
import { requestNotificationPermission, sendLowStockNotification } from "./utils/notificationService";
import { buildBackup, saveBackupFile, pickBackupFile, emergencyExport } from "./utils/transfer.js";
import { savePhoto, deletePhoto, deleteAllPhotos, requestPersistence } from "./utils/photos.js";
import { sendFeedback, flushFeedback } from "./backend/feedback.js";
import { resolvePhotoUrl, resolvePhotoBlob, deleteRemotePhoto } from "./backend/photoSync.js";
import { drawReceipt, shareReceipt, receiptNumber } from "./utils/receipt.js";
import { summarizeLocal } from "./backend/claim.js";
/* ─── INITIAL DATA ─────────────────────────────────────────────────────────── */
/* White-on-heroTint() ratio in the comment; nothing here is below 6.16. */
const COLORS = [
  "#C17F5A", "#8B6914", "#7A9B76", "#B85C5C", // 6.31  8.65  6.16  7.88
  "#5C7A8B", "#9B5C8B", "#5C8B6E", "#8B7A5C", // 8.06  8.42  7.30  7.52
  "#8C9645", "#6A9647", "#479E7E", "#479E9E", // 6.26  6.67  6.43  6.29
  "#475D9E", "#53479E", "#9E4789", "#9E4767", // 10.05 11.32 9.29  9.54
];
const COLOR_NAMES = [
  "Terracotta", "Gold", "Sage", "Rose", "Slate", "Plum", "Mint", "Sand",
  "Citron", "Leaf", "Jade", "Teal", "Indigo", "Violet", "Magenta", "Berry",
];
const CATEGORIES = [
  "Accessories", "Art & crafts", "Bakery", "Beauty", "Cleaning & laundry",
  "Construction & trades", "Crochet", "Digital products", "Electronics",
  "Events & decoration", "Farming & livestock", "Fashion", "Food",
  "General retail", "Groceries", "Hair & barbering", "Health & pharmacy",
  "Home & furniture", "Jewelry", "Phone & computer repair", "Photography & video",
  "Printing & design", "Shoes & bags", "Stationery & books", "Tailoring",
  "Thrift", "Transport & delivery", "Tutoring & lessons", "Wholesale",
];

const QUICK_EMOJIS = ["🛍️", "🏪", "🍱", "👗", "🧶", "📱"];

const EMOJIS = [
  "🏪", "🛍️", "📦",                      // shop, retail, wholesale
  "🍱", "🍞", "🧁", "☕", "🥬",            // food
  "💄", "🧴", "✂️", "💈",                 // beauty, hair
  "👗", "👜", "👟", "💍", "📿", "🎀",      // fashion, accessories
  "🧶", "🪡", "🎨", "✨",                  // making
  "📱", "💻", "🔌", "🔧",                  // phones, electronics, repair
  "🖨️", "📷", "📚", "✏️",                 // print, photo, teaching
  "🔨", "🧱", "🧼",                        // trades, cleaning
  "🚚", "🚗",                              // transport
  "🌾", "🐓", "🌿", "🌸",                  // farming, produce
  "💊", "🎉",                              // health, events
];
const VERSION = "v1.5.9";
const BUILD_DATE = "2026.05.09";

const UPDATE_LOG = [
  { version: "v1.5.9", date: "May 9, 2026", title: "Workflow Fixes", changes: ["Fixed a bug where the delete modal persisted after removing a business.", "Optimized state transitions during data cleanup."] },
  { version: "v1.5.8", date: "May 9, 2026", title: "Refined Experience", changes: ["Streamlined Home screen typography.", "Removed decorative emojis for a more professional dashboard look."] },
  { version: "v1.5.5", date: "May 9, 2026", title: "Emergency Lock Bypass", changes: ["Integrated Data Rescue directly into the PIN screen.", "Allows recovery of lost data even when locked out.", "Improved guidance for account restoration."] },
  { version: "v1.5.4", date: "May 9, 2026", title: "Security & Recovery Fixes", changes: ["Hardened email recovery logic with better validation.", "Improved error handling for EmailJS delivery failures.", "Added clearer guidance for users stuck on the PIN screen."] },
  { version: "v1.5.3", date: "May 9, 2026", title: "Emergency Data Rescue", changes: ["Implemented automatic restoration for data stuck in old storage versions.", "Added manual 'Rescue' tool on onboarding screen for absolute data safety.", "Hardened storage reliability for existing users."] },
  { version: "v1.5.2", date: "May 9, 2026", title: "Smart Notifications", changes: ["Real-time low-stock alerts when sales drop inventory below threshold.", "Background update notifications even when the app is closed.", "Standardized PWA branding and theme-color support."] },
  { version: "v1.4.5", date: "May 8, 2026", title: "About & Updates", changes: ["Added dedicated About section with feature list.", "Integrated Update Log for better transparency.", "Standardized versioning across the app."] },
  { version: "v1.4.3", date: "May 8, 2026", title: "Onboarding & Personas", changes: ["Refined onboarding flow for new users.", "Added premium Persona picker in Account settings.", "Improved local data storage reliability."] },
  { version: "v1.4.1", date: "May 8, 2026", title: "UI Polish", changes: ["Decoupled toast notifications from modals.", "Generalized sale entry labels for craft businesses.", "Fixed layout issues on narrow screens."] },
  { version: "v1.4.0", date: "May 7, 2026", title: "Performance & Security", changes: ["Hardened security logic for PIN lock.", "Optimized PWA installation prompts.", "Audit and fix for critical runtime crashes."] },
  { version: "v1.3.0", date: "Apr 28, 2026", title: "Dark Mode & Charts", changes: ["Full Dark Mode support implemented.", "Enhanced Analytics with interactive Recharts.", "Improved profit margin visualizations."] },
  { version: "v1.2.0", date: "Apr 15, 2026", title: "Security First", changes: ["Added 4-digit PIN protection.", "Implemented SHA-256 hashed recovery key system."] },
  { version: "v1.1.0", date: "Mar 30, 2026", title: "Data Portability", changes: ["Added CSV export for sales and inventory data.", "Improved currency formatting for multiple regions."] },
  { version: "v1.0.0", date: "Mar 19, 2026", title: "Genesis", changes: ["Initial release with multi-business tracking.", "Inventory and basic sales management."] },
];

/* ─── HELPERS ──────────────────────────────────────────────────────────────── */
// Amounts are integers in a currency's minor unit. Business-scoped call sites
// pass that business's currency; portfolio-level totals fall back to the
// account default.
const fmt = (minor, currency) => formatMoney(minor, currency || useStore.getState().currency);

const STATUS_STYLE = {
  profitable: { bg: "var(--success-bg)", text: "var(--success)", label: "Profitable" },
  "break-even": { bg: "var(--warning-bg)", text: "var(--warning)", label: "Break Even" },
  losing: { bg: "var(--danger-bg)", text: "var(--danger)", label: "Losing" },
};

/** "3 Jun" -- short enough to sit inside a sub-line, and UTC because every
 *  `occurredAt` in this app is, so the label never disagrees with the filter
 *  that put the record in front of you. */
const shortDate = (iso) => {
  const d = String(iso || "").slice(0, 10);
  if (!d) return "";
  return new Date(d + "T00:00:00.000Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
};

const dateLabel = (occurredAt) => {
  const d = String(occurredAt || "").slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (d === today) return "Today";
  if (d === yesterday) return "Yesterday";
  // Was `return d`, which put "2026-09-14" on a sales row. That is a developer
  // artefact on a screen read by a shopkeeper, and `shortDate` -- written this
  // week and sitting just below -- already formats it. Two date formatters
  // where there should be one.
  return shortDate(d);
};


const num = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const downloadJson = (data, filename) => {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

/** Hands back the verbatim pre-upgrade copy of the user's data. */
const downloadSnapshot = (notify = () => {}) => {
  const snapshot = readSnapshot();
  if (!snapshot) {
    notify("No pre-upgrade backup was found on this device.", "error");
    return false;
  }
  downloadJson(snapshot, `BizTrack_PreUpgrade_Backup_${String(snapshot.savedAt).slice(0, 10)}.json`);
  return true;
};

/**
 * The whole-books CSV report.
 *
 * This was a hundred-line handler written inline in an onClick, which is why it
 * could not be moved when Export ended up on the wrong screen: a function that
 * only exists inside a JSX attribute belongs to that attribute.
 *
 * It is NOT a backup, and the row that calls it now says so. A backup is
 * `buildBackup` and restores; this is a spreadsheet to read or to send to
 * whoever does your books, and `parseBackup` cannot read it.
 */
const exportCsvReport = ({ businesses, userName, notify = () => {} }) => {
  if (businesses.length === 0) {
    notify("There is nothing to export yet.", "error");
    return;
  }

  const esc = (v) => {
    const str = String(v ?? "");
    return str.includes(",") || str.includes('"') || str.includes("\n") ? `"${str.replace(/"/g, '""')}"` : str;
  };

  const rows = [];
  const sep = () => rows.push([]);
  const header = (title) => { sep(); rows.push([`═══ ${title.toUpperCase()} ═══`]); sep(); };

  // ── REPORT HEADER ──
  rows.push(["BizTrack Business Report"]);
  rows.push([`Generated: ${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}`]);
  rows.push([`Owner: ${userName || "N/A"}`]);
  rows.push([`Version: ${VERSION}`]);

  // ── PORTFOLIO SUMMARY ──
  header("Portfolio Summary");
  const totals = calcPortfolioStats(businesses);
  rows.push(["Total Businesses", businesses.length]);
  rows.push(["Total Inventory Items", businesses.reduce((a, b) => a + b.items.filter((i) => !i.deletedAt).length, 0)]);
  rows.push(["Total Sales Recorded", businesses.reduce((a, b) => a + liveSales(b).length, 0)]);
  rows.push(["Total Revenue", fmt(totals.revenue)]);
  rows.push(["Total Cost of Goods", fmt(totals.cogs)]);
  rows.push(["Total Profit", fmt(totals.profit)]);
  rows.push(["Overall Margin", totals.margin + "%"]);

  // ── PER BUSINESS BREAKDOWN ──
  businesses.forEach((biz, idx) => {
    const cur = biz.currency;
    const stats = calcBizStats(biz);
    const inventory = deriveInventory(biz).filter((i) => !i.deletedAt);

    header(`Business ${idx + 1}: ${biz.name}`);
    rows.push(["Category", biz.category || "N/A"]);
    rows.push(["Currency", cur]);
    rows.push(["Status", STATUS_STYLE[getStatus(stats.margin)]?.label || ""]);
    rows.push(["Revenue", fmt(stats.revenue, cur)]);
    rows.push(["Cost of Goods", fmt(stats.cogs, cur)]);
    rows.push(["Profit", fmt(stats.profit, cur)]);
    rows.push(["Margin", stats.margin + "%"]);
    rows.push(["Inventory Items", inventory.length]);
    rows.push(["Sales Count", stats.salesCount]);

    if (inventory.length > 0) {
      sep();
      rows.push(["── Inventory ──"]);
      rows.push(["Item Name", "In Stock", "Sold", "Avg Unit Cost", "Selling Price", "Stock Value", "Potential Revenue"]);
      inventory.forEach((item) => {
        rows.push([
          esc(item.name),
          item.qty,
          item.sold,
          fmt(item.avgCost, cur),
          fmt(item.unitPrice, cur),
          fmt(item.avgCost * Math.max(item.qty, 0), cur),
          fmt(item.unitPrice * Math.max(item.qty, 0), cur),
        ]);
      });
    }

    const bizSales = liveSales(biz);
    if (bizSales.length > 0) {
      sep();
      rows.push(["── Sales History ──"]);
      rows.push(["Date", "Item", "Qty", "Unit Price", "Revenue", "Cost", "Profit", "Discount", "Note"]);
      bizSales.forEach((sale) => {
        rows.push([
          String(sale.occurredAt).slice(0, 10),
          esc(sale.itemName),
          sale.qty,
          fmt(sale.unitPrice, cur),
          fmt(saleRevenue(sale), cur),
          fmt(saleCost(sale), cur),
          fmt(saleProfit(sale), cur),
          saleDiscount(sale) ? fmt(saleDiscount(sale), cur) : "-",
          esc(sale.note || ""),
        ]);
      });
    }
  });

  sep();
  rows.push(["End of Report: BizTrack " + VERSION]);

  const csvString = rows.map((r) => r.join(",")).join("\n");
  const blob = new Blob(["\uFEFF" + csvString], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", `BizTrack_Report_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  notify("Report saved to your downloads.");
};


/** Per-unit profit and margin for an inventory item, guarding zero prices. */
const itemEconomics = (item) => ({
  profit: item.unitPrice - item.avgCost,
  margin: marginPercent(item.unitPrice, item.avgCost),
});

/* ─── SECURITY HELPERS ─────────────────────────────────────────────────────── */
const hashPin = async (pin) => {
  const encoder = new TextEncoder();
  const data = encoder.encode(pin);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
};

const genRecoveryKey = () => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // No I, O, 0, 1 for clarity
  let res = "";
  for(let i=0; i<8; i++) {
    if (i === 4) res += "-";
    res += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return res;
};

const genEmailCode = () => Math.floor(100000 + Math.random() * 900000).toString();

// EmailJS Configuration (User should fill these in)
const EMAILJS_CONFIG = {
  SERVICE_ID: "service_56drgpc",
  TEMPLATE_ID: "template_hpafy7v",
  PUBLIC_KEY: "dnWW8IiQzni2_D7eN",
};

const validateEmail = (email) => {
  return String(email)
    .toLowerCase()
    .match(/^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/);
};

const sendResetEmail = async (email, name, code, notify = () => {}) => {
  const recipient = String(email || "").trim();
  if (!recipient || !validateEmail(recipient)) {
    console.error("[BizTrack] Invalid recipient email:", recipient);
    notify("The email address on this account is missing or not valid.", "error");
    return false;
  }

  if (EMAILJS_CONFIG.PUBLIC_KEY === "YOUR_PUBLIC_KEY" || !EMAILJS_CONFIG.PUBLIC_KEY) {
    console.warn("EmailJS not configured. Simulating email send...");
    notify("Reset code " + code + " (simulated send to " + recipient + ")");
    return true; 
  }
  
  if (!window.emailjs) {
    notify("Email recovery needs an internet connection. Use your 8-character Recovery Key instead.", "error");
    return false;
  }

  try {
    const res = await window.emailjs.send(
      EMAILJS_CONFIG.SERVICE_ID,
      EMAILJS_CONFIG.TEMPLATE_ID,
      {
        to_email: recipient,
        to_name: name || "Business Owner",
        reset_code: code,
      },
      EMAILJS_CONFIG.PUBLIC_KEY
    );
    
    if (res.status === 200) {
      notify("Email sent. Check your inbox, and your spam folder.");
      return true;
    }
    return false;
  } catch (err) {
    console.error("EmailJS Error:", err);
    // Handle the specific 'recipients address empty' error more gracefully
    const errMsg = err.text || err.message || "Unknown error";
    if (errMsg.toLowerCase().includes("recipient")) {
       notify("That address was rejected by our mail service. Use your 8-character Recovery Key instead.", "error");
    } else {
       notify(`Email failed: ${errMsg}`, "error");
    }
    return false;
  }
};

/* ─── ROOT ─────────────────────────────────────────────────────────────────── */

/* ─── INSTALL PROMPT ────────────────────────────────────────────────────────── */
function InstallPrompt({ deferredPrompt, setDeferredPrompt, raised, inline = false }) {
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(true);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const isStandAloneMatch = window.matchMedia('(display-mode: standalone)').matches;
    const isIOSStandalone = window.navigator.standalone === true;
    setIsStandalone(isStandAloneMatch || isIOSStandalone);
    if (isStandAloneMatch || isIOSStandalone) return;
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIOS(isIosDevice);
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') setDeferredPrompt(null);
    }
  };

  if (isStandalone || dismissed) return null;
  if (!deferredPrompt && !isIOS) return null;

  return (
    <div
      className={inline ? "" : "bt-install" + (raised ? " bt-raised" : "")}
      style={inline
        ? { position: "static", background: "rgba(255,255,255,0.05)", borderRadius: 16, padding: "14px 16px", border: "1px solid rgba(255,255,255,0.12)", display: "flex", gap: 12, alignItems: "flex-start", textAlign: "left" }
        : { position: "absolute", bottom: raised ? "calc(148px + env(safe-area-inset-bottom))" : "calc(90px + env(safe-area-inset-bottom))", left: 24, right: 24, background: "var(--card-bg)", borderRadius: 16, padding: "14px 16px", boxShadow: "var(--shadow-float)", border: "1px solid var(--border-color)", zIndex: 100, display: "flex", gap: 12, alignItems: "flex-start" }}>
      {/* Nothing to dismiss when it is part of the page rather than floating
          over it. */}
      {!inline && (
        <button onClick={() => setDismissed(true)} aria-label="Dismiss" style={{ position: "absolute", top: 8, right: 8, background: "none", border: "none", color: "var(--text-secondary)", cursor: "pointer", padding: 4 }}>
          <X size={16} />
        </button>
      )}
      <div style={{ background: inline ? "rgba(255,255,255,0.08)" : "var(--control-bg)", borderRadius: 12, padding: 10, flexShrink: 0, color: "var(--warning)" }}>
        <Download size={24} />
      </div>
      <div style={{ flex: 1, paddingRight: 16 }}>
        <p style={{ fontSize: 14, fontWeight: 700, color: inline ? "var(--focus-ink)" : "var(--text-primary)", margin: "0 0 4px" }}>Install BizTrack</p>
        {isIOS ? (
          <p className="bt-install-desc" style={{ fontSize: 12, color: inline ? "rgba(255,255,255,0.7)" : "var(--text-secondary)", margin: 0, lineHeight: 1.4 }}>
            Must use <strong>Safari</strong> to install: Tap <Share size={12} style={{ display: "inline", verticalAlign: "middle" }} /> then <strong>Add to Home Screen</strong> <PlusSquare size={12} style={{ display: "inline", verticalAlign: "middle" }} />
          </p>
        ) : (
          <>
            <p className="bt-install-desc" style={{ fontSize: 12, color: inline ? "rgba(255,255,255,0.7)" : "var(--text-secondary)", margin: "0 0 8px", lineHeight: 1.4 }}>
              Keeps your books reachable offline, and safe when you switch to the installed app later.
            </p>
            <button onClick={handleInstallClick} style={{ background: inline ? "transparent" : "var(--text-primary)", color: inline ? "var(--focus-ink)" : "var(--bg-primary)", border: inline ? "1px solid rgba(255,255,255,0.28)" : "none", padding: "6px 14px", borderRadius: 12, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
              Install App
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/* ─── DATA RESCUE UTILITY ─────────────────────────────────────────────────── */
// Single source of truth lives in the store.
const CURRENT_STORAGE_KEY = STORAGE_KEY;
const LEGACY_STORAGE_KEYS = ['biztrack-storage-v4', 'biztrack-storage-v2', 'biztrack-storage'];

function useRescueData(hydrated, notify = () => {}) {
  const [isRescuing, setIsRescuing] = useState(false);

  /**
   * Adopt a recovered blob.
   *
   * Rescued data is nearly always in the pre-ledger shape, so it MUST go
   * through the same migration as everything else. Writing it into the store
   * as-is leaves `items` and `unitPrice` undefined, and the app renders every
   * business with no inventory and zero revenue -- indistinguishable from total
   * data loss, triggered by the one button a panicking user would press.
   */
  const adoptRescuedState = (state) => {
    const migrated = migrateState(state);
    const report = verifyMigration(state?.businesses, migrated.businesses);
    if (!report.ok) console.error("[BizTrack] Rescue check found discrepancies:", report.issues);
    useStore.setState({ ...migrated, onboardingComplete: true });
    return migrated.businesses.length;
  };

  const checkRescue = async (manual = false) => {
    const current = useStore.getState();
    if (current.onboardingComplete && !manual) return;

    if (manual) setIsRescuing(true);
    console.log("[BizTrack] Running Emergency Data Rescue...");

    // 1. Check LocalStorage. The automatic pass only looks at LEGACY keys --
    // scanning the live key would resurrect data the user just signed out of.
    // A manual rescue (user tapped the button) may scan the live key too.
    const keys = manual ? [...LEGACY_STORAGE_KEYS, CURRENT_STORAGE_KEY] : LEGACY_STORAGE_KEYS;
    for (const key of keys) {
      try {
        const raw = localStorage.getItem(key);
        if (raw) {
          const data = JSON.parse(raw);
          const state = data.state;
          if (state && state.businesses?.length > 0) {
            console.log(`[BizTrack] Found data in LS: ${key}`);
            const count = adoptRescuedState(state);
            if (manual) notify(`Found and restored ${count} business${count === 1 ? "" : "es"}.`);
            setIsRescuing(false);
            return true;
          }
        }
      } catch { /* key unreadable, try the next one */ }
    }

    // 2. Check Raw IndexedDB
    return new Promise((resolve) => {
      try {
        const dbRequest = indexedDB.open('keyval-store');
        dbRequest.onerror = () => resolve(false);
        dbRequest.onsuccess = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains('keyval')) {
            if (manual) notify("No backup found in the older storage.", "error");
            setIsRescuing(false);
            return resolve(false);
          }
          
          const transaction = db.transaction('keyval', 'readonly');
          const store = transaction.objectStore('keyval');
          let found = false;

          (manual ? [...LEGACY_STORAGE_KEYS, CURRENT_STORAGE_KEY] : LEGACY_STORAGE_KEYS).forEach(key => {
            const getReq = store.get(key);
            getReq.onsuccess = () => {
              const raw = getReq.result;
              if (raw && !found) {
                try {
                  const data = JSON.parse(raw);
                  const state = data.state;
                  if (state && state.businesses?.length > 0) {
                    console.log(`[BizTrack] Found data in IDB: ${key}`);
                    const count = adoptRescuedState(state);
                    found = true;
                    if (manual) notify(`Found and restored ${count} business${count === 1 ? "" : "es"} from older storage.`);
                    setIsRescuing(false);
                    resolve(true);
                  }
                } catch { /* not valid JSON, skip */ }
              }
            };
          });
          
          transaction.oncomplete = () => {
            if (!found) {
               if (manual) notify("Nothing recoverable was found on this device.", "error");
               setIsRescuing(false);
               resolve(false);
            }
          };
        };
      } catch {
        setIsRescuing(false);
        resolve(false);
      }
    });
  };

  useEffect(() => {
    if (hydrated) checkRescue();
  }, [hydrated]);

  return { isRescuing, checkRescue };
}

export default function BizTrack() {
  /**
   * These two are declared HERE, above `useRegisterSW`, and that is not
   * arbitrary. `onNeedReload` below is stored once on the first render and
   * kept for the life of the app, so a setter declared further down would be
   * in its temporal dead zone at the moment the callback is created. That is
   * the exact fault this project already fixed once, in `checkUpdates`
   * reaching for a `showToast` declared 150 lines later -- which never threw
   * only because nothing happened to call it during the first render.
   * Declaring them before their caller makes it a rule instead of an
   * accident.
   */
  const [updateProgress, setUpdateProgress] = useState(0);
  const [isUpdating, setIsUpdating] = useState(false);

  useRegisterSW({
    /**
     * `registerType: 'autoUpdate'`, so there is no "Update now" button any
     * more: the new worker activates itself and this fires. Supplying
     * `onNeedReload` REPLACES the library's bare `window.location.reload()`,
     * which is the point -- an app that silently restarts itself reads as a
     * crash on a mid-range Android, and this audience is standing at a stall
     * when it happens.
     *
     * The wait is short on purpose. `cleanupOutdatedCaches()` has already
     * deleted the previous precache by now, so the running page is holding
     * hashed chunk URLs that no longer resolve. 700ms is long enough to read
     * four words and far too short to reach the one lazily-imported chunk.
     */
    onNeedReload() {
      setIsUpdating(true);
      setUpdateProgress(100);
      setTimeout(() => window.location.reload(), 700);
    },
    onRegistered(r) {
      console.log('SW Registered: ' + r)
    },
    onRegisterError(error) {
      console.log('SW registration error', error)
    },
  });

  const hydrated = true; // Since we are on LS, it's always technically hydrated after first tick

  // The toast and dialog live at the TOP of this component on purpose. Both
  // `useRescueData` below and `checkUpdates` call `showToast`, and a `const`
  // declared further down is in its temporal dead zone for them: it happened
  // to work only because neither runs during the first render. Declaring them
  // before their callers turns that accident into a rule the file enforces.
  const [activeToast, setActiveToast] = useState(null);
  const toastTimer = useRef(null);
  const [dialog, setDialog] = useState(null);
  
  const showToast = (msg, tone = "info") => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setActiveToast({ msg, tone });
    toastTimer.current = setTimeout(() => {
      setActiveToast(null);
      toastTimer.current = null;
    // Bad news gets longer on screen: it is usually a sentence to act on, not
    // an acknowledgement to glance at.
    }, tone === "error" ? 4200 : 1800);
  };

  /**
   * A real confirmation, as a promise, so a call site reads almost exactly like
   * the `confirm()` it replaces:
   *
   *     if (!(await ask({ title: "Sign out?" }))) return;
   *
   * The ten native confirms this replaces were guarding sign-out, deleting an
   * item, disabling the passcode and a three-step factory reset. Android offers
   * to suppress native dialogs after a few, and the browser will honour that,
   * which would have silently turned every one of those guards into a no-op on
   * the destructive path.
   */
  /**
   * The same machinery, resolving with what was typed instead of yes/no, so the
   * final `window.prompt` can go too. Cancel resolves null, which is exactly
   * what the prompt it replaces returned, so the call site is unchanged.
   */
  const askText = ({ title, body, placeholder = "", confirmLabel = "Continue" }) =>
    new Promise((resolve) => {
      setDialog({
        id: ++dialogSeq,
        title, body, confirmLabel, cancelLabel: "Cancel",
        freeText: true, placeholder,
        settle: (answer) => { setDialog(null); resolve(answer); },
      });
    });

  const ask = ({ title, body, confirmLabel = "Continue", cancelLabel = "Cancel", danger = false, requireTyped = null }) =>
    new Promise((resolve) => {
      setDialog({
        id: ++dialogSeq,
        title, body, confirmLabel, cancelLabel, danger, requireTyped,
        settle: (answer) => { setDialog(null); resolve(answer); },
      });
    });

  const { isRescuing, checkRescue } = useRescueData(hydrated, showToast);

  const [deferredPrompt, setDeferredPrompt] = useState(null);
  // `updateProgress` and `isUpdating` live at the top of this component, above
  // `useRegisterSW`. See the note there.

  // Session lives in React, not the persisted store: supabase-js already owns
  // session storage and refresh, and duplicating it is how you end up showing
  // someone as signed in against a token that expired days ago.
  const auth = useAuth();
  const [analyticsConsent, setAnalyticsConsentState] = useState(() => getConsent());
  const [justAccepted, setJustAccepted] = useState(false);
  const claim = useClaim(auth.userId);
  // Held until the user has said what should happen to books already on this
  // device. Pushing first and asking afterwards would make the question moot.
  const sync = useSync(auth.userId, { paused: claim.needed || claim.checking });

  useEffect(() => {
    setAppVersion(VERSION);
    startAnalytics();
    installErrorCapture();
    // Ask the browser not to evict this origin. Without it IndexedDB is "best
    // effort" and Chrome may clear it when the device runs low on space, which
    // here would mean a shop's product photos vanishing with no action by the
    // owner. It also covers localStorage, where the books are. Granted silently
    // for an installed PWA and declined silently otherwise, so it never
    // prompts and there is nothing to handle.
    requestPersistence();
    // Drain anything written while offline. On BOOT rather than only in the
    // sync loop, because that loop needs a signed-in user and a local-only
    // owner is exactly the person most likely to have something to say about
    // an app they have not signed up for.
    flushFeedback();
  }, []);

  // Chosen explicitly by the user on the sign-in screen; not persisted, so the
  // choice is re-offered next launch rather than silently stranding them local.
  
  useEffect(() => {
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      console.log("Install prompt captured!");
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);

  const checkUpdates = async (manual = false) => {
    if (manual) {
      setUpdateProgress(10);
      showToast("Searching for updates...");
    }
    
    if ('serviceWorker' in navigator) {
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg) {
          if (manual) {
            setUpdateProgress(40);
            await new Promise(r => setTimeout(r, 600)); // Visual buffer
            setUpdateProgress(70);
          }

          // This is the whole job now. Under `autoUpdate` a worker that finds
          // something new skips waiting, activates, and `onNeedReload` takes
          // it from there -- so there is nothing here to decide and no
          // "Update now" to raise. What used to follow was three branches
          // setting `needRefresh`, which can no longer become true.
          await reg.update();

          if (manual) {
            setUpdateProgress(100);
            setTimeout(() => {
              setUpdateProgress(0);
              // If an update HAD been found, the reload is already on its way
              // and this never renders. Saying so is only correct in the case
              // where nothing was found.
              if (!reg.waiting && !reg.installing) showToast("App is up to date!");
            }, 500);
          }
        }
      } catch (e) {
        console.error("SW Update Error:", e);
        setUpdateProgress(0);
      }
    }
  };

  useEffect(() => {
    // Immediate tasks after mount
    document.body.classList.add('app-loaded');
    // ...and then actually take it out. Hiding it left a fixed, full-screen
    // element sitting over the app at z-index 9999 for the rest of the session.
    setTimeout(() => document.getElementById('splash-screen')?.remove(), 600);

    // Request notification permission early
    requestNotificationPermission();

    // Defer non-critical update check to improve perceived startup speed
    const timeout = setTimeout(() => {
      checkUpdates();
    }, 2500);

    // Check on focus or visibility change (very aggressive)
    const handleCheck = () => {
      if (document.visibilityState === 'visible') checkUpdates();
    };
    window.addEventListener('focus', handleCheck);
    document.addEventListener('visibilitychange', handleCheck);

    // Periodic check every 10 minutes
    const interval = setInterval(() => checkUpdates(), 10 * 60 * 1000);

    return () => {
      window.removeEventListener('focus', handleCheck);
      document.removeEventListener('visibilitychange', handleCheck);
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, []);

  const storedBusinesses = useStore(s => s.businesses);
  const migrationFailed = useStore(s => s.migrationFailed);
  const migrationIssues = useStore(s => s.migrationIssues);
  const replaceBusinesses = useStore(s => s.replaceBusinesses);
  const storeAddBusiness = useStore(s => s.addBusiness);
  const storeDeleteBusiness = useStore(s => s.deleteBusiness);
  const storeAddItem = useStore(s => s.addItem);
  const storeDeleteItem = useStore(s => s.deleteItem);
  const storeRestockItem = useStore(s => s.restockItem);
  const storeUpdateItem = useStore(s => s.updateItem);
  const storeUpdateSale = useStore(s => s.updateSale);
  const storeDeleteSale = useStore(s => s.deleteSale);
  const storeAddInvoice = useStore(s => s.addInvoice);
  const storeUpdateInvoice = useStore(s => s.updateInvoice);
  const storeDeleteInvoice = useStore(s => s.deleteInvoice);
  const storeRecordSale = useStore(s => s.recordSale);

  // Safety catch for corrupted state. We must NOT early-return here -- dozens of
  // hooks follow, and bailing before them violates the rules of hooks and throws
  // on the next render. Instead fall back to an empty array so every hook below
  // still runs, and render the recovery screen after they have.
  const isStateCorrupt = !Array.isArray(storedBusinesses);
  // Soft-deleted records stay in the store so their tombstones can sync one day;
  // everything the UI touches goes through the live view.
  const businesses = isStateCorrupt ? [] : selectBusinesses({ businesses: storedBusinesses });
  if (isStateCorrupt) console.error("State Corruption Detected! Showing recovery screen.");

  const currency = useStore(s => s.currency);
  const setCurrency = useStore(s => s.setCurrency);
  const lowStockThreshold = useStore(s => s.lowStockThreshold);
  const setLowStockThreshold = useStore(s => s.setLowStockThreshold);

  const [screen, setScreen] = useState("home");

  // Screen views. `screen` is the only dependency: this records navigation,
  // not re-renders.
  useEffect(() => { track("screen.view", { screen }); }, [screen]);

  // So the auth screen opens on "Welcome back" next time rather than asking a
  // returning user to create an account they already have.
  useEffect(() => { if (auth.session) rememberSignedIn(); }, [auth.session]);
  const [activeBizId, setActiveBizId] = useState(null);
  const [bizTab, setBizTab] = useState("overview");
  const [modal, setModal] = useState(null); // null | "addBiz" | "addItem" | "restock" | "addSale" | "editBiz" | "deleteBiz" | "toast"
  const [restockItemId, setRestockItemId] = useState(null);
  const [photoItemId, setPhotoItemId] = useState(null);
  const [receiptSale, setReceiptSale] = useState(null);
  const [invoiceId, setInvoiceId] = useState(null);
  const userName = useStore(s => s.userName);
  const setUserName = useStore(s => s.setUserName);
  const isDarkMode = useStore(s => s.isDarkMode);
  const setIsDarkMode = useStore(s => s.setIsDarkMode);

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  const [analysisFrom, setAnalysisFrom] = useState("business");
  const activeBiz = businesses.find((b) => b.id === activeBizId) || null;

  const openBiz = (id, { stay = false } = {}) => {
    setActiveBizId(id);
    if (stay) return;               // select only -- used by the sale shortcut
    setBizTab("overview");
    setScreen("business");
  };

  /**
   * The deep analysis of one business, reachable from two places: the business
   * itself, and the portfolio overview. `from` is where Back returns to.
   *
   * It is a plain state value set by the ACTION that opened the screen, not a
   * ref read during render. That distinction matters here: the nav marker was
   * once given a remembered position the same way and it was impure, which the
   * lint tripwire caught. This is the legitimate version of the same idea.
   */
  const openAnalysis = (id, from = "business") => {
    setActiveBizId(id);
    setAnalysisFrom(from);
    setScreen("bizAnalysis");
  };

  const addBusiness = (data) => {
    storeAddBusiness(data);
    track("business.add", { count: businesses.length + 1 });
    showToast("Business added!");
  };

  const deleteBusiness = (id) => {
    storeDeleteBusiness(id);
    track("business.delete");
    setModal(null);
    setActiveBizId(null);
    setScreen("home");
    showToast("Business deleted.");
  };

  // Quantity and cost are recorded as an opening ledger entry rather than as
  // fields on the item, so later restocks at different prices can't rewrite them.
  const addInventoryItem = (bizId, item) => {
    storeAddItem(bizId, item);
    track("item.add");
    showToast("Item added to inventory!");
  };

  const restockInventoryItem = (bizId, itemId, addQty, newUnitCost) => {
    const item = activeBiz ? selectInventory({ businesses }, bizId).find((i) => i.id === itemId) : null;
    storeRestockItem(bizId, itemId, {
      qty: addQty,
      // Blank means "same price as before", which for a weighted average is the
      // current average -- it leaves the average untouched.
      unitCost: newUnitCost === null || newUnitCost === undefined ? (item?.avgCost ?? 0) : newUnitCost,
    });
    track("item.restock", { ok: newUnitCost !== null && newUnitCost !== undefined });
    showToast("Stock topped up!");
  };

  // A photo swap is an ordinary item edit, so it goes through `updateItem` and
  // picks up the `updatedAt` bump that sync will one day read. The blob itself
  // never touches the store; only its id does.
  const setItemPhoto = async (bizId, itemId, photoId, previousPhotoId) => {
    storeUpdateItem(bizId, itemId, { photoId: photoId || null });
    if (previousPhotoId && previousPhotoId !== photoId) {
      await deletePhoto(previousPhotoId);
      // And on the server, or replacing a photo would quietly keep paying to
      // store every version the owner ever rejected, under an id nothing points
      // at any more. Best effort and not awaited into anything the user waits
      // on: a failed remote delete leaves an orphan, not a broken app.
      if (auth.userId) deleteRemotePhoto(auth.userId, previousPhotoId);
    }
    track("item.photo", { ok: Boolean(photoId) });
  };

  const deleteInventoryItem = (bizId, itemId) => {
    storeDeleteItem(bizId, itemId);
    track("item.delete");
    showToast("Item removed.");
  };

  // Returns the sale it recorded, because the caller may need to put it on a
  // receipt, and the store already hands it back.
  const addSale = (bizId, sale) => {
    const { sale: recorded, item } = storeRecordSale(bizId, sale);
    // `kind` separates inventoried sales from one-off custom work, which is
    // the split worth knowing. Neither carries what was sold or for how much.
    track("sale.record", { kind: sale?.isCustom ? "custom" : "item" });
    showToast("Sale recorded!");

    if (!item) return recorded;
    if (hasStockDiscrepancy(item)) {
      // Reaching here now takes a deliberate confirmation on the form, but the
      // ledger can still go negative from a sale that synced in from another
      // phone, so the reconciliation prompt stays.
      track("stock.oversold");
      showToast(`${item.name} is oversold by ${Math.abs(item.qty)}. Check your stock.`);
      return recorded;
    }
    if (item.qty > 0 && item.qty <= lowStockThreshold) {
      const biz = businesses.find((b) => b.id === bizId);
      sendLowStockNotification(item.name, item.qty, biz?.name || "your business");
    }
    return recorded;
  };

  // A correction moves the sale AND its stock movement, which the store does
  // together because they are one fact recorded twice.
  const updateSale = (bizId, saleId, patch) => {
    storeUpdateSale(bizId, saleId, patch);
    track("sale.correct");
  };

  const deleteSale = (bizId, saleId) => {
    storeDeleteSale(bizId, saleId);
    track("sale.delete");
  };

  // An invoice is money asked for. Nothing here touches `sales`, which is the
  // whole reason it is a separate record: see `makeInvoice`.
  const addInvoice = (bizId, input) => {
    const invoice = storeAddInvoice(bizId, input);
    // `count` and `ok`, not `lines` and `method`: the allowlist in
    // `analytics.js` drops anything it does not name, so an unlisted key is not
    // a leak but it is not data either. Never the customer's name.
    track("invoice.create", { count: (input?.lines || []).length });
    showToast("Invoice created.");
    return invoice;
  };

  const updateInvoice = (bizId, invoiceId, patch) => {
    storeUpdateInvoice(bizId, invoiceId, patch);
    if (patch?.paidAt) track("invoice.paid", { ok: Boolean(patch.paidMethod) });
  };

  const deleteInvoice = (bizId, invoiceId) => {
    storeDeleteInvoice(bizId, invoiceId);
    showToast("Invoice removed.");
  };

  const resetSyncCursors = useStore(s => s.resetSyncCursors);

  /**
   * Sign out.
   *
   * Cursors MUST be cleared: they are per-account watermarks, and the next
   * person to sign in on this device would otherwise conclude they had already
   * pulled everything and see an empty account. Local records are deliberately
   * left alone -- they may not be backed up yet, and deleting someone's books
   * as a side effect of signing out is unforgivable.
   */
  const signOutOfAccount = async () => {
    await signOut();
    resetSyncCursors();
    showToast("Signed out. Your records stay on this device.");
  };

  const onboardingComplete = useStore(s => s.onboardingComplete);
  const setOnboardingComplete = useStore(s => s.setOnboardingComplete);

  const hasSeenGuide = useStore(s => s.hasSeenGuide);
  const setHasSeenGuide = useStore(s => s.setHasSeenGuide);
  const isPinEnabled = useStore(s => s.isPinEnabled);
  const setIsPinEnabled = useStore(s => s.setIsPinEnabled);

  const userEmail = useStore(s => s.userEmail);
  const setUserEmail = useStore(s => s.setUserEmail);

  /**
   * SETUP IS A PROPERTY OF THE ACCOUNT, NOT OF THE PHONE.
   *
   * `onboardingComplete` lives in localStorage and never syncs, so signing in
   * on a second device ran the whole wizard again -- asking for a name and an
   * email belonging to the account that had just been authenticated with both.
   *
   * The account's own answer rides on the SESSION (see `recordSetupComplete`),
   * so it is readable on this first render and with no request, which is what
   * lets the gate below decide immediately instead of flashing the wizard and
   * then withdrawing it. It is also there offline, because supabase-js
   * restores the session from localStorage.
   *
   * READ-THROUGH rather than copied into the store. Adopting these into local
   * state would need an effect writing state on mount, which is the
   * `set-state-in-effect` the lint tripwire counts, and this project keeps
   * that count still on purpose. Local still WINS where it is set: a name
   * typed on this phone is the one this phone shows.
   */
  const accountMeta = auth.session?.user?.user_metadata || null;
  const accountSetUp = Boolean(accountMeta?.setup_done_at);
  const setupDone = onboardingComplete || accountSetUp;
  const namedLocally = userName && userName !== "Business Owner";
  const resolvedUserName = namedLocally
    ? userName
    : (String(accountMeta?.display_name || accountMeta?.full_name || accountMeta?.name || "").trim() || userName);
  // The account's address is the verified one, so it stands in wherever this
  // device has not been told otherwise.
  const resolvedUserEmail = userEmail || auth.email || "";

  /**
   * THE ONE PLACE THAT TELLS THE ACCOUNT SETUP IS DONE.
   *
   * It covers both cases with the same line, which is why it is not two:
   * the wizard finishing flips `onboardingComplete`, and a device that
   * finished it long ago already has it set. Either way this device knows
   * something the account does not, and says so once.
   *
   * That second case is what makes the fix reach anyone who exists today.
   * Nobody who signed up before now carries `setup_done_at`, so without it
   * the owner would test on a second phone and still meet the wizard they
   * reported.
   *
   * A ref rather than the flag: `updateUser` refreshes the session, so this
   * re-runs with new identities on the way through, and the ref is what stops
   * a second write. Failure is silent on purpose -- it buys the NEXT device a
   * shorter path and nothing on this one depends on it.
   */
  const backfilled = useRef(false);
  useEffect(() => {
    if (!auth.session || accountSetUp || !onboardingComplete) return;
    if (backfilled.current) return;
    backfilled.current = true;
    recordSetupComplete({ name: namedLocally ? userName : "" }).catch((err) => {
      console.warn("[BizTrack] Could not record setup on the account:", err?.message);
    });
  }, [auth.session, accountSetUp, onboardingComplete, namedLocally, userName]);
  const userAvatar = useStore(s => s.userAvatar);
  const setUserAvatar = useStore(s => s.setUserAvatar);
  const hashedPin = useStore(s => s.hashedPin);
  const setHashedPin = useStore(s => s.setHashedPin);
  const loginAttempts = useStore(s => s.loginAttempts);
  const setLoginAttempts = useStore(s => s.setLoginAttempts);
  const lockoutUntil = useStore(s => s.lockoutUntil);
  const setLockoutUntil = useStore(s => s.setLockoutUntil);

  const hashedRecoveryKey = useStore(s => s.hashedRecoveryKey);
  const setHashedRecoveryKey = useStore(s => s.setHashedRecoveryKey);

  const chooseAnalytics = (allowed) => {
    setConsent(allowed);
    setAnalyticsConsentState(allowed);
    // Only meaningful when allowed; track() is a no-op otherwise.
    track("analytics.consent", { ok: allowed, first_run: true });
    if (allowed) flushAnalytics();
  };


  /**
   * Everything that floats above a screen, attached to whatever App returns.
   *
   * It has to wrap EVERY return rather than just the main shell: a promise
   * raised from a gate screen resolves only if the dialog it created is
   * actually mounted, and each early return below replaces the whole tree.
   */
  const withOverlays = (ui) => (
    <>
      {ui}
      {activeToast && <Toast toast={activeToast} onDismiss={() => setActiveToast(null)} />}
      {dialog && <ConfirmDialog key={dialog.id} dialog={dialog} />}
      {isUpdating && <UpdatePrompt progress={updateProgress} />}
    </>
  );

  /**
   * READ-ONLY, which the Terms have promised since before it was built.
   *
   * "What happens if you stop paying: the app becomes read-only. It does not
   * lock you out and it does not delete anything." That was live in
   * `src/legal/documents.js` while `evaluatePlan` computed `canWrite` and
   * NOTHING in the interface read it. The trial ended, the emails went out,
   * and every write still went through.
   *
   * It is the fourth time this project has shipped a document that disagreed
   * with the code, and the first time the document was the stricter of the
   * two, so nobody was short-changed -- but it left the commercial model with
   * no teeth at all.
   *
   * WHAT STOPS is recording. What does not stop: reading, searching,
   * exporting, receipts, invoices you already made, and every preference.
   * Locking someone out of their own books over a payment is the one thing
   * this project has said repeatedly it will never do, and the gate is
   * deliberately client-side for the same reason -- enforcing it in the
   * database would put a person's records behind their subscription status.
   *
   * `setModal` IS THE CHOKE POINT, and that is a deliberate choice over
   * wrapping each action. Almost every write in this app begins by opening a
   * sheet, so one intercept covers adding a sale, a business, an item, a
   * restock, a photo, an invoice and an edit. It also means the person is told
   * when they TAP, not after filling in a form, which is the difference
   * between an explanation and a rejection.
   */
  const canWrite = auth.plan?.canWrite !== false;
  /** Sheets that exist to write something. `receipt` and `invoice` are not
   *  here: looking at a document you already have is reading, and the Terms
   *  promise it stays available. */
  const WRITE_MODALS = new Set([
    "addBiz", "addItem", "restock", "itemPhoto", "editSale", "addInvoice", "addSale", "delete-biz",
  ]);

  const explainReadOnly = async () => {
    const ended = auth.plan?.state === "trial_ended";
    const ok = await ask({
      title: ended ? "Your free trial has ended" : "Your plan has expired",
      body: "Everything you have recorded is still here: you can read it, search it, share receipts and export it, and nothing has been deleted. What has stopped is recording new sales and stock. Message us to carry on, and we will sort it out.",
      confirmLabel: "Message us",
      cancelLabel: "Not now",
    });
    if (!ok) return;
    track("plan.contact", { state: auth.plan?.state });
    // WhatsApp is how this audience actually makes contact, and the Terms
    // already say payment is arranged directly with us.
    window.open(`https://wa.me/${ENTITY.phone.replace(/[^0-9]/g, "")}`, "_blank", "noopener");
  };

  const guardedSetModal = (name) => {
    if (name && WRITE_MODALS.has(name) && !canWrite) { explainReadOnly(); return; }
    setModal(name);
  };

  /** The two writes that do not go through a sheet. */
  const guardedReplaceBusinesses = (...a) => { if (!canWrite) return explainReadOnly(); return replaceBusinesses(...a); };
  const guardedUpdateInvoice = (...a) => { if (!canWrite) return explainReadOnly(); return updateInvoice(...a); };

  const ctx = { businesses, analyticsConsent, chooseAnalytics, replaceBusinesses: guardedReplaceBusinesses, migrationIssues, auth, sync, signOutOfAccount, screen, setScreen, activeBiz, activeBizId, openBiz, openAnalysis, analysisFrom, bizTab, setBizTab, modal, setModal: guardedSetModal, canWrite, explainReadOnly, showToast, ask, askText, addBusiness, deleteBusiness, addInventoryItem, restockInventoryItem, restockItemId, setRestockItemId, photoItemId, setPhotoItemId, receiptSale, setReceiptSale, invoiceId, setInvoiceId, addInvoice, updateInvoice: guardedUpdateInvoice, deleteInvoice, updateSale, deleteSale, deleteInventoryItem, setItemPhoto, addSale, currency, setCurrency, isDarkMode, setIsDarkMode, lowStockThreshold, setLowStockThreshold, userName: resolvedUserName, setUserName, onboardingComplete, setOnboardingComplete, setupDone, accountSetUp, hasSeenGuide, setHasSeenGuide, isPinEnabled, hashedPin, setHashedPin, hashedRecoveryKey, setHashedRecoveryKey, loginAttempts, setLoginAttempts, lockoutUntil, setLockoutUntil, userEmail: resolvedUserEmail, setUserEmail, userAvatar, setUserAvatar, setIsPinEnabled, checkUpdates, updateProgress, checkRescue, isRescuing };

    const [isUnlocked, setIsUnlocked] = useState(false);

  // Safe to early-return from here on: every hook above has already run.
  if (isStateCorrupt || migrationFailed) {
    return withOverlays(
      <div style={{ ...S.shell, background: "var(--focus-ground)", color: "var(--focus-ink)" }}>
        <div style={{ ...S.phone, background: "var(--focus-ground)", justifyContent: "center", alignItems: "center", padding: 40, textAlign: "center" }} className="bt-focus">
          <AlertTriangle size={48} color="#F0C040" style={{ marginBottom: 20 }} />
          <h2 style={{ ...S.userName, color: "var(--focus-ink)", marginBottom: 8 }}>We couldn't open your records</h2>
          <p style={{ ...S.greeting, color: "rgba(255,255,255,0.7)", marginBottom: 8 }}>
            <strong>Nothing has been deleted.</strong> Your data is still on this device.
          </p>
          <p style={{ ...S.greeting, color: "rgba(255,255,255,0.5)", fontSize: 12, marginBottom: 32 }}>
            Download a copy first, then try a rescue scan. Please don't clear the app or reinstall it.
          </p>
          <button
            style={{ ...S.primaryBtn, background: "var(--focus-ink)", color: "var(--focus-ground)" }}
            onClick={() => {
              if (!emergencyExport(readSnapshot)) {
                showToast("Could not build the file on this device.", "error");
              }
            }}
          >
            Download my data
          </button>
          <button style={{ ...S.ghostBtn, marginTop: 12 }} onClick={() => checkRescue(true)}>
            {isRescuing ? "Scanning device..." : "Try Data Rescue"}
          </button>
          <button style={{ ...S.ghostBtn, marginTop: 12 }} onClick={() => window.location.reload()}>Reload App</button>
        </div>
      </div>
    );
  }

  // Wait for the session check before rendering anything, so an already
  // signed-in user never sees a flash of the sign-in screen.
  if (isBackendConfigured && !auth.ready) {
    return <div style={{ ...S.shell, background: "var(--focus-ground)" }} />;
  }

  // No `skippedAuth` any more: an account is required, so this is a wall
  // rather than a fork. `isBackendConfigured` still guards it, and that branch
  // stays deliberately -- if the env vars are missing the app must run
  // local-only rather than becoming unusable, which is a misconfigured DEPLOY
  // degrading gracefully, not a route a user can choose.
  if (isBackendConfigured && !auth.session) {
    return withOverlays(<AuthScreen styles={S} />);
  }

  // Consent, checked after authentication because the signup checkbox cannot
  // catch every route in. OAuth does not distinguish signing in from signing
  // up, so "Continue with Google" from the sign-in tab created accounts that
  // never saw the terms, which is how the first real user arrived.
  //
  // Comparing against LEGAL_VERSION rather than merely "is it set" is what
  // makes it possible to change the documents materially and ask again.
  if (
    isBackendConfigured &&
    auth.session &&
    !justAccepted &&
    auth.session.user?.user_metadata?.accepted_legal_version !== LEGAL_VERSION
  ) {
    return withOverlays(
      <ConsentScreen
        styles={S}
        email={auth.email}
        onAccepted={() => setJustAccepted(true)}
        onSignOut={signOutOfAccount}
      />
    );
  }

  if (claim.needed) {
    return withOverlays(
      <ClaimScreen
        styles={S}
        local={claim.local}
        remote={claim.remote}
        businesses={businesses}
        onResolve={(strategy) => {
          const result = claim.resolve(strategy);
          if (result.ok) {
            track("claim.resolve", { kind: strategy });
            // Sync unpauses on the next render and does the actual work.
            showToast(strategy === "adopt"
              ? "Loading your account's books…"
              : "Backing up your books…");
          }
          return result;
        }}
      />
    );
  }

  // `setupDone`, not `onboardingComplete`: an account that has been set up on
  // any device is set up on this one. The FEATURE TOUR below deliberately
  // stays on the local flag -- it teaches the interface, and someone who
  // already has an account does not need the interface explained again.
  if (!setupDone) return withOverlays(<Onboarding ctx={ctx} deferredPrompt={deferredPrompt} setDeferredPrompt={setDeferredPrompt} />);
  if (isPinEnabled && !isUnlocked) return withOverlays(<PinLock ctx={ctx} onUnlock={() => setIsUnlocked(true)} />);

  // Analytics consent. Nothing is collected until this is answered, so the
  // prompt is a gate on collection rather than a notice about it.
  if (isBackendConfigured && analyticsConsent === null) {
    return withOverlays(
      <div style={{ ...S.shell, background: "var(--focus-ground)", color: "var(--focus-ink)" }}>
        <div style={{ ...S.phone, background: "var(--focus-ground)", justifyContent: "center", padding: 32 }} className="bt-focus">
          <div style={{ background: "rgba(255,255,255,0.08)", width: 62, height: 62, borderRadius: 22, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20 }}>
            <TrendingUp size={30} color="var(--focus-ink)" />
          </div>
          <h1 style={{ ...S.userName, color: "var(--focus-ink)", marginBottom: 10 }}>
            Help us fix what breaks
          </h1>
          <p style={{ fontSize: 14, lineHeight: 1.65, color: "rgba(255,255,255,0.75)", margin: "0 0 14px" }}>
            BizTrack is in beta. If you allow it, the app will tell us which screens you
            open, which features you use, and when something crashes, so we fix the
            right things.
          </p>
          <p style={{ fontSize: 14, lineHeight: 1.55, color: "rgba(255,255,255,0.62)", margin: "0 0 8px" }}>
            <strong style={{ color: "rgba(255,255,255,0.8)" }}>We never send your business data.</strong> No item
            names, no prices, no sales figures, no customer details. Only which parts of
            the app were used.
          </p>
          <p style={{ fontSize: 14, lineHeight: 1.55, color: "rgba(255,255,255,0.62)", margin: "0 0 22px" }}>
            You can change this any time in Settings.
          </p>

          <button
            style={{ ...S.primaryBtn, background: "var(--focus-ink)", color: "var(--focus-ground)", marginTop: 0 }}
            onClick={() => chooseAnalytics(true)}
          >
            Allow
          </button>
          <button
            style={{ ...S.primaryBtn, background: "transparent", color: "var(--focus-ink)", border: "1px solid rgba(255,255,255,0.25)", marginTop: 10 }}
            onClick={() => chooseAnalytics(false)}
          >
            No thanks
          </button>
          <button
            style={{ ...S.textBtn, color: "rgba(255,255,255,0.5)", fontSize: 12, marginTop: 16 }}
            onClick={() => setScreen("privacy")}
          >
            Read the Privacy Policy
          </button>
        </div>
      </div>
    );
  }

  return withOverlays(
    <div style={S.shell}>
      <div style={S.phone} className="bt-app">
        <div style={S.screenWrap} className="bt-main">
          {screen === "home" && <HomeScreen ctx={ctx} />}
          {screen === "business" && activeBiz && <BusinessScreen ctx={ctx} />}
          {screen === "settings" && <SettingsScreen ctx={ctx} />}
          {screen === "analytics" && <AnalyticsScreen ctx={ctx} />}
          {screen === "bizAnalysis" && activeBiz && <BizAnalysisScreen ctx={ctx} />}
          {screen === "account" && <AccountScreen ctx={ctx} />}
          {screen === "about" && <AboutScreen ctx={ctx} />}
          {screen === "privacy" && <LegalScreen styles={S} doc={DOCUMENTS.privacy} onBack={() => setScreen("settings")} />}
          {screen === "terms" && <LegalScreen styles={S} doc={DOCUMENTS.terms} onBack={() => setScreen("settings")} />}
        </div>
        <InstallPrompt deferredPrompt={deferredPrompt} setDeferredPrompt={setDeferredPrompt} raised={screen === "home" || screen === "business"} />
        <RecordSaleButton ctx={ctx} />
        <BottomNav ctx={ctx} />
        {onboardingComplete && !hasSeenGuide && <FeatureGuide ctx={ctx} />}

        {/* MODALS */}
        {modal === "addBiz" && <AddBizModal ctx={ctx} />}
        {modal === "addItem" && <AddItemModal ctx={ctx} />}
        {modal === "restock" && <RestockModal ctx={ctx} />}
        {modal === "itemPhoto" && <ItemPhotoModal ctx={ctx} />}
        {modal === "receipt" && <ReceiptModal ctx={ctx} />}
        {modal === "editSale" && <EditSaleModal ctx={ctx} />}
        {modal === "addInvoice" && <AddInvoiceModal ctx={ctx} />}
        {modal === "invoice" && <InvoiceModal ctx={ctx} />}
        {modal === "addSale" && <AddSaleModal ctx={ctx} />}
        {modal === "pin-setup" && <PinSetupModal ctx={ctx} />}
        {modal === "delete-biz" && <DeleteBizModal ctx={ctx} />}
        {/* The update prompt used to be HERE, and that was the defect: every
            gate screen returns before this line, so the one message that can
            un-stick a stale install could not reach the people most stuck on
            one. It lives in `withOverlays` now. */}
      </div>
    </div>
  );
}

/**
 * "Updating BizTrack".
 *
 * NOT a question. The app updates itself (`registerType: 'autoUpdate'`), so
 * this reports a reload that is already happening rather than asking for one.
 * It exists because a page that silently restarts itself reads as a crash on
 * a mid-range Android, and this audience is standing at a stall when it
 * happens.
 *
 * IT MUST RENDER ON EVERY SCREEN, INCLUDING THE GATES, which is why it lives
 * in `withOverlays`. Its predecessor -- the "Update Available" prompt with
 * Later and Update now -- was rendered inside the main shell, past eight
 * early returns, so a person on the sign-in wall, onboarding or the PIN lock
 * could never reach the only control that could move them off a stale build.
 * That is the same shape as the dialogs that never settled, and the same
 * answer: an early return is not a different screen, it is a different tree.
 *
 * It is a `ModalShell` because the raw overlay it used to be was the app's
 * last second shell -- no portal, no Escape, no focus restore. On a gate
 * screen the portal is what makes it appear in the right place at all:
 * `S.modalOverlay` is `position: absolute`, and ModalShell switches it to
 * `fixed` when it has to fall back to `document.body`.
 *
 * `onClose` is deliberately a no-op. The worker has already been replaced and
 * the reload is scheduled, so Escape, the backdrop and the X would each
 * promise something this moment cannot honour.
 */
function UpdatePrompt({ progress }) {
  return (
    <ModalShell onClose={() => {}} title="Updating BizTrack">
      <div style={{ ...S.modalBody, textAlign: "center", alignItems: "center" }}>
        {/* The accent at 10%, and deliberately a literal: there is no accent
            tint token, and this is already the form this project calls
            correct -- alpha over whatever ground is behind it, so one value
            is right on the light page and the dark one. Inventing a token for
            a single call site is the churn, not the fix. */}
        <div style={{ background: "rgba(193,127,90,0.1)", width: 64, height: 64, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 4 }}>
          <RefreshCw size={32} color="var(--accent-color)" className="spin" />
        </div>
        <p style={{ ...S.emptySub, margin: "0 0 4px" }}>
          Installing the latest version. Your records are safe.
        </p>
        <div style={{ width: "100%", height: 8, background: "var(--border-color)", borderRadius: 99, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${progress}%`, background: "var(--accent-color)", transition: "width var(--motion-move) var(--ease-out)" }} />
        </div>
      </div>
    </ModalShell>
  );
}


/**
 * A business colour, darkened until white type is legible on it.
 *
 * The business hero paints whatever colour the owner picked and writes the
 * revenue, profit and margin on it in white. Measured against the eight in
 * COLORS, five failed WCAG AA for the values and every one failed for the
 * labels -- the sage green was 3.10:1. Mixing 38% toward the app's ink takes
 * the worst of them to 6.16:1 while keeping the hue, so a business is still
 * recognisable by its colour at a glance.
 *
 * Takes any hex rather than a lookup table, because a book restored from an
 * older backup can carry a colour that is no longer in COLORS.
 */
function heroTint(hex) {
  const m = /^#([0-9a-f]{6})$/i.exec(String(hex || ""));
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const mix = (channel, ink) => Math.round(channel * 0.62 + ink * 0.38);
  return `rgb(${mix((n >> 16) & 255, 0x1f)},${mix((n >> 8) & 255, 0x10)},${mix(n & 255, 0x08)})`;
}

/**
 * A business colour for the share ring, which needs opposite treatment in each
 * theme and is the third function in this file to mix the same sixteen hues.
 *
 * `heroTint` darkens, which is right on a white card and WRONG on a dark one:
 * measured against the dark `--card-bg` the tinted violet comes out at
 * **1.49:1**, which is a segment nobody can see. The raw colour is no better at
 * 2.22:1, under the 3:1 a non-text graphic needs to be distinguishable at all.
 *
 * So in dark mode it goes the other way, 45% toward the light ink. That lands
 * the worst of the sixteen at 6.17:1 against the card AND 6.17:1 for the ink
 * sitting on the rank key, which is the same colour. Both numbers being equal
 * is a coincidence of the tokens rather than a bug: `--card-bg` in dark and the
 * dark ink are both `#2C1810`.
 */
function ringColor(hex, isDark) {
  if (!isDark) return heroTint(hex);
  const m = /^#([0-9a-f]{6})$/i.exec(String(hex || ""));
  if (!m) return "var(--accent-color)";
  const n = parseInt(m[1], 16);
  const lift = (channel, light) => Math.round(channel * 0.55 + light * 0.45);
  return `rgb(${lift((n >> 16) & 255, 0xfa)},${lift((n >> 8) & 255, 0xf8)},${lift(n & 255, 0xf4)})`;
}

/**
 * A business colour as a pale wash, for a ground rather than for type.
 *
 * `heroTint` is the other direction: it DARKENS a colour so white type survives
 * on it. This lightens one so a mark can sit on it, and the two are not
 * interchangeable.
 *
 * Alpha rather than a mixed hex, and that is the whole reason this exists. A
 * flat light-mode tint is wrong the moment the page behind it is dark, which is
 * the bug this file already records for every semantic tint. One rgba value is
 * correct on the cream page and on the near-black one.
 *
 * Falls back to the app's own control tint rather than to the input, because
 * the failure mode of returning `hex` unchanged is `heroTint`'s: a solid,
 * full-strength colour appearing where a 16% wash was intended.
 */
function bizTint(hex, alpha) {
  const m = /^#([0-9a-f]{6})$/i.exec(String(hex || ""));
  if (!m) return "var(--control-bg)";
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

/**
 * The one figure a screen is about, set as display type.
 *
 * Two things make this different from every other amount in the app, and both
 * are the reason it is a component rather than a style:
 *
 *  - The currency unit is demoted. At 36px "FCFA" is four letters as wide as
 *    half the number, competing with the thing someone opened the app to read.
 *  - It is set LIGHTER than the type around it, not heavier. 500 at 36px,
 *    tracked in to -1.6. Reaching for bold at display size is the reflex that
 *    makes a number look shouted rather than important, and it is the single
 *    clearest tell of undesigned type.
 */
function DisplayAmount({ minor, currency, style }) {
  const { unit, value } = formatMoneyParts(minor, currency || useStore.getState().currency);
  return (
    <h2 style={style}>
      <span style={S.amountUnit}>{unit}</span>
      {value}
    </h2>
  );
}

/**
 * The single most useful thing to say about a business on one line.
 *
 * This replaces a "Profitable / Break Even / Losing" pill, which graded the
 * business without telling the owner anything they could act on -- and which
 * was computed from ALL-TIME margin, so a shop that had not sold anything in
 * months still showed a green badge.
 *
 * Ordered by what needs attention first: a stock discrepancy is a bookkeeping
 * problem, low stock is a buying decision, and otherwise the honest answer is
 * simply how the month is going.
 */
function bizNote(biz, lowStockThreshold, since) {
  const inventory = deriveInventory(biz).filter((i) => !i.deletedAt);
  const oversold = inventory.filter(hasStockDiscrepancy).length;
  if (oversold > 0) {
    return { text: `${oversold} oversold`, color: "var(--danger)" };
  }
  const low = inventory.filter((i) => i.qty > 0 && i.qty <= lowStockThreshold).length;
  if (low > 0) {
    return { text: `${low} low stock`, color: "var(--warning)" };
  }
  // Never restate the figure already on the row. When a business started this
  // month its lifetime profit and its month profit are the same number, and a
  // row that prints it twice reads as a rendering fault.
  const month = calcBizStats(biz, { since });
  const n = month.salesCount;
  return {
    text: n > 0 ? `${n} ${n === 1 ? "sale" : "sales"} this month` : "no sales this month",
    color: "var(--text-secondary)",
  };
}

/**
 * The one thing worth saying, at the top of Analytics.
 *
 * `portfolioFinding` decides WHICH fact; this decides how to say it. The split
 * is deliberate: the arithmetic is testable and the English is not, and every
 * previous attempt in this app to put copy in the domain layer ended with a
 * sentence nobody could change without a test failing.
 *
 * It is drawn on the page ground with NO surface, which is the whole point.
 * The audit's sixth finding was nine near-identical cards with identical gaps,
 * and the fix is not a tenth card: it is one thing on this screen that is not
 * a card at all. Hierarchy out of space and type rather than another box.
 *
 * It is deliberately NOT tappable. It names the shop and the product, so the
 * owner knows where to go, and a control that does not look like one is a
 * mistake this file has already recorded once.
 */
function AnalyticsLead({ finding }) {
  if (!finding || finding.kind === "none") return null;

  const EYEBROW = { danger: "Needs fixing", warning: "Worth looking at", muted: "Worth knowing" };
  const TONE = { danger: "var(--danger)", warning: "var(--warning)", muted: "var(--text-secondary)" };
  const f = finding;
  const money = (minor) => fmt(minor, f.currency);
  // Only worth stating as a comparison when the two numbers are actually
  // apart. "12% against 14% overall" reads as a rounding error, not a finding.
  const vsOverall = f.overall - f.margin >= 10 ? ` against ${f.overall}% overall` : "";

  // EVERY BODY BELOW IS ONE OR TWO SHORT SENTENCES, and that is a constraint
  // rather than a style note. This is the lead of the screen at 16/500 on the
  // page ground, so it was the largest single block on the page at five lines.
  //
  // The bar is MEASURED, not guessed: at 16px in a 342px column this wraps at
  // about 30 characters a line, so 95 characters is three lines and 65 would be
  // two. Two lines is not reachable for a finding that has to name a product,
  // a shop and a number, so the bar is THREE, about 95 characters. The first
  // attempt at this comment claimed two, which was wrong and was caught by
  // measuring the rendered block rather than counting characters in the
  // source.

  let eyebrow = EYEBROW[f.tone];
  let body;
  switch (f.kind) {
    case "untrusted":
      eyebrow = "Check this first";
      body = f.count === 1
        ? `${f.itemName} at ${f.bizName} has ${f.qty} in stock and no cost recorded, so every profit figure here is too high.`
        : `${f.count} products have stock but no cost recorded, ${f.itemName} among them, so every profit figure here is too high.`;
      break;
    case "parked":
      body = `${money(f.value)} is standing still in stock that is not moving. ${f.itemName} alone is about ${f.months} months' worth.`;
      break;
    case "oversold":
      body = f.count === 1
        ? `${f.itemName} at ${f.bizName} shows ${f.qty} in stock. Recount it, or record the missing restock.`
        : `${f.count} products show less than none in stock, ${f.itemName} lowest at ${f.qty}. Recount them, or record the missing restocks.`;
      break;
    case "losing":
      body = `${f.bizName} is ${money(f.amount)} down: it has cost more than it brought in. Check your prices against what the stock costs.`;
      break;
    case "runningOut":
      body = `${f.itemName} is one of your best earners at ${money(f.profit)}, and ${f.bizName} has ${f.qty} left.`;
      break;
    case "thinMargin":
      body = f.mostSold
        ? `${f.itemName} sells the most and keeps the least, ${f.margin}%${vsOverall}. Raise its price before anything else.`
        : `${f.itemName} at ${f.bizName} keeps only ${f.margin}% of what it sells${vsOverall}.`;
      break;
    case "concentrated":
      body = `${f.share}% of your profit comes from ${f.bizName}. A slow month there is a slow month everywhere.`;
      break;
    case "steady":
      eyebrow = "Nothing needs doing";
      body = `Nothing is oversold and nothing is running low across your ${f.bizCount === 1 ? "shop" : `${f.bizCount} shops`}.`;
      break;
    default:
      return null;
  }

  return (
    <div style={S.lead}>
      <p style={{ ...S.leadEyebrow, color: TONE[f.tone] }}>{eyebrow}</p>
      <p style={S.leadBody}>{body}</p>
    </div>
  );
}

/** Monotonic id so each question mounts its own dialog, fresh fields and all. */
let dialogSeq = 0;

/* ─── HOME SCREEN ───────────────────────────────────────────────────────────── */
function HomeScreen({ ctx }) {
  const { businesses, openBiz, setModal, lowStockThreshold, userName, setScreen, userAvatar, migrationIssues, showToast, isDarkMode, auth, canWrite, explainReadOnly } = ctx;

  // The card said "This Month" and showed every sale ever recorded. In a
  // bookkeeping app a figure that does not mean what it is labelled is a trust
  // bug, not a copy nit -- someone reconciles against it.
  // Two values, and this is NOT the "one alpha is correct on the page and on a
  // card" rule being broken. That rule is about one value holding across
  // SURFACES within a theme, which alpha does. It says nothing about holding
  // across themes, and perceptually it does not: the same 10% wash that reads
  // clearly on #FAF8F4 is nearly invisible over #1A0E0A, because a light ground
  // has far more room to be darkened than a near-black one has to be lightened.
  // Screenshotted in both before picking these.
  // ── how much colour a row may carry, and why it is capped ──────────────────
  //
  // The wash was raised until it stopped passing, rather than until it looked
  // right. Every one of the sixteen in COLORS was measured under BOTH text
  // tokens at each step, and light mode runs out first, on the violet #53479E:
  //
  //     light   a=0.10 -> 5.04:1   a=0.14 -> 4.75:1   a=0.18 -> 4.45:1  FAILS
  //     dark    a=0.18 -> 7.02:1   a=0.24 -> 6.27:1   a=0.32 -> 5.39:1
  //
  // So the ceiling on a light ground is about 0.14 for --text-secondary, which
  // is the "Crochet · 3 items" line. A louder flat wash was built, looked good,
  // and measured 4.33:1. It is not shippable, and section A raised this exact
  // token from 3.67 to 5.88 for this exact reason.
  //
  // The conclusion is the useful part: ON A LIGHT GROUND YOU CANNOT BUY
  // CONTRAST UNDER THE TEXT. It has to go where there is no text, which is the
  // 72px before the business name starts. Hence the kerb below, at full
  // strength, carrying no type at all.
  //
  // At 0.12 / 0.20 the worst of the sixteen measures 4.91:1 light and 6.76:1
  // dark for the meta line, and 13.28 / 13.51 for the name.
  const wash = isDarkMode ? 0.20 : 0.12;
  const rule = isDarkMode ? 0.50 : 0.42;

  const monthStart = startOfMonth();
  const month = calcPortfolioStats(businesses, { since: monthStart });
  const allTime = calcPortfolioStats(businesses);
  const monthName = new Date().toLocaleDateString("en-US", { month: "long" });
  // A quiet month must not read as lost data. That failure mode is this app's
  // own history -- see the v1.5.3 rescue work -- so when the period is empty
  // and the books are not, say so and show the total that is not zero.
  const quietMonth = month.revenue === 0 && allTime.revenue > 0;
  // `qty > 0`, and it was missing here. THREE places in this app decide what
  // "low stock" means and this was the only one that did not exclude an empty
  // shelf: `bizNote` says `qty > 0 && qty <= threshold`, the Overview strip
  // says the same, and this said only `qty <= threshold`. So a sold-out
  // product counted as low stock, and so did an OVERSOLD one, whose negative
  // balance already has its own banner directly above this one.
  //
  // It survived because the banner printed names and nothing else: "Winter
  // Scarf" reads fine, and it was only when the row grew "0 left" and
  // "-2 left" that a count of eleven turned out to be a count of seven. That
  // is the argument for the recognition fix stated from the other end -- the
  // display that demanded recall was also the display that hid a wrong number.
  const allLowStock = businesses.flatMap((b) =>
    deriveInventory(b)
      .filter((i) => !i.deletedAt && i.qty > 0 && i.qty <= lowStockThreshold)
      .map((i) => ({ ...i, bizName: b.name, bizColor: b.color }))
  );
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <div style={S.screen} className="bt-screen bt-has-fab">
      <div style={S.homeHeader}>
        <div>
          <p style={S.greeting}>{greeting}, {userName}</p>
          <h1 style={S.userName}>Your Businesses</h1>
        </div>
        <div style={{ ...S.avatar, cursor: "pointer" }} onClick={() => setScreen("account")}>{userAvatar?.startsWith('/') ? <img src={userAvatar} alt="" style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover" }} /> : (userAvatar || (userName || "B")[0])}</div>
      </div>

      {/* SUMMARY CARD */}
      <div id="home-summary" style={S.summaryCard}>
        <p style={S.summaryLabel}>Profit · {monthName}</p>
        <DisplayAmount minor={month.profit} style={S.summaryAmount} />
        {quietMonth ? (
          <p style={S.summaryNote}>
            No sales recorded in {monthName} yet. Your books are safe:
            {" "}<strong style={{ fontWeight: 600 }}>{fmt(allTime.profit)}</strong> profit all time.
          </p>
        ) : (
          <div style={S.summaryRow} className="bt-summaryrow">
            <div>
              <p style={S.summarySubLabel}>Revenue</p>
              <p style={S.summarySubVal}>{fmt(month.revenue)}</p>
            </div>
            <div style={S.summaryDivider} />
            <div>
              <p style={S.summarySubLabel}>Businesses</p>
              <p style={S.summarySubVal}>{businesses.length} active</p>
            </div>
            <div style={S.summaryDivider} />
            <div>
              <p style={S.summarySubLabel}>Margin</p>
              <p style={S.summarySubVal}>{month.margin}%</p>
            </div>
          </div>
        )}
      </div>

      {/* The upgrade completed but the numbers didn't reconcile. Say so plainly
          and put the untouched original one tap away. */}
      {/* PLAN, and this is the in-app half of a notice that also goes by email.
          Both exist on purpose: the emails are already scheduled at 7, 3 and 1
          days by `biztrack-billing`, and this app's own history says email is
          not a channel to rely on alone here, because Android opens the link
          in a browser that is not the installed app.

          It sits ABOVE low stock and below the migration banner, which is the
          order of what a wrong answer costs: books that disagree with
          themselves, then being unable to record at all, then a shelf running
          out.

          A beta user must never see this. The beta state is plan = 'active'
          with a null `plan_expires_at`, which `evaluatePlan` reads as writable
          with no expiry, so anyone seeing it during the beta was stamped wrong
          at signup and query 3 of `beta-preflight.sql` will name them. */}
      {!canWrite && (
        <button
          type="button"
          style={{ ...S.alertBanner, background: "var(--danger-bg)", border: "1px solid var(--danger)", width: "auto", textAlign: "left", cursor: "pointer", font: "inherit" }}
          onClick={explainReadOnly}
        >
          <Lock style={S.alertIcon} size={20} color="var(--danger)" />
          <div>
            <p style={{ ...S.alertTitle, color: "var(--danger)" }}>
              {auth?.plan?.state === "trial_ended" ? "Your free trial has ended" : "Your plan has expired"}
            </p>
            <p style={S.alertSub}>
              Everything is still here to read, share and export. Recording new sales and stock has stopped. Tap to sort it out.
            </p>
          </div>
        </button>
      )}

      {/* The last week of a trial, in the app rather than only in an inbox. */}
      {canWrite && auth?.plan?.state === "trialing" && auth.plan.daysLeft !== null && auth.plan.daysLeft <= 7 && (
        <div style={S.alertBanner}>
          <Info style={S.alertIcon} size={20} color="var(--warning)" />
          <div>
            <p style={S.alertTitle}>
              {auth.plan.daysLeft <= 1 ? "Your trial ends today" : `${auth.plan.daysLeft} days left on your trial`}
            </p>
            <p style={S.alertSub}>
              After that BizTrack keeps everything you have recorded and stays readable, but stops taking new sales and stock.
            </p>
          </div>
        </div>
      )}

      {migrationIssues?.length > 0 && (
        <div style={{ ...S.alertBanner, background: "var(--danger-bg)", border: "1px solid var(--danger)" }}>
          <AlertTriangle style={S.alertIcon} size={20} color="var(--danger)" />
          <div style={{ flex: 1 }}>
            <p style={{ ...S.alertTitle, color: "var(--danger)" }}>Please check your numbers</p>
            <p style={S.alertSub}>
              Some totals changed during the last app update. Nothing was deleted, and a copy of
              your original data is saved on this device.
            </p>
            <button
              style={{ ...S.textBtn, color: "var(--danger)", marginTop: 8 }}
              onClick={() => downloadSnapshot(showToast)}
            >Download original data</button>
          </div>
        </div>
      )}

      {/* LOW STOCK BANNER */}
      {/* This was a bare comma list of names: "Denim Jacket, Gold Hoops,
          Shea Butter". Every other surface in the app that names a product
          shows its picture and its number, and this one -- the only place
          low stock is reported across ALL the shops, and the one a person
          reads while standing at a stall -- asked them to recall which jacket,
          how many were left, and which shop it was in. Recognition is cheap
          and recall is not, which is the whole finding.

          The rows sit OUTSIDE the warning triangle's column, spanning the
          banner, so their own 20px glyph and 12px gap put the name on 72, the
          icon line. Nested inside the triangle's column they would have landed
          on 104, which this file already records as a line that cannot be
          reached from 72 or 100 by changing a gap.

          The mark is a 20px glyph, not the 100 photo column, for the reason
          the Overview low-stock strip is also 20: these are a compact strip at
          the meta size where the NAME is read and the picture confirms it,
          not rows in a list where the picture is what is recognised. */}
      {allLowStock.length > 0 && (
        <div style={S.alertBanner}>
          <AlertTriangle style={S.alertIcon} size={20} color="var(--warning)" />
          <p style={{ ...S.alertTitle, margin: 0 }}>Low Stock on {allLowStock.length} item{allLowStock.length > 1 ? "s" : ""}</p>
          <div style={{ gridColumn: "1 / -1", marginTop: 8 }}>
            {allLowStock.slice(0, LOW_STOCK_SHOWN).map((i) => (
              /* `flex-start`, not `center`. These lines carry the shop's name
                 as well, so they wrap at 320 and at 390, and a glyph centred
                 on a TWO-line block sits half a line below one centred on a
                 one-line block. Four rows, two of each, is a column whose marks
                 do not line up -- the near-miss class, arriving the usual way,
                 which is nobody deciding. Anchored to the top the glyph's
                 centre is 1.3px off the first line's, at every row height. */
              <div key={i.id} style={{ display: "flex", alignItems: "flex-start", gap: 12, marginTop: 6 }}>
                <Photo photoId={i.photoId} size={20} radius={6} alt="" />
                {/* The shop's name only when there is more than one shop. With
                    one business it is the whole app, so printing it on every
                    line is noise the reader has to step over. */}
                <p style={{ ...S.alertSub, minWidth: 0 }}>
                  {i.name} &middot; {i.qty} left{businesses.length > 1 ? ` · ${i.bizName}` : ""}
                </p>
              </div>
            ))}
            {allLowStock.length > LOW_STOCK_SHOWN && (
              /* A count, not an ellipsis: it answers "is it worth going to
                 look" before anyone goes. The shops are directly below. */
              <p style={{ ...S.alertSub, marginTop: 6 }}>and {allLowStock.length - LOW_STOCK_SHOWN} more</p>
            )}
          </div>
        </div>
      )}

      {/* BUSINESSES */}
      <div style={S.sectionRow}>
        <p style={S.sectionLabel}>My Businesses</p>
        <button id="add-biz-btn" style={S.textBtn} onClick={() => setModal("addBiz")}>+ Add New</button>
      </div>

      {/* THE LEDGER
          Every one of these used to be a card: white fill, shadow, 18px radius,
          a 4px colour bar, a tinted emoji tile, a bold figure and a status pill.
          Six devices per row all saying "look here", stacked four deep under a
          summary card also saying it -- so nothing led and the eye had nowhere
          to go. Rules instead of cards. A button rather than a div, so the row
          is reachable by keyboard and picks up the focus ring.

          THE ROW IS THE SHOP. That reduction went one step too far: what the
          owner picked out of it was a 4px stripe and a 20px glyph, measured at
          1.8% of a row that was otherwise byte-identical to every other row, so
          telling four completely different businesses apart meant reading each
          one. The colour now grounds the whole row, edge to edge, and the rule
          between rows is that colour too.

          Two shapes were built and rejected before this one:

           - A 36px disc holding the emoji. It works, and it is the WhatsApp
             conversation row: circular avatar, name, sub-line, right-aligned
             meta. On this audience's phones that is the most familiar list in
             existence, and the Home screen of a books app should not be it.
           - A colour tab bleeding off the screen edge. Strong, but it forced
             the dividers full-bleed while every other rule in the app is inset,
             for a mark that gets cropped differently on every device.

          It stays ONE device. There is still no fill, no shadow, no radius, no
          pill: the ground IS the identity rather than a badge sitting next to
          it, which is why this is not the card coming back. */}
      <div style={S.bizList} className="bt-bizlist">
        {businesses.length === 0 && (
          <div style={S.emptyState}>
            <div style={S.emptyIcon}><Store size={40} color="var(--text-primary)" strokeWidth={1.5} /></div>
            <p style={S.emptyTitle}>No businesses yet</p>
            <p style={S.emptySub}>Tap "+ Add New" to get started</p>
          </div>
        )}
        {businesses.map((biz, i) => {
          const stats = calcBizStats(biz);
          const note = bizNote(biz, lowStockThreshold, monthStart);
          const itemCount = biz.items.filter((i) => !i.deletedAt).length;
          return (
            <button
              key={biz.id}
              type="button"
              className="bt-bizrow"
              style={{ ...S.bizRow, position: "relative", background: bizTint(biz.color, wash), borderBottomColor: bizTint(biz.color, rule),
                ...(i === 0 ? { borderTop: "1px solid " + bizTint(biz.color, rule) } : null) }}
              onClick={() => openBiz(biz.id)}
            >
              {/* The kerb: the shop's colour at FULL strength, which nothing
                  else on this screen is. It is the only way to raise the
                  contrast without breaking the meta line, because it sits in
                  the 24px gutter where no type ever goes, so no ratio applies
                  to it. Eight pixels, flush to the screen edge, full row
                  height. aria-hidden because the colour is not information a
                  screen reader can use, and the name beside it already is. */}
              <span aria-hidden="true" style={{ ...S.bizKerb, background: biz.color }} />
              <span style={S.bizRowSlot}>{biz.emoji}</span>
              <span style={S.bizRowMain}>
                <span style={S.bizRowName}>{biz.name}</span>
                <span style={S.bizRowMeta}>
                  {biz.category} · {itemCount} {itemCount === 1 ? "item" : "items"}
                </span>
              </span>
              <span style={S.bizRowRight}>
                <span style={S.bizRowAmount}>{fmt(stats.profit, biz.currency)}</span>
                <span style={{ ...S.bizRowNote, color: note.color }}>{note.text}</span>
              </span>
            </button>
          );
        })}
      </div>
      <div style={{ height: 40 }} />
      <p style={{ textAlign: "center", fontSize: 11, color: "var(--text-secondary)", opacity: 0.6 }}>BizTrack {VERSION} • Build {BUILD_DATE}</p>
    </div>
  );
}

/* ─── BUSINESS SCREEN ───────────────────────────────────────────────────────── */
function BusinessScreen({ ctx }) {
  const { activeBiz, bizTab, setBizTab, setScreen, setModal, lowStockThreshold, setRestockItemId, setPhotoItemId, setReceiptSale, setInvoiceId } = ctx;
  // Tapping a sale opens the CORRECTION, with the receipt one button inside.
  const openReceipt = (sale) => { setReceiptSale(sale); setModal("editSale"); };
  const openInvoice = (invoice) => { setInvoiceId(invoice.id); setModal("invoice"); };
  const stats = calcBizStats(activeBiz);
  // Quantity and average cost are folded from the stock ledger on read.
  const inventory = deriveInventory(activeBiz).filter((i) => !i.deletedAt);

  return (
    <div style={S.screen} className="bt-screen bt-has-fab">
      <div style={S.bizHeader}>
        <button style={S.backBtn} onClick={() => setScreen("home")} aria-label="Back"><ArrowLeft size={22} /></button>
        <div style={S.bizHeaderCenter}>
          <span style={{ fontSize: 18 }}>{activeBiz.emoji}</span>
          <span style={S.bizHeaderName}>{activeBiz.name}</span>
        </div>
        <button style={S.iconBtn} onClick={() => setModal("delete-biz")} aria-label="Delete this business"><Trash2 size={20} color="var(--text-primary)" /></button>
      </div>

      {/* HERO
          Revenue, profit and margin used to sit here as three figures at the
          same size and weight, so nothing led -- and the margin was then stated
          three times over: as a number, as the bar's width, and as a sentence
          underneath repeating both. Profit is what this screen is about, so it
          is the only thing set at display size; the rest is one meta line, and
          the bar survives as the single non-numeric reading of margin. */}
      <div style={{ ...S.bizHero, background: heroTint(activeBiz.color) }}>
        <p style={S.heroLabel}>Profit · all time</p>
        <DisplayAmount minor={stats.profit} currency={activeBiz.currency} style={S.heroAmount} />
        <div style={S.heroMeta} className="bt-herorow">
          <span>Revenue <b style={S.heroMetaVal}>{fmt(stats.revenue, activeBiz.currency)}</b></span>
          <span>Margin <b style={S.heroMetaVal}>{stats.margin}%</b></span>
          <span>{stats.salesCount} {stats.salesCount === 1 ? "sale" : "sales"}</span>
        </div>
        <div style={S.progBg}>
          <div style={{ ...S.progFill, width: Math.min(100, Math.max(0, Number(stats.margin))) + "%" }} />
        </div>
      </div>

      {/* TABS */}
      <div style={S.tabs}>
        {["overview","inventory","sales","invoices"].map((t) => (
          <button key={t} style={{ ...S.tab, ...(bizTab === t ? S.tabActive : {}) }} onClick={() => setBizTab(t)}>
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      <div style={S.tabContent}>
        {bizTab === "overview" && <OverviewTab biz={activeBiz} stats={stats} lowStockThreshold={lowStockThreshold} inventory={inventory} openReceipt={openReceipt} />}
        {bizTab === "inventory" && <InventoryTab biz={activeBiz} setModal={setModal} setRestockItemId={setRestockItemId} setPhotoItemId={setPhotoItemId} lowStockThreshold={lowStockThreshold} inventory={inventory} />}
        {bizTab === "sales" && <SalesTab biz={activeBiz} openReceipt={openReceipt} />}
        {bizTab === "invoices" && <InvoicesTab biz={activeBiz} setModal={setModal} openInvoice={openInvoice} />}
      </div>
    </div>
  );
}

function OverviewTab({ biz, stats, lowStockThreshold, inventory, openReceipt }) {
  const cur = biz.currency;
  const photos = photoIndex(biz);
  const best = [...inventory].sort((a, b) => b.sold - a.sold)[0];
  const lowStock = inventory.filter((i) => i.qty > 0 && i.qty <= lowStockThreshold);
  const oversold = inventory.filter(hasStockDiscrepancy);
  const recentSales = liveSales(biz).slice(0, 3);
  return (
    <div style={S.tabInner} className="bt-tabinner">
      {oversold.length > 0 && (
        <div style={{ ...S.infoCard, borderLeftColor: "var(--danger)" }}>
          <p style={{ ...S.infoLabel, color: "var(--danger)" }}>Stock Discrepancy</p>
          {oversold.map((i) => (
            <p key={i.id} style={S.infoSub}>{i.name}: {Math.abs(i.qty)} more sold than recorded as bought. Restock to correct.</p>
          ))}
        </div>
      )}
      {best && best.sold > 0 && (
        <div style={S.infoCard}>
          {/* The eyebrow stays on its own line: this file already records that
              an eyebrow is not a row and gets no icon column, because putting
              one inline pushes the label out of line with the value beneath
              it. The photo sits beside the VALUE, which is the product. */}
          <p style={S.infoLabel}>Best Seller</p>
          <div style={{ display: "flex", alignItems: "center", gap: PHOTO.gap }}>
            <Photo photoId={best.photoId} size={PHOTO.size} radius={PHOTO.radius} alt="" />
            <div style={{ minWidth: 0 }}>
              <p style={S.infoVal}>{best.name}</p>
              <p style={S.infoSub}>{best.sold} units sold · {fmt(best.unitPrice, cur)} each · {itemEconomics(best).margin}% margin</p>
            </div>
          </div>
        </div>
      )}
      {lowStock.length > 0 && (
        <div style={{ ...S.infoCard, borderLeftColor: "var(--warning)" }}>
          <p style={{ ...S.infoLabel, color: "var(--warning)" }}>Low Stock</p>
          {lowStock.map((i) => (
            /* 20 and 12, which is the icon line, not the photo column. These
               are not rows in a list: they are a compact strip inside a card,
               at the 12px meta size, where the NAME is what is read and the
               picture only confirms it. So the mark behaves as a glyph and
               takes the 20px slot, which puts the text on 72. It was 28 with a
               10px gap, which put it on 78: six pixels off a line running down
               the rest of the screen, which is the near-miss size this file
               has a whole pass about. */
            <div key={i.id} style={{ display: "flex", alignItems: "flex-start", gap: 12, marginTop: 6 }}>
              <Photo photoId={i.photoId} size={20} radius={6} alt="" />
              <p style={{ ...S.infoSub, margin: 0, minWidth: 0 }}>{i.name}: only {i.qty} left</p>
            </div>
          ))}
        </div>
      )}
      <div style={S.statsGrid} className="bt-statsgrid">
        <div style={S.statCard}>
          <p style={S.statLbl}>Total Sales</p>
          <p style={S.statVal}>{stats.salesCount}</p>
        </div>
        <div style={S.statCard}>
          <p style={S.statLbl}>Units Sold</p>
          {/* From the sales list, so one-off custom sales are counted too. */}
          <p style={S.statVal}>{stats.unitsSold}</p>
        </div>
        <div style={S.statCard}>
          <p style={S.statLbl}>Revenue</p>
          <p style={{ ...S.statVal, fontSize: 16 }}>{fmt(stats.revenue, cur)}</p>
        </div>
        <div style={S.statCard}>
          <p style={S.statLbl}>COGS</p>
          <p style={{ ...S.statVal, fontSize: 16 }}>{fmt(stats.cogs, cur)}</p>
        </div>
      </div>
      {recentSales.length > 0 && (
        <>
          <p style={S.sectionHead}>Recent Sales</p>
          {recentSales.map((sale) => <SaleRow key={sale.id} sale={sale} cur={cur} photoById={photos} onReceipt={openReceipt} />)}
        </>
      )}
      {/* There is NO "Deep analysis" button here any more, and its absence is
          the decision. Analysis lives on the Analytics tab: one door, and the
          rows on that screen are it. This button was a second door to a page
          already reachable in one tap from the bar at the bottom of every
          screen, which is not a shortcut, it is a duplicate -- the shape this
          project spent a whole redundancy pass removing.

          The tab still stays QUICK on purpose: it is what you land on, and it
          answers "how is this going" in one screen. Everything that needs a
          period, a pace or a shelf is on the other screen. */}
      <div style={{ height: 8 }} />
    </div>
  );
}

/**
 * One inventory row.
 *
 * Lifted out of `InventoryTab` unchanged when the list split into what is on
 * the shelf and what has sold out, so both groups draw the same row from one
 * definition. Two copies of this markup is exactly the drift this file has
 * spent a week removing: the sale row was byte-identical in two places and
 * had already lost `sale.note` from one of them before anyone noticed.
 */
function InventoryRow({ item, cur, lowStockThreshold, setModal, setRestockItemId, setPhotoItemId }) {
  return (
        <div key={item.id} style={S.invRow}>
          {/* Tappable whether or not there is a photo yet: the empty slot is
              the only affordance saying one can be added to an item that
              already exists. Always rendered, so every row's text starts on
              the same line rather than only the ones with pictures. */}
          <button
            type="button"
            style={S.invPhotoBtn}
            onClick={() => { setPhotoItemId(item.id); setModal("itemPhoto"); }}
            aria-label={item.photoId ? `Change the photo for ${item.name}` : `Add a photo for ${item.name}`}
          >
            <Photo photoId={item.photoId} size={PHOTO.size} radius={PHOTO.radius} alt="" />
          </button>
          {/* A floor, not a guess. `formatMoney` separates the unit from the
              digits with a NON-BREAKING space, which this file already
              records elsewhere, so "FCFA 2,500" is a single unbreakable 86px
              token at 12px. Below that width it cannot wrap and simply
              overflows, which is what the 320px check caught once the photo
              took its column. The floor forces the profit column to give way
              instead, which it can, because it is allowed to wrap. */}
          {/* This row carried EIGHT things, three of them coloured: a green
              profit-per-unit, a green margin pill, and a full-danger delete,
              on every row, eight rows deep. That is the shape section B
              removed from the Home list and described as "six devices per
              row all saying look here".

              What it is now, in the order the Home list settled:

                the figure leads   stock on hand, because Inventory is the
                                   screen you open to manage stock, and it is
                                   the number the badge qualifies
                the name follows
                the meta recedes   price, cost and margin on one quiet line

              GREEN IS GONE. It was on every row, so it discriminated
              nothing, and this app's own rule is that colour means "act on
              this". The only colour left is the badge, and it only appears
              when something needs doing. */}
          <div style={{ flex: 1, minWidth: 96 }}>
            <p style={S.invName}>{item.name}</p>
            {/* Price, cost, units moved. The margin and the profit-per-unit
                that used to sit here are BOTH derived from the first two, and
                they are what the two green marks were showing twice. The deep
                analysis page carries margin per product properly now, so this
                row does not need to. Three facts on one line, and it stops
                wrapping "margin" onto a line of its own. */}
            <p style={S.invSub}>
              {fmt(item.unitPrice, cur)} · cost {fmt(item.avgCost, cur)} · {item.sold} sold
            </p>
            <button
              style={S.restockBtn}
              onClick={() => { setRestockItemId(item.id); setModal("restock"); }}
            >+ Restock</button>
          </div>
          {/* `minWidth: 0` is the fourth appearance of one default in this
              app: a flex child refuses to shrink below its content unless
              told to. Without it this column holds its content's width
              whatever the screen, and at 320 the photo pushed the NAME column
              down to 54px of usable width and clipped every row.

              Delete is NOT here any more. It lived at full danger red beside
              the figures, on every row, one mis-tap from the data and at the
              same weight as it. It is at the foot of the restock sheet now,
              behind a deliberate tap, exactly where `EditSaleModal` puts
              "Delete this sale". */}
          <div style={{ alignItems: "flex-end", display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
            <p style={S.invStock}>{item.qty} left</p>
            {/* An empty shelf is not a low shelf, which is the same rule
                Home's banner was missing. "Low" against "0 left" is a badge
                disagreeing with the figure it qualifies, and it got louder
                when the sold-out rows moved into their own group: what is left
                at zero in the main list is a product just added and not yet
                stocked, which is the one case where the word matters. */}
            {hasStockDiscrepancy(item)
              ? <span style={{ ...S.lowBadge, background: "var(--danger)", color: "var(--card-bg)" }}>Oversold</span>
              : item.qty === 0
                ? <span style={S.lowBadge}>Out</span>
                : item.qty <= lowStockThreshold && <span style={S.lowBadge}>Low</span>}
          </div>
        </div>
  );
}
function InventoryTab({ biz, setModal, setRestockItemId, setPhotoItemId, lowStockThreshold, inventory }) {
  const cur = biz.currency;
  const [showSold, setShowSold] = useState(false);

  /* THE GRAVEYARD.
     The list filtered `deletedAt` and nothing else, so everything an owner had
     ever stocked stayed in it forever. A shop that has run three seasons of
     stock through this app shows three seasons of rows, and the ones that
     still matter -- the ones with something on the shelf -- are scattered
     between them. That is true whatever anyone's reason for wanting a clean
     slate, which is why this is here and the stock-cycle marker is not: this
     one does not rest on a theory about why.

     Sold out is `qty === 0 AND something sold`, which is three exclusions in
     one line and each is deliberate:

       qty < 0    is OVERSOLD, and carries a badge saying the books and the
                  shelf disagree. Hiding the one row that needs correcting
                  would be the worst thing this change could do.
       sold === 0 is a product just added and not yet stocked. Nothing has gone
                  anywhere; the owner is mid-way through setting it up, and it
                  belongs in front of them.
       deletedAt  was already filtered upstream.

     Nothing is destroyed, nothing is archived, and no record changes. This is
     a filter on a list, reversible by one tap, and the count is on the header
     so an empty-looking shop is never a surprise. `archivedAt` in the schema
     stays unused: an owner-declared state needs an owner to declare it, and
     this needs no declaring because the ledger already knows. */
  const soldOut = inventory.filter((i) => i.qty === 0 && i.sold > 0);
  const active = inventory.filter((i) => !(i.qty === 0 && i.sold > 0));

  const row = (item) => (
    <InventoryRow
      key={item.id}
      item={item}
      cur={cur}
      lowStockThreshold={lowStockThreshold}
      setModal={setModal}
      setRestockItemId={setRestockItemId}
      setPhotoItemId={setPhotoItemId}
    />
  );

  return (
    <div style={S.tabInner} className="bt-tabinner">
      <button style={S.dashedBtn} onClick={() => setModal("addItem")}>+ Add New Item</button>
      {inventory.length === 0 && (
        <div style={S.emptyState}>
          <div style={S.emptyIcon}><Package size={40} color="var(--text-primary)" strokeWidth={1.5} /></div>
          <p style={S.emptyTitle}>No items yet</p>
          <p style={S.emptySub}>Add your first product above</p>
        </div>
      )}
      {active.map(row)}

      {/* A shut section, and its header is a CARD ROW rather than a section
          label with a chevron. That distinction is on record: the first
          `Disclosure` was a label, which made it the only control on the
          screen that did not look like one. Everything tappable on this tab
          is a card, so a shut group is one too, at the same radius, the same
          padding and the same hairline as the rows it holds.

          The glyph takes the 20px icon slot and the 12px gap, which puts the
          label on 72. That is correct rather than inconsistent with the rows
          below it: those lead with a product PHOTO, which is content and gets
          its own 100 column, and this leads with an interface mark. */}
      {soldOut.length > 0 && (
        <>
          <button
            type="button"
            aria-expanded={showSold}
            onClick={() => setShowSold((v) => !v)}
            style={S.invGroupRow}
          >
            <Archive size={20} color="var(--text-secondary)" style={{ flexShrink: 0 }} />
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ ...S.invName, display: "block" }}>Sold out</span>
              <span style={{ ...S.invSub, display: "block" }}>
                {soldOut.length} item{soldOut.length > 1 ? "s" : ""} with nothing left
              </span>
            </span>
            <ChevronRight
              size={20}
              color="var(--text-secondary)"
              style={{ flexShrink: 0, transform: showSold ? "rotate(90deg)" : "none", transition: "transform var(--motion-move) var(--ease-out)" }}
            />
          </button>
          {showSold && soldOut.map(row)}
        </>
      )}
      <div style={{ height: 8 }} />
    </div>
  );
}

/**
 * A sale, with the product's photo.
 *
 * The photo comes from the ITEM, looked up by `itemId`, because a sale record
 * does not carry one and should not: the picture belongs to the product, and a
 * copy on every sale would go stale the moment the owner retakes it.
 *
 * `photoById` is a Map built once per list rather than a `find` per row, since
 * both callers render every sale a business has ever made.
 *
 * A custom sale has no `itemId` at all, so it gets the empty slot, which is
 * correct: there is no product in the book for it to be a picture of.
 */
function SaleRow({ sale, cur, photoById, onReceipt }) {
  // A button rather than a div, so one tap reaches the receipt and the row is
  // reachable by keyboard with the focus ring the rest of the app has. There is
  // no competing action on a sale, so the whole surface can carry this one
  // rather than growing a second control on every line.
  return (
    <button
      type="button"
      style={{ ...S.saleRow, width: "100%", border: "none", font: "inherit", color: "inherit", textAlign: "left", cursor: "pointer" }}
      onClick={() => onReceipt?.(sale)}
      aria-label={`Receipt for ${sale.itemName}`}
    >
      <Photo photoId={sale.itemId ? photoById.get(sale.itemId) : null} size={PHOTO.size} radius={PHOTO.radius} alt="" />
      <div style={{ flex: 1, minWidth: 96, marginLeft: PHOTO.gap }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <p style={S.saleName}>{sale.itemName}</p>
          {sale.isCustom && <span style={S.customTag}>Custom ✨</span>}
        </div>
        <p style={S.saleSub}>{sale.qty} {sale.qty > 1 ? "units" : "unit"} · {dateLabel(sale.occurredAt)}{sale.note ? ` · ${sale.note}` : ""}</p>
      </div>
      <div style={{ textAlign: "right", flexShrink: 0, paddingLeft: 12, minWidth: 0, marginLeft: "auto" }}>
        <p style={S.saleRev}>{fmt(saleRevenue(sale), cur)}</p>
        <p style={S.salePft}>+{fmt(saleProfit(sale), cur)}</p>
      </div>
    </button>
  );
}

/** itemId -> photoId, including soft-deleted items: a sale of something since
 *  removed from the list should still show what was sold. */
function photoIndex(biz) {
  return new Map((biz?.items || []).filter((i) => i.photoId).map((i) => [i.id, i.photoId]));
}

function SalesTab({ biz, openReceipt }) {
  const cur = biz.currency;
  const sales = liveSales(biz);
  const photos = photoIndex(biz);
  return (
    <div style={S.tabInner} className="bt-tabinner">
      {/* No dashed "+ Record New Sale" and no all-time card, and both removals
          are the same finding: this tab said things it had already said.

          The dashed button is what the floating Sale button REPLACED when
          recording a sale went from four taps to one. It survived the change,
          so the two sat on screen together, 800px apart, doing one job.

          The card under it read "All Time - Revenue X, Profit Y" while the hero
          two hundred pixels above read the same two figures for the same
          period. It was also the only green SURFACE in the app, so the copy was
          louder than the original. */}
      {sales.length === 0 && (
        <div style={S.emptyState}>
          <div style={S.emptyIcon}><Coins size={40} color="var(--text-primary)" strokeWidth={1.5} /></div>
          <p style={S.emptyTitle}>No sales yet</p>
          <p style={S.emptySub}>Tap the Sale button to record your first one</p>
        </div>
      )}
      {sales.map((sale) => <SaleRow key={sale.id} sale={sale} cur={cur} photoById={photos} onReceipt={openReceipt} />)}
      <div style={{ height: 8 }} />
    </div>
  );
}

/**
 * Invoices: money asked for, and never once counted as money received.
 *
 * Outstanding first, because "who owes me" is the only question this screen
 * exists to answer. A settled invoice is history and sits below.
 */
function InvoicesTab({ biz, setModal, openInvoice }) {
  const cur = biz.currency;
  const all = (biz.invoices || []).filter((v) => !v.deletedAt);
  const outstanding = all.filter((v) => !v.paidAt);
  const settled = all.filter((v) => v.paidAt);
  const owed = outstanding.reduce((n, v) => n + invoiceTotal(v), 0);

  const row = (v) => (
    <button
      key={v.id}
      type="button"
      style={{ ...S.saleRow, width: "100%", border: "none", font: "inherit", color: "inherit", textAlign: "left", cursor: "pointer" }}
      onClick={() => openInvoice(v)}
      aria-label={`Invoice for ${v.customerName || "no name"}`}
    >
      <div style={{ flex: 1, minWidth: 96 }}>
        <p style={S.saleName}>{v.customerName || "No name"}</p>
        <p style={S.saleSub}>
          {v.lines.length} {v.lines.length === 1 ? "item" : "items"} · {dateLabel(v.issuedAt)}
          {v.paidAt ? ` · ${v.paidMethod || "Paid"}` : ""}
        </p>
      </div>
      <div style={{ textAlign: "right", flexShrink: 0, paddingLeft: 12, minWidth: 0, marginLeft: "auto" }}>
        <p style={S.saleRev}>{fmt(invoiceTotal(v), cur)}</p>
        <p style={{ ...S.bizRowNote, color: v.paidAt ? "var(--success)" : "var(--warning)" }}>
          {v.paidAt ? "Paid" : "Unpaid"}
        </p>
      </div>
    </button>
  );

  return (
    <div style={S.tabInner} className="bt-tabinner">
      <button style={S.dashedBtn} onClick={() => setModal("addInvoice")}>+ New Invoice</button>

      {owed > 0 && (
        <div style={{ ...S.infoCard, borderLeftColor: "var(--warning)" }}>
          <p style={{ ...S.infoLabel, color: "var(--warning)" }}>Outstanding</p>
          <p style={S.infoVal}>{fmt(owed, cur)}</p>
          {/* Said out loud, because a total sitting on a screen inside a books
              app is exactly the thing someone could read as income. */}
          <p style={S.infoSub}>
            Across {outstanding.length} unpaid {outstanding.length === 1 ? "invoice" : "invoices"}.
            Not counted in your revenue until you record the sale.
          </p>
        </div>
      )}

      {all.length === 0 && (
        <div style={S.emptyState}>
          <div style={S.emptyIcon}><ScrollText size={40} color="var(--text-primary)" strokeWidth={1.5} /></div>
          <p style={S.emptyTitle}>No invoices yet</p>
          <p style={S.emptySub}>Send one when a customer owes you</p>
        </div>
      )}

      {outstanding.map(row)}
      {settled.length > 0 && <p style={S.sectionHead}>Settled</p>}
      {settled.map(row)}
      <div style={{ height: 8 }} />
    </div>
  );
}

/** Build an invoice: who it is for, and what they owe. */
function AddInvoiceModal({ ctx }) {
  const { setModal, activeBiz, activeBizId, addInvoice, setInvoiceId } = ctx;
  const cur = activeBiz?.currency;
  const inventory = activeBiz ? deriveInventory(activeBiz).filter((i) => !i.deletedAt) : [];

  const [customerName, setCustomerName] = useState("");
  const [customerContact, setCustomerContact] = useState("");
  const [lines, setLines] = useState([]);
  const [itemId, setItemId] = useState(inventory[0]?.id || "");
  const [qty, setQty] = useState("1");
  const [price, setPrice] = useState(inventory[0] ? String(toMajor(inventory[0].unitPrice, cur)) : "");
  const [error, setError] = useState(null);

  const total = lines.reduce((n, l) => n + l.qty * l.unitPrice, 0);

  const addLine = () => {
    setError(null);
    const item = inventory.find((i) => i.id === itemId);
    if (!item) return setError("Pick an item.");
    const q = Math.max(1, Math.round(num(qty, 0)));
    if (!(q > 0)) return setError("Quantity has to be at least 1.");
    // No stock check here, deliberately. An invoice is a request for payment
    // for work that may not be done yet, so refusing to bill for something the
    // owner is about to make or restock would be the oversell guard applied
    // where it does not belong. Stock moves when the SALE is recorded.
    setLines((ls) => [...ls, { itemId: item.id, name: item.name, qty: q, unitPrice: toMinor(price, cur) }]);
    setQty("1");
  };

  const create = () => {
    setError(null);
    if (!lines.length) return setError("Add at least one item to the invoice.");
    const invoice = addInvoice(activeBizId, {
      customerName: customerName.trim(),
      customerContact: customerContact.trim(),
      lines,
    });
    // Straight to the document, because the only reason to make one is to send
    // it and everything it needs is already on screen.
    setInvoiceId(invoice.id);
    setModal("invoice");
  };

  return (
    <ModalShell onClose={() => setModal(null)} title="New Invoice">
      <div style={S.modalBody}>
        <p style={S.fieldLabel}>Customer name</p>
        <input style={S.input} value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Who is this for?" />

        <p style={S.fieldLabel}>Phone or email (optional)</p>
        <input style={S.input} value={customerContact} onChange={(e) => setCustomerContact(e.target.value)} placeholder="e.g. 677 00 00 00" />

        <p style={S.fieldLabel}>Add an item</p>
        <Select
          full
          value={itemId}
          ariaLabel="Select item"
          options={inventory.map((i) => ({
            value: i.id,
            label: i.name,
            icon: <Photo photoId={i.photoId} size={32} radius={8} alt="" />,
          }))}
          onChange={(id) => {
            setItemId(id);
            const it = inventory.find((i) => i.id === id);
            if (it) setPrice(String(toMajor(it.unitPrice, cur)));
          }}
        />

        <div style={{ display: "flex", gap: 12 }}>
          <div style={{ flex: 1 }}>
            <p style={S.fieldLabel}>Quantity</p>
            <input style={S.input} type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} />
          </div>
          <div style={{ flex: 1 }}>
            <p style={S.fieldLabel}>Price ({cur})</p>
            <input style={S.input} type="number" min="0" value={price} onChange={(e) => setPrice(e.target.value)} />
          </div>
        </div>

        <button style={{ ...S.textBtn, alignSelf: "flex-start" }} onClick={addLine}>+ Add to invoice</button>

        {lines.length > 0 && (
          <div style={S.calcPreview}>
            {lines.map((l, i) => (
              <p key={l.itemId + ":" + i} style={S.calcLabel}>
                {l.qty} × {l.name} <strong>{fmt(l.qty * l.unitPrice, cur)}</strong>
              </p>
            ))}
            <p style={S.calcLabel}>Total <strong>{fmt(total, cur)}</strong></p>
          </div>
        )}

        {error && <p style={S.formError}>{error}</p>}
        <button style={S.primaryBtn} onClick={create}>Create invoice</button>
      </div>
    </ModalShell>
  );
}

/** The invoice document: preview it, send it, mark it paid. */
function InvoiceModal({ ctx }) {
  const { setModal, activeBiz, activeBizId, invoiceId, setInvoiceId, userName, showToast, updateInvoice, deleteInvoice, ask } = ctx;
  const invoice = (activeBiz?.invoices || []).find((v) => v.id === invoiceId && !v.deletedAt) || null;
  const [state, setState] = useState({ status: "drawing", url: null, blob: null });

  const close = () => { setInvoiceId(null); setModal(null); };
  // Redraw when it is paid, because the document says so on its face.
  const drawKey = invoice ? invoice.id + ":" + (invoice.paidAt || "") : "";

  useEffect(() => {
    if (!invoice || !activeBiz) return undefined;
    let live = true;
    let url = null;
    let bitmaps = [];

    (async () => {
      try {
        const bitmapByItemId = new Map();
        if (typeof createImageBitmap === "function") {
          for (const itemId of new Set(invoice.lines.map((l) => l.itemId).filter(Boolean))) {
            const photoId = activeBiz.items?.find((i) => i.id === itemId)?.photoId;
            if (!photoId) continue;
            const blob = await resolvePhotoBlob(photoId);
            if (!blob) continue;
            try {
              const bmp = await createImageBitmap(blob);
              bitmaps.push(bmp);
              bitmapByItemId.set(itemId, bmp);
            } catch { /* an undecodable photo is a missing photo, not an error */ }
          }
        }
        const blob = await drawReceipt({
          kind: "INVOICE",
          business: activeBiz,
          sales: invoice.lines,
          ownerName: userName,
          bitmapByItemId,
          number: receiptNumber({ id: invoice.id, occurredAt: invoice.issuedAt }).replace(/^R-/, "INV-"),
          customerName: invoice.customerName,
          customerContact: invoice.customerContact,
          dueAt: invoice.dueAt,
          paidAt: invoice.paidAt,
          footerNote: invoice.paidAt ? "Paid, thank you" : "Please pay on receipt",
        });
        for (const b of bitmaps) b.close?.();
        bitmaps = [];
        if (!live) return;
        url = URL.createObjectURL(blob);
        setState({ status: "ready", url, blob });
      } catch (err) {
        for (const b of bitmaps) b.close?.();
        if (live) setState({ status: "error", url: null, blob: null, message: err?.message });
      }
    })();

    return () => { live = false; if (url) URL.revokeObjectURL(url); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawKey, activeBiz, userName]);

  if (!invoice) {
    return (
      <ModalShell onClose={close} title="Invoice">
        <div style={S.modalBody}>
          <p style={S.emptySub}>That invoice is no longer here.</p>
          <button style={S.primaryBtn} onClick={close}>Close</button>
        </div>
      </ModalShell>
    );
  }

  const number = receiptNumber({ id: invoice.id, occurredAt: invoice.issuedAt }).replace(/^R-/, "INV-");

  const send = async () => {
    if (!state.blob) return;
    const how = await shareReceipt({ blob: state.blob, filename: `invoice-${number}.png`, title: "Invoice" });
    if (how === "downloaded") showToast("Invoice saved to your downloads.");
    if (how === "shared") showToast("Invoice sent.");
  };

  const markPaid = async () => {
    const yes = await ask({
      title: "Mark this invoice paid?",
      body: "This records that the customer settled it. It does NOT add the money to your books: record the sale for that, so stock and profit move with it.",
      confirmLabel: "Mark as paid",
    });
    if (!yes) return;
    updateInvoice(activeBizId, invoice.id, { paidAt: new Date().toISOString(), paidMethod: "Other" });
    showToast("Marked paid. Record the sale to put it in your books.");
  };

  return (
    <ModalShell onClose={close} title={invoice.paidAt ? "Invoice · Paid" : "Invoice"}>
      <div style={S.modalBody}>
        {state.status === "drawing" && (
          <p style={{ ...S.emptySub, textAlign: "center", padding: "24px 0" }}>Preparing the invoice...</p>
        )}
        {state.status === "error" && <p style={S.formError}>{state.message || "The invoice could not be created."}</p>}
        {state.status === "ready" && (
          <img
            src={state.url}
            alt={`Invoice ${number}`}
            style={{ width: "100%", height: "auto", borderRadius: 12, display: "block", boxShadow: "0 0 0 1px var(--border-color)" }}
          />
        )}

        <button
          style={{ ...S.primaryBtn, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
          disabled={state.status !== "ready"}
          onClick={send}
        >
          <Share size={16} />
          Send invoice
        </button>

        {!invoice.paidAt && (
          <button style={{ ...S.photoBtn, justifyContent: "center", width: "100%" }} onClick={markPaid}>
            <Check size={15} />
            Mark as paid
          </button>
        )}

        <button
          style={{ ...S.textBtn, alignSelf: "center", color: "var(--danger)" }}
          onClick={async () => {
            const yes = await ask({
              title: "Remove this invoice?",
              body: "It comes off your list. Any sale you have already recorded for it is kept.",
              confirmLabel: "Remove invoice",
              danger: true,
            });
            if (yes) { deleteInvoice(activeBizId, invoice.id); close(); }
          }}
        >Remove invoice</button>

      </div>
    </ModalShell>
  );
}

/* ─── ANALYTICS SCREEN ──────────────────────────────────────────────────────── */

function AnalyticsScreen({ ctx }) {
  const { businesses, setScreen, isDarkMode, lowStockThreshold, openAnalysis } = ctx;

  const now = new Date();
  const monthStart = startOfMonth(now);
  const lastMonthStart = startOfMonth(now, 1);
  const month = calcPortfolioStats(businesses, { since: monthStart });
  const lastMonth = calcPortfolioStats(businesses, { since: lastMonthStart, until: monthStart });
  const allTime = calcPortfolioStats(businesses);
  const monthName = now.toLocaleDateString("en-US", { month: "long" });
  const lastMonthName = new Date(lastMonthStart + "T00:00:00.000Z")
    .toLocaleDateString("en-US", { month: "long", timeZone: "UTC" });

  const weeks = weeklyProfit(businesses, { weeks: 8, now });
  const tradingWeeks = weeks.filter((w) => w.salesCount > 0).length;
  // LEADING empty weeks are dropped; interior ones are not, and the difference
  // is the whole rule. A gap in the middle is information -- four quiet weeks
  // between two busy ones is a fact about the shop, and closing it up turns a
  // stall into a smooth line. Weeks BEFORE the first sale are not a quiet
  // patch, they are time the shop did not exist in these books, and drawing
  // them put every bar in the right third of the card under an empty expanse:
  // a chart that reads as broken rather than as a short history.
  //
  // This is half of the question pinned since 15 September, answered from the
  // side that needs no new decision: the axis grows with the books instead of
  // starting at eight and waiting to be filled.
  const firstTrading = weeks.findIndex((w) => w.salesCount > 0);
  const shownWeeks = firstTrading > 0 ? weeks.slice(firstTrading) : weeks;
  const chartData = shownWeeks.map((w) => {
    const d = new Date(w.start + "T00:00:00.000Z");
    return {
      name: d.getUTCDate() + "/" + (d.getUTCMonth() + 1),
      profit: w.profit,
      color: "var(--accent-color)",
    };
  });

  const ranked = businesses
    .map((b) => ({ ...b, stats: calcBizStats(b) }))
    .sort((a, b) => b.stats.profit - a.stats.profit);
  const rankedTotal = ranked.reduce((sum, b) => sum + Math.max(0, b.stats.profit), 0);

  // ── where the profit comes from ────────────────────────────────────────────
  //
  // A ring cannot draw a negative, so a business at a loss contributes nothing
  // to it. That would be a chart quietly omitting the very thing worth looking
  // at, so the losers are counted and named underneath rather than dropped in
  // silence.
  const ringSlices = ranked
    .filter((b) => b.stats.profit > 0)
    // `heroTint`, not the raw colour, and the rank key below uses the same
    // function so the two match exactly. White on the RAW palette fails AA on
    // NINE of the sixteen, worst 3.10:1 on the sage, which is the precise
    // failure `heroTint` exists to prevent. Tinted, the worst is 6.16:1.
    .map((b) => ({ id: b.id, name: b.name, value: b.stats.profit, color: ringColor(b.color, isDarkMode) }));
  const atALoss = ranked.filter((b) => b.stats.profit < 0);
  const finding = portfolioFinding(businesses, { lowStockThreshold });
  // One business is always 100% of itself, which is a ring that says nothing.
  const showRing = ringSlices.length > 1;

  // % change is only meaningful against a month that actually traded.
  const deltaPct =
    lastMonth.profit > 0 ? Math.round(((month.profit - lastMonth.profit) / lastMonth.profit) * 100) : null;

  if (allTime.revenue === 0) {
    return (
      <div style={S.screen} className="bt-screen">
        <div style={S.pageHeader}>
          <button style={S.backBtn} onClick={() => setScreen("home")} aria-label="Back"><ArrowLeft size={22} /></button>
          <h2 style={S.pageTitle}>Analytics</h2>
          <div style={{ width: 44 }} />
        </div>
        <div style={S.tabInner} className="bt-tabinner">
          <div style={S.emptyState}>
            <div style={S.emptyIcon}><BarChart2 size={40} color="var(--text-primary)" strokeWidth={1.5} /></div>
            <p style={S.emptyTitle}>Nothing to analyse yet</p>
            <p style={S.emptySub}>Record a few sales and this page will show how your weeks compare.</p>
          </div>
        </div>
      </div>
    );
  }

  // With ONE business the portfolio level and the business level are the same
  // numbers: one row, and a ring that is 100% of itself. An overview that shows
  // a total and then asks the owner to tap their only business to see the same
  // total again is a tollbooth on every visit, so there is no drill-down at
  // all: this tab IS the deep page. Both real users are in this case.
  if (businesses.length === 1) {
    return <BizAnalysisScreen ctx={ctx} biz={businesses[0]} onBack={() => setScreen("home")} title="Analytics" />;
  }

  return (
    <div style={S.screen} className="bt-screen">
      <div style={S.pageHeader}>
        <button style={S.backBtn} onClick={() => setScreen("home")} aria-label="Back"><ArrowLeft size={22} /></button>
        <h2 style={S.pageTitle}>Analytics</h2>
        <div style={{ width: 44 }} />
      </div>

      <div style={S.tabInner} className="bt-tabinner">
        {/* A total on its own cannot be acted on. What this month is worth
            compared to last month can be. marginInline is cleared because
            tabInner already supplies the gutter. */}
        <div style={{ ...S.summaryCard, margin: 0 }}>
          <p style={S.summaryLabel}>Profit · {monthName}</p>
          <DisplayAmount minor={month.profit} style={S.summaryAmount} />
          {/* Two facts about the month this card is labelled with, which is
              what a meta line under a figure is for, and the same pair the
              business hero carries.

              There used to be a third, "All time", and it was wrong twice
              over: it is the only chip on the row naming a different period
              from the heading above it, and the ring lower down already
              carries that exact number in its hole, which is the whole
              argument for a ring over a pie here. A screen that prints one
              figure twice invites the reader to look for the difference. */}
          <div style={S.heroMeta}>
            <span>Revenue <b style={S.heroMetaVal}>{fmt(month.revenue)}</b></span>
            <span>Margin <b style={S.heroMetaVal}>{month.margin}%</b></span>
          </div>
          <p style={S.summaryNote}>
            {deltaPct === null ? (
              lastMonth.revenue > 0
                ? `${lastMonthName} made no profit to compare against.`
                : `Nothing was recorded in ${lastMonthName}.`
            ) : (
              <>
                <strong style={{ fontWeight: 600 }}>
                  {deltaPct >= 0 ? "▲" : "▼"} {Math.abs(deltaPct)}%
                </strong>{" "}
                against {lastMonthName} ({fmt(lastMonth.profit)})
              </>
            )}
          </p>
        </div>

        <AnalyticsLead finding={finding} />

        <p style={S.sectionHead}>Profit by week</p>
        {tradingWeeks < 2 ? (
          <div style={S.noteCard}>
            <p style={S.infoSub}>
              A trend needs more than one week of trading. You have {tradingWeeks === 1 ? "one week" : "none"} so far.
              This chart fills in as you record sales.
            </p>
          </div>
        ) : (
          <div style={{ ...S.chartCard, height: 208 }}>
            <Suspense fallback={<div style={{ height: "100%" }} />}>
              <ProfitChart data={chartData} format={fmt} />
            </Suspense>
          </div>
        )}

        {/* PSY-2: adding a SECOND business silently changes what this screen
            is. With one, the Analytics tab is that business's deep page --
            months of cover, capital on the shelf, pace per product. Add
            another and the same tab becomes a portfolio overview, and
            everything the owner had been reading here moves behind a tap with
            nothing on screen saying where it went. That is a cost of the
            one-business rule, which is still right; what was missing was the
            sentence.

            It sits inside the heading's own block rather than beside it, so
            `tabInner`'s 12px gap does not land between a head and its own
            subtitle. That is the margin-in-a-gap-container trap this file has
            recorded three times: the 28 break is on the wrapper, and the head
            inside it spends nothing. */}
        <div style={{ marginTop: 16 }}>
          <p style={{ ...S.sectionHead, marginTop: 0 }}>Profit by business</p>
          {/* The total moved OUT of a chart and into this line, and that is the
              fix rather than a consolation. In the ring's hole it was a money
              string whose currency unit is deliberately demoted, so the digits
              sat 13.7px off the centre of a circle while every box around them
              measured dead centre. Left-aligned on a line of type there is no
              centre to miss. */}
          <p style={{ ...S.infoSub, margin: "4px 0 0" }}>
            {fmt(rankedTotal, businesses[0]?.currency)} all time. Tap a shop for its full analysis.
          </p>
        </div>

        {showRing && (
          <>
            {/* On the page ground, not on a card. It is 16px tall against the
                ring's 232px card, it needs no surface to be legible, and the
                gaps between its segments are the page showing through, which is
                correct in both themes without a value being chosen for either. */}
            <div style={{ marginTop: 4 }}>
              <ShareBar data={ringSlices} />
            </div>
            {atALoss.length > 0 && (
              <p style={{ ...S.infoSub, margin: "-4px 0 4px" }}>
                {atALoss.map((b) => b.name).join(", ")}{" "}
                {atALoss.length === 1 ? "is" : "are"} running at a loss, so
                {atALoss.length === 1 ? " it is" : " they are"} not in the bar.
              </p>
            )}
          </>
        )}

        {ranked.map((b, i) => {
          // Share of total profit -- the concentration question. A single
          // business at 80% is a risk worth seeing.
          const share = rankedTotal > 0 ? Math.round((Math.max(0, b.stats.profit) / rankedTotal) * 100) : 0;
          return (
            <button
              key={b.id}
              type="button"
              style={{ ...S.analyticsRow, width: "100%", border: "none", font: "inherit", color: "inherit", textAlign: "left", cursor: "pointer" }}
              onClick={() => openAnalysis(b.id, "analytics")}
              aria-label={`Analysis for ${b.name}`}
            >
              {/* The rank IS the identity mark, so there is no second one.
                  The disc carries the shop's colour whether or not a ring is
                  drawn above it: with a ring it is the key, without one it is
                  still the only thing on this row that says which shop this
                  is, and a mark that changes shape depending on how many
                  businesses are profitable is not a mark.

                  The emoji that used to sit beside it is gone. It was a second
                  identity signal for one identity, and it is what pushed this
                  list's names onto 104 -- a column 4px off the photo lists
                  below and 32 off the icon line above, which is to say off the
                  system entirely. Without it the name lands on 72, which the
                  settings rows and every other icon row already use.

                  The text on the disc follows the theme, because the disc and
                  the segment are the same colour by construction: white on the
                  darkened light-mode fill, dark ink on the lifted dark-mode
                  one. Measured worst case 6.16:1 and 6.17:1. */}
              <span style={{ ...S.rankNum, ...S.rankKey, background: ringColor(b.color, isDarkMode), color: isDarkMode ? "var(--focus-ground)" : "var(--on-color)" }}>
                {i + 1}
              </span>
              <div style={{ minWidth: 0 }}>
                <p style={S.bizName}>{b.name}</p>
                <p style={S.bizCat}>{share}% of profit · {b.stats.margin}% margin</p>
              </div>
              <p style={S.analyticsProfit}>{fmt(b.stats.profit, b.currency)}</p>
              {/* The share bar that used to sit here is gone. With the ring
                  above, share was encoded three times on one screen: as a
                  percentage, as a bar, and as a segment. A column of bars is
                  the worst of the three at the question share is FOR, which is
                  how concentrated the income is. */}
            </button>
          );
        })}

        {/* There is NO cross-business "What earns the most" here, and the
            argument against it is already written down in this project: a
            business is the boundary where stock, cost and price are
            comparable. Ranking a crochet shawl against a phone screen
            replacement produces an order nobody can act on, because stock and
            price cannot move between them, and across two currencies the
            comparison is not merely unhelpful, it is wrong.

            It was five rows and a heading, about a third of this page, saying
            something the page could not support. The per-business version on
            the deep page is the same question asked where it has an answer,
            and it is one tap away on every row above. */}

        <div style={{ height: 8 }} />
      </div>
    </div>
  );
}

/* ─── BUSINESS ANALYSIS ─────────────────────────────────────────────────────── */

/**
 * The periods a business review can be written on.
 *
 * Presets rather than a date picker, because a picker on a phone is four taps
 * to answer a question the owner asks in one, and because the interesting
 * boundaries here are all calendar months. A real custom range is the thing to
 * add if anyone asks for one.
 *
 * The default is three months, not this month. This is the DEEP page: its whole
 * subject is pace, trend and whether stock is moving, and none of those mean
 * anything over eleven days. Home is where "this month" lives.
 */
const PERIODS = [
  { value: "3m", label: "Last 3 months" },
  { value: "month", label: "This month" },
  { value: "lastMonth", label: "Last month" },
  { value: "all", label: "All time" },
];

function periodBounds(key, now = new Date()) {
  if (key === "month") return { since: startOfMonth(now) };
  if (key === "lastMonth") return { since: startOfMonth(now, 1), until: startOfMonth(now) };
  if (key === "3m") return { since: startOfMonth(now, 2) };
  return {};
}

/** Urgency first, then money. A shelf that needs acting on outranks a big one. */
const STOCK_RANK = {
  [STOCK.OVERSOLD]: 0,
  [STOCK.SOLD_OUT_RISK]: 1,
  [STOCK.OVERSTOCKED]: 2,
  [STOCK.UNSOLD]: 3,
  [STOCK.OUT_OF_STOCK]: 4,
  [STOCK.HEALTHY]: 5,
};

const STOCK_LABEL = {
  [STOCK.OVERSOLD]: { text: "Oversold", tone: "var(--danger)" },
  [STOCK.SOLD_OUT_RISK]: { text: "Running out", tone: "var(--warning)" },
  [STOCK.OVERSTOCKED]: { text: "Overstocked", tone: "var(--warning)" },
  [STOCK.UNSOLD]: { text: "Not selling", tone: "var(--text-secondary)" },
  [STOCK.OUT_OF_STOCK]: { text: "Sold out", tone: "var(--text-secondary)" },
  [STOCK.HEALTHY]: { text: "Moving", tone: "var(--success)" },
};

/**
 * One business, in depth.
 *
 * This exists because the app was built around a PORTFOLIO and both real users
 * have one business. For them, "profit by business" is a heading above a single
 * row, and the questions they actually ask -- which product earns, which is
 * stuck on the shelf, how much cash is tied up in it -- had nowhere to live.
 *
 * A business is also the only boundary where these numbers mean anything.
 * Ranking a crocheted shawl against a phone screen replacement produces a list
 * nobody can act on, because stock and price cannot move between them, and
 * across two currencies the comparison is simply wrong. So depth belongs here
 * rather than on the portfolio screen, and the portfolio screen keeps the one
 * question it can answer: which of these is carrying the others.
 */
function BizAnalysisScreen({ ctx, biz, onBack, title = "Analysis" }) {
  const { activeBiz, setScreen, analysisFrom, lowStockThreshold, showToast } = ctx;
  const [period, setPeriod] = useState("3m");

  // Usually this is a sub-screen of whichever place opened it. With a single
  // business it is the Analytics TAB itself, and then it is a root destination
  // with no business to have been opened from, so both are passed in.
  const subject = biz || activeBiz;
  if (!subject) return null;
  const cur = subject.currency;
  const money = (minor) => fmt(minor, cur);
  const bounds = periodBounds(period);
  const label = PERIODS.find((p) => p.value === period)?.label || "";

  const stats = calcBizStats(subject, bounds);
  const months = monthlyProfit([subject], { months: period === "all" ? 12 : 6 });
  const items = itemPerformance([subject], bounds).sort((a, b) => b.profit - a.profit);
  const health = inventoryHealth(subject, { ...bounds, lowStockThreshold })
    .sort((a, b) => (STOCK_RANK[a.status] - STOCK_RANK[b.status]) || (b.value - a.value));
  const shelf = stockValue(subject);
  const finding = portfolioFinding([subject], { lowStockThreshold });

  // Only worth drawing once there is more than one month with anything in it.
  // Two bars and four empty slots is not a trend, it is a short history, and
  // the note says which.
  const tradingMonths = months.filter((m) => m.salesCount > 0).length;
  const chartData = months.map((m) => ({
    name: new Date(m.start + "T00:00:00.000Z").toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }),
    profit: m.profit,
    // The stack is profit + cost, so the bar's full height is revenue without
    // revenue ever being a series of its own and double counting it.
    cost: Math.max(0, m.revenue - m.profit),
    color: "var(--accent-color)",
  }));

  const copy = async () => {
    const text = buildBizSummary(subject, { label, stats, items, health, shelf });
    try {
      await navigator.clipboard.writeText(text);
      showToast("Summary copied to your clipboard");
    } catch {
      const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `${subject.name.replace(/[^a-z0-9]+/gi, "_")}_summary.txt`;
      a.click();
      URL.revokeObjectURL(url);
      showToast("Saved as a file instead");
    }
  };

  return (
    <div style={S.screen} className="bt-screen">
      <div style={S.pageHeader}>
        <button style={S.backBtn} onClick={onBack || (() => setScreen(analysisFrom || "business"))} aria-label="Back"><ArrowLeft size={22} /></button>
        <h2 style={S.pageTitle}>{title}</h2>
        <div style={{ width: 44 }} />
      </div>

      <div style={S.tabInner} className="bt-tabinner">
        {/* The business is named here rather than in the title bar, because the
            title says what KIND of screen this is and there is one of these per
            business. The period sits with it: every number below answers to it,
            so it belongs above all of them rather than beside the first one. */}
        <div style={S.analysisHead}>
          <p style={S.analysisBiz}>{subject.name}</p>
          <Select
            value={period}
            onChange={setPeriod}
            options={PERIODS}
            ariaLabel="Period"
          />
        </div>

        <div style={{ ...S.summaryCard, margin: 0 }}>
          <p style={S.summaryLabel}>Profit · {label}</p>
          <DisplayAmount minor={stats.profit} currency={cur} style={S.summaryAmount} />
          <div style={S.heroMeta}>
            <span>Revenue <b style={S.heroMetaVal}>{money(stats.revenue)}</b></span>
            <span>Margin <b style={S.heroMetaVal}>{stats.margin}%</b></span>
            <span>Sales <b style={S.heroMetaVal}>{stats.salesCount}</b></span>
          </div>
        </div>

        <AnalyticsLead finding={finding} />

        <p style={S.sectionHead}>Month by month</p>
        {tradingMonths < 2 ? (
          <div style={S.noteCard}>
            <p style={S.infoSub}>
              {tradingMonths === 1 ? "One month of trading so far." : "No sales recorded yet."} This fills in as you record sales.
            </p>
          </div>
        ) : (
          <>
            <div style={{ ...S.chartCard, height: 216 }}>
              <Suspense fallback={<div style={{ height: "100%" }} />}>
                <ProfitChart data={chartData} format={money} showRevenue />
              </Suspense>
            </div>
            <p style={S.chartNote}>
              Each bar is that month&apos;s revenue. The solid part is what you kept. The last month is still running.
            </p>
          </>
        )}

        <p style={S.sectionHead}>What earns the most</p>
        {items.length === 0 ? (
          <div style={S.noteCard}><p style={S.infoSub}>Nothing sold in this period.</p></div>
        ) : (
          items.slice(0, 6).map((item) => (
            <div key={item.key} style={S.invRow}>
              <Photo photoId={item.photoId} size={PHOTO.size} radius={PHOTO.radius} alt="" />
              <div style={{ flex: 1, minWidth: 96, marginLeft: PHOTO.gap }}>
                <p style={S.invName}>{item.name}</p>
                {/* Units AND the number of sales, because they are different
                    businesses. 42 units over 41 sales is a counter people walk
                    up to; 10 units over 5 is bulk orders. */}
                <p style={S.invSub}>
                  {item.units} {item.units === 1 ? "unit" : "units"} over {item.sales} {item.sales === 1 ? "sale" : "sales"} · {item.margin}% margin
                </p>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0, paddingLeft: 12, marginLeft: "auto" }}>
                <p style={S.invProfit}>{money(item.profit)}</p>
                <p style={S.invSub}>on {money(item.revenue)}</p>
              </div>
            </div>
          ))
        )}

        <p style={S.sectionHead}>Stock health</p>
        {health.length === 0 ? (
          <div style={S.noteCard}>
            <p style={S.infoSub}>Nothing is stocked here, so there is no shelf to report on.</p>
          </div>
        ) : (
          <>
            {/* The number nobody had. Capital standing still is what takes a
                trading business down, and every warning this app gave before
                pointed the other way, at stock running LOW. */}
            <div style={S.shelfCard}>
              <p style={S.infoLabel}>On the shelf right now</p>
              <p style={S.shelfValue}>{money(shelf.value)}</p>
              {shelf.unpriced > 0 && (
                <p style={{ ...S.infoSub, color: "var(--warning)" }}>
                  {shelf.unpriced} {shelf.unpriced === 1 ? "product has" : "products have"} no real cost recorded, so this total is
                  low and their margins are not your margins.
                </p>
              )}
            </div>
            {health.map((row) => {
              const tag = STOCK_LABEL[row.status];
              return (
                <div key={row.id} style={S.invRow}>
                  <Photo photoId={row.photoId} size={PHOTO.size} radius={PHOTO.radius} alt="" />
                  <div style={{ flex: 1, minWidth: 96, marginLeft: PHOTO.gap }}>
                    <div style={S.invNameRow}>
                      <p style={S.invName}>{row.name}</p>
                      <span style={{ ...S.lowBadge, background: "transparent", color: tag.tone, boxShadow: `inset 0 0 0 1px ${tag.tone}` }}>
                        {tag.text}
                      </span>
                    </div>
                    <p style={S.invSub}>
                      {row.qty} left · {row.soldInPeriod} sold · {row.sellThrough}% sold through
                    </p>
                    {/* Months of cover is the sentence that changes behaviour.
                        "7% sell-through" is true and moves nobody; "42 months
                        of stock at this pace" is a decision. */}
                    {row.monthsOfCover !== null && row.qty > 0 && (
                      <p style={S.invSub}>{row.monthsOfCover} months of stock at this pace</p>
                    )}
                    {/* The batch question, and ONLY when the batch belongs to
                        the period being reported. It answers a different window
                        from the line above, so out of period the two sit
                        together reading as a contradiction: one product showed
                        "0 sold" beside "1 sold since you restocked 1", because
                        that restock was three months before the window. */}
                    {row.lastRestockAt && (!bounds.since || row.lastRestockAt >= bounds.since) && (
                      <p style={S.invSub}>
                        {row.soldSinceRestock} sold since restocking {row.lastRestockQty} on {shortDate(row.lastRestockAt)}
                      </p>
                    )}
                  </div>
                  {row.qty > 0 && (
                    <div style={{ textAlign: "right", flexShrink: 0, paddingLeft: 12, marginLeft: "auto" }}>
                      <p style={S.invName}>{money(row.value)}</p>
                      <p style={S.invSub}>{row.costSuspect ? "cost missing" : "on the shelf"}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}

        <button type="button" style={{ ...S.ghostBtn, marginTop: 16 }} onClick={copy}>
          Copy this business for analysis
        </button>
        <p style={{ ...S.infoSub, textAlign: "center", margin: 0 }}>
          Copies to your clipboard only. Nothing is sent anywhere.
        </p>

        <div style={{ height: 8 }} />
      </div>
    </div>
  );
}

/**
 * The same page as text, for pasting somewhere that can reason about it.
 *
 * One of the two real users already does this by hand: export, paste into an
 * AI, read what comes back. This is that loop with the transcription removed.
 * It stays a COPY and nothing else while the privacy policy still says records
 * are not sent to third parties, because a button that posted the books
 * somewhere would make that false.
 */
function buildBizSummary(biz, { label, stats, items, health, shelf }) {
  const money = (minor) => fmt(minor, biz.currency);
  const L = [];
  L.push(`${biz.name} -- ${label}`);
  L.push(`Revenue ${money(stats.revenue)} | profit ${money(stats.profit)} | margin ${stats.margin}% | ${stats.salesCount} sales | ${stats.unitsSold} units`);
  L.push("");
  L.push("EARNS THE MOST");
  for (const i of items.slice(0, 8)) {
    L.push(`  ${i.name}: ${i.units} units over ${i.sales} sales, revenue ${money(i.revenue)}, profit ${money(i.profit)}, margin ${i.margin}%`);
  }
  L.push("");
  L.push(`STOCK (${money(shelf.value)} on the shelf${shelf.unpriced ? `, ${shelf.unpriced} with no real cost recorded` : ""})`);
  for (const r of health) {
    const cover = r.monthsOfCover === null ? "no sales in period" : `${r.monthsOfCover} months of cover`;
    L.push(`  ${r.name}: ${r.qty} in stock, ${r.soldInPeriod} sold, ${r.sellThrough}% sold through, ${cover}, ${r.status}`);
  }
  return L.join("\n");
}

/* ─── SETTINGS SCREEN ───────────────────────────────────────────────────────── */
function SettingsScreen({ ctx }) {
  const { setScreen, currency, setCurrency, lowStockThreshold, setLowStockThreshold, showToast, userName, userAvatar, isDarkMode, setIsDarkMode } = ctx;
  const currencies = CURRENCIES;

  return (
    <div style={S.screen} className="bt-screen">
      <div style={S.pageHeader}>
        <button style={S.backBtn} onClick={() => setScreen("home")} aria-label="Back"><ArrowLeft size={22} /></button>
        <h2 style={S.pageTitle}>Settings</h2>
        <div style={{ width: 32 }} />
      </div>

      <div style={S.tabInner} className="bt-tabinner">
        
        {/* ACCOUNT LINK */}
        <div style={S.settingsSection}>
          <p style={S.settingsSectionTitle}>Account</p>
          <div style={S.settingsCard}>
            <div style={S.settingsRow} onClick={() => setScreen("account")}>
              <div style={{ ...S.avatar, width: PHOTO.size, height: PHOTO.size, fontSize: 18, marginRight: 0 }}>{userAvatar?.startsWith('/') ? <img src={userAvatar} alt="" style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover" }} /> : (userAvatar || (userName || "B")[0])}</div>
              <div style={{ flex: 1 }}>
                <p style={S.settingsRowLabel}>{userName}</p>
                <p style={S.settingsRowSub}>Manage profile, security & data</p>
              </div>
              <ChevronRight size={20} color="var(--text-secondary)" />
            </div>
          </div>
        </div>

        {/* APPEARANCE */}
        <div style={S.settingsSection}>
          <p style={S.settingsSectionTitle}>Appearance</p>
          <div style={S.settingsCard}>
            <SwitchRow
              icon={isDarkMode ? <Moon size={20} color="var(--accent-color)" /> : <Sun size={20} color="var(--accent-color)" />}
              label="Dark Mode"
              sub={isDarkMode ? "Enabled" : "Disabled"}
              on={isDarkMode}
              onToggle={() => setIsDarkMode(!isDarkMode)}
            />
          </div>
        </div>

        {/* PREFERENCES */}
        <div style={S.settingsSection}>
          <p style={S.settingsSectionTitle}>Preferences</p>
          <div style={S.settingsCard}>
            <div style={S.settingsRow}>
              <DollarSign size={20} color="var(--text-secondary)" />
              <div style={{ flex: 1 }}>
                <p style={S.settingsRowLabel}>Currency</p>
                <p style={S.settingsRowSub}>Applies to new businesses</p>
              </div>
              <Select
                value={currency}
                ariaLabel="Currency"
                options={currencies.map((c) => ({ value: c, label: c }))}
                onChange={(v) => { setCurrency(v); showToast("Currency updated"); }}
              />
            </div>
            <div style={S.settingsDivider} />
            <div style={S.settingsRow}>
              <AlertTriangle size={20} color="var(--text-secondary)" />
              <div style={{ flex: 1 }}>
                <p style={S.settingsRowLabel}>Low Stock Alert</p>
                <p style={S.settingsRowSub}>Alert when qty is at or below</p>
              </div>
              <Select
                value={lowStockThreshold}
                ariaLabel="Alert when stock reaches"
                options={[1, 2, 3, 5, 10].map((n) => ({ value: n, label: `${n} units` }))}
                onChange={(v) => { setLowStockThreshold(Number(v)); showToast("Threshold updated"); }}
              />
            </div>
          </div>
        </div>

        


        {/* ABOUT */}
        <Disclosure
          title="About"
          sub={`${VERSION}, the privacy policy and the terms.`}
          icon={<Info size={20} color="var(--accent-color)" />}
        >
          <div style={S.settingsRow} onClick={() => setScreen("about")}>
            <Info size={20} color="var(--accent-color)" />
            <div style={{ flex: 1 }}>
              <p style={S.settingsRowLabel}>About BizTrack</p>
              <p style={S.settingsRowSub}>Version {VERSION} · Features & Updates</p>
            </div>
            <ChevronRight size={20} color="var(--text-secondary)" />
          </div>
          <div style={S.settingsDivider} />
          <div style={S.settingsRow} onClick={() => setScreen("privacy")}>
            <Shield size={20} color="var(--accent-color)" />
            <div style={{ flex: 1 }}>
              <p style={S.settingsRowLabel}>Privacy Policy</p>
              <p style={S.settingsRowSub}>What we store, where it goes, and your rights.</p>
            </div>
            <ChevronRight size={20} color="var(--text-secondary)" />
          </div>
          <div style={S.settingsDivider} />
          <div style={S.settingsRow} onClick={() => setScreen("terms")}>
            <ScrollText size={20} color="var(--accent-color)" />
            <div style={{ flex: 1 }}>
              <p style={S.settingsRowLabel}>Terms of Service</p>
              <p style={S.settingsRowSub}>Trial, pricing, and what we do and don't promise.</p>
            </div>
            <ChevronRight size={20} color="var(--text-secondary)" />
          </div>
        </Disclosure>

        {/* FEEDBACK */}
        <div style={S.settingsSection}>
          <p style={S.settingsSectionTitle}>Feedback</p>
          <FeedbackCard showToast={showToast} />
        </div>

        <div style={{ height: 16 }} />
      </div>
    </div>
  );
}

/* ─── MODALS ────────────────────────────────────────────────────────────────── */
/** How far down the sheet must be dragged before letting go closes it.
 *  Short enough that the gesture feels willing, long enough that a thumb
 *  brushing the handle while reaching for the title does not dismiss a form. */
const DISMISS_PX = 96;
/** A fast flick counts even if it did not travel far, which is how the gesture
 *  behaves everywhere else on a phone. */
const DISMISS_VELOCITY = 0.5; // px per ms

function ModalShell({ onClose, title, children }) {
  const sheet = useRef(null);
  const closeRef = useRef(onClose);
  // Kept fresh in an effect, not assigned during render: a ref write during
  // render is impure and the lint tripwire catches it immediately.
  useEffect(() => { closeRef.current = onClose; });

  // ── drag to dismiss ────────────────────────────────────────────────────────
  //
  // The handle was decoration. It has been drawn at the top of every sheet
  // since the responsive work, the CSS has a rule hiding it above 700px with
  // the comment "nothing to drag", and the motion session wrote that a sheet
  // arriving from the bottom teaches the gesture of dragging it back down.
  // Nothing ever implemented it, so the app was showing a grab handle that did
  // not grab: the clearest kind of dead control, because it advertises itself.
  //
  // The grab zone is the handle and the title, NOT the whole sheet. These
  // sheets hold forms with fields and scrollable option lists, and a drag that
  // starts anywhere would fight both. A strip at the top is also what the
  // handle already points at.
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const grab = useRef(null);

  const onPointerDown = (e) => {
    // Mouse is not the gesture this is for, and on desktop the sheet is a
    // centred dialog with no bottom edge to go to.
    if (e.pointerType === "mouse") return;
    grab.current = { y: e.clientY, at: e.timeStamp };
    setDragging(true);
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e) => {
    if (!grab.current) return;
    // Downward only. Dragging up would let someone lift the sheet off the
    // bottom of the screen, which it is anchored to.
    setDragY(Math.max(0, e.clientY - grab.current.y));
  };

  const onPointerUp = (e) => {
    const from = grab.current;
    grab.current = null;
    setDragging(false);
    if (!from) return;
    const travelled = Math.max(0, e.clientY - from.y);
    const speed = travelled / Math.max(1, e.timeStamp - from.at);
    if (travelled > DISMISS_PX || speed > DISMISS_VELOCITY) {
      closeRef.current?.();
      return;
    }
    setDragY(0);
  };

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") closeRef.current?.(); };
    document.addEventListener("keydown", onKey);
    // The sheet itself takes focus, not the first control inside it: focusing a
    // field would open the keyboard on a phone before anyone asked for it, and
    // this is enough for Tab to continue from here and for a screen reader to
    // announce where it has landed.
    const previous = document.activeElement;
    sheet.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, []);

  const host = typeof document === "undefined" ? null : (document.querySelector(".bt-app") || document.body);
  if (!host) return null;

  /**
   * `S.modalOverlay` is `position: absolute` ON PURPOSE: inside `.bt-app` that
   * makes a sheet cover the framed column and centre inside the 780px frame at
   * tablet width, the way every other sheet does.
   *
   * But the GATE screens have no `.bt-app`, so the portal falls back to
   * `document.body`, which is not positioned -- and an absolute box then hangs
   * off the initial containing block at the DOCUMENT origin. Any page scroll
   * therefore drags the backdrop out of view while the sheet stays put.
   * Measured on the sign-in wall at 390x820: overlay top **-214**, so the
   * bottom quarter of the screen had no scrim under a sheet sitting over it.
   *
   * This project has already shipped this exact bug once, measured at
   * -193..627 on an 820px window, and fixed it by portalling. Portalling was
   * only half of it: where there is no frame to sit inside, the overlay has to
   * be anchored to the VIEWPORT instead. Desktop hid it because the gate
   * screens fit there and nothing scrolls.
   *
   * It reaches every dialog raised from a gate, which is the data rescue on
   * onboarding and on the PIN lock -- the screens someone who has lost their
   * books actually lands on.
   */
  const framed = host !== document.body;

  return createPortal(
    <div
      style={framed ? S.modalOverlay : { ...S.modalOverlay, position: "fixed" }}
      className="bt-modal"
      onClick={onClose}
    >
      <div
        ref={sheet}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{
          ...S.modalSheet,
          outline: "none",
          transform: dragY ? `translateY(${dragY}px)` : undefined,
          // Only while the finger is down. A transition during the drag would
          // make the sheet lag behind the thumb, which reads as a slow phone
          // rather than as direct manipulation.
          transition: dragging ? "none" : `transform var(--motion-move) var(--ease-out)`,
        }}
        className="bt-sheet"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="bt-grab"
          style={S.modalGrab}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <div style={S.modalHandle} className="bt-handle" />
          <p style={S.modalTitle}>{title}</p>
        </div>
        {/* Desktop only. Above 700px the sheet is a centred dialog, the handle
            is hidden because there is no bottom edge to drag to, and a mouse
            needs something to click. On a phone it would be the redundant
            control the drag replaces. */}
        <button
          type="button"
          className="bt-sheet-close"
          style={S.modalClose}
          aria-label="Close"
          onClick={onClose}
        >
          <X size={18} />
        </button>
        {children}
      </div>
    </div>,
    host,
  );
}

function AddBizModal({ ctx }) {
  const { setModal, addBusiness, askText } = ctx;
  const [name, setName] = useState("");
  // No default. The old one was "Crochet", which guessed the owner's trade from
  // the audience the app was first written for. Blank becomes "Other" on save,
  // which is what the schema already falls back to, so nothing is invented.
  const [category, setCategory] = useState("");
  // Every business used to start on COLORS[0], the terracotta that is also the
  // app's accent, so two shops created without opening the picker were the same
  // colour AND the same mark: identical in every identity signal the Home list
  // has. The next unused colour costs nothing and makes them distinct by
  // default. Lazy, because the answer cannot change while the sheet is open.
  //
  // The MARK is deliberately not cycled the same way. A colour is pure identity
  // and any of the sixteen is as true as another; an emoji says what the shop
  // sells, so handing a phone repairer a ball of yarn would be worse than
  // handing them the same bag as everyone else.
  //
  // A colour a shop already has is NOT OFFERED. Defaulting to the next free one
  // made two shops distinct by accident; it did nothing about someone opening
  // the picker and choosing a colour that is already taken, and after that the
  // Home rows, the ring and every rank key on Analytics say the same thing
  // about two different businesses. The colour IS the legend on that screen --
  // there is no other one -- so a duplicate does not merely look untidy, it
  // makes the chart unreadable and there is nothing on the page to resolve it
  // against.
  //
  // Withheld rather than shown-and-disabled: a greyed swatch is a thing to
  // explain, and the only explanation is "another shop has it", which the Home
  // list already says more clearly than a tooltip could.
  //
  // Sixteen colours and no way to edit one afterwards, so the exhausted case is
  // a seventeenth business. Then the whole palette comes back rather than the
  // form offering nothing: a duplicate colour is bad and an unusable form is
  // worse.
  const free = (() => {
    const used = new Set((ctx.businesses || []).map((b) => String(b.color || "").toUpperCase()));
    const left = COLORS.filter((c) => !used.has(c.toUpperCase()));
    return left.length ? left : COLORS;
  })();
  const [color, setColor] = useState(free[0]);
  const [emoji, setEmoji] = useState("🛍️"); // the schema default too, so the form and the fallback agree

  const submit = () => {
    if (!name.trim()) return;
    // Blank means "not said", and the schema's own fallback for that is
    // "Other". `str("")` returns "" rather than the fallback, so an empty
    // category would survive all the way to the Home row and render there as a
    // bare separator with nothing before it.
    addBusiness({ name: name.trim(), category: category || "Other", color, emoji });
    setModal(null);
  };

  return (
    <ModalShell onClose={() => setModal(null)} title="Add New Business">
      <div style={S.modalBody}>
        <p style={S.fieldLabel}>Business Name</p>
        <input style={S.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sabi Electronics" />

        <p style={S.fieldLabel}>Category</p>
        <Select
          full
          value={category}
          ariaLabel="Category"
          placeholder="Choose a category"
          options={CATEGORIES.map((c) => ({ value: c, label: c }))}
          onChange={setCategory}
          customLabel="Something else"
          onCustom={() => askText({
            title: "What kind of business?",
            body: "Whatever you would tell someone who asked. It only ever appears as a label.",
            placeholder: "e.g. Phone accessories",
            confirmLabel: "Use this",
          })}
        />

        <p style={S.fieldLabel}>Colour</p>
        <QuickPick
          title="Colour"
          gap={14}
          quick={free.slice(0, 5)}
          all={free}
          value={color}
          onChange={setColor}
          renderOption={(c, chosen, pick) => (
            <button
              key={c}
              type="button"
              aria-label={COLOR_NAMES[COLORS.indexOf(c)]}
              aria-pressed={chosen}
              title={COLOR_NAMES[COLORS.indexOf(c)]}
              style={{ ...S.colorDot, background: c, outline: chosen ? "3px solid var(--text-primary)" : "none" }}
              onClick={pick}
            />
          )}
        />

        <p style={S.fieldLabel}>Mark</p>
        <QuickPick
          title="Mark"
          gap={4}
          quick={QUICK_EMOJIS}
          all={EMOJIS}
          value={emoji}
          onChange={setEmoji}
          renderOption={(e, chosen, pick) => (
            <button
              key={e}
              type="button"
              aria-label={e}
              aria-pressed={chosen}
              style={{ ...S.emojiPick, background: chosen ? "var(--control-bg)" : "transparent" }}
              onClick={pick}
            >{e}</button>
          )}
        />

        <button style={S.primaryBtn} onClick={submit}>Create Business</button>
      </div>
    </ModalShell>
  );
}

/**
 * A stored photo, by id.
 *
 * Every object URL pins its blob in memory until it is revoked, so an inventory
 * list that mints one per row per render holds the whole gallery open. The
 * effect revokes on unmount AND when the id changes, and `live` guards the
 * async gap: an id can change while the read is still in flight, and without it
 * the slower read wins and the row shows the previous item's photo.
 */
function Photo({ photoId, size = 44, radius = 12, alt = "" }) {
  // The id is stored WITH the url rather than beside it, so which photo is in
  // hand is a fact about the value instead of a second piece of state that can
  // disagree with it. That is also what keeps the effect free of a synchronous
  // setState: there is no "clear it" branch to run on the way in, because a
  // mismatched id already renders as no photo.
  const [loaded, setLoaded] = useState(null);

  useEffect(() => {
    if (!photoId) return undefined;
    let live = true;
    let mine = null;
    // `resolvePhotoUrl`, not `getPhotoUrl`: on a phone restored from an
    // account the item has arrived but the blob never has, and the only thing
    // that knows where to get it is the backend. For a local-only user it
    // returns exactly what the local read returned.
    resolvePhotoUrl(photoId).then((u) => {
      if (!live) { if (u) URL.revokeObjectURL(u); return; }
      mine = u;
      setLoaded({ id: photoId, url: u });
    });
    return () => { live = false; if (mine) URL.revokeObjectURL(mine); };
  }, [photoId]);

  const url = loaded && loaded.id === photoId ? loaded.url : null;

  const box = { width: size, height: size, borderRadius: radius, flexShrink: 0, objectFit: "cover", display: "block" };
  if (!url) {
    return (
      <span aria-hidden="true" style={{ ...box, background: "var(--control-bg)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-secondary)" }}>
        <Package size={Math.round(size * 0.45)} strokeWidth={1.5} />
      </span>
    );
  }
  return <img src={url} alt={alt} style={box} />;
}

/**
 * Take or choose a product photo.
 *
 * `capture="environment"` is what makes Android open the camera rather than the
 * file browser, which is the whole point: this is used standing in front of the
 * stock. It is only a hint, and a device without a camera falls back to the
 * picker on its own, so there is no branch to write.
 *
 * The size is shown after compression because this audience pays for every
 * megabyte, and a number is the only honest way to say what a photo will cost
 * them when it eventually syncs.
 */
function PhotoField({ photoId, onChange, busyLabel = "Compressing...", solo = false }) {
  const input = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [bytes, setBytes] = useState(null);

  const pick = async (e) => {
    const file = e.target.files?.[0];
    // Clear immediately: without this, choosing the SAME file twice fires no
    // change event, so a retry after an error silently does nothing.
    e.target.value = "";
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const saved = await savePhoto(file);
      setBytes(saved.bytes);
      onChange(saved.id);
    } catch (err) {
      setError(err?.message || "That photo could not be saved.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <input
        ref={input}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={pick}
        style={{ display: "none" }}
      />
      {/* Two shapes, because a photo appears two ways here.
          IN A FORM it is one field among five, so it is a thumbnail with its
          own labelled buttons, sized not to lead the screen.
          ON ITS OWN SHEET it is the ONLY thing there, and that sheet had four
          controls for one job: a big Change, a big Remove, a "Photo" label
          above a sheet already titled with the product's name, and a big Done
          for a change that was already saved. The picture IS the control now.
          A large image you tap to replace needs no button beside it saying so,
          which is the same reason the inventory row's photo opens this sheet in
          the first place. */}
      {solo ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
          <button
            type="button"
            disabled={busy}
            onClick={() => input.current?.click()}
            style={S.photoTarget}
            aria-label={photoId ? "Change this photo" : "Add a photo"}
          >
            <Photo photoId={photoId} size={180} radius={16} alt="" />
          </button>
          <p style={{ ...S.bizRowMeta, margin: 0, textAlign: "center" }}>
            {busy ? busyLabel
              : bytes ? `Saved, ${Math.max(1, Math.round(bytes / 1024))} KB`
              : photoId ? "Tap the picture to replace it."
              : "Tap to add one. It helps you tell stock apart at a glance."}
          </p>
          {photoId && !busy && (
            /* Quiet, and the only other control on the sheet. It is not a peer
               of the picture: removing is the rarer answer and destroys
               something, so it does not get equal weight. */
            <button
              type="button"
              style={{ ...S.textBtn, color: "var(--danger)" }}
              onClick={() => { setBytes(null); onChange(null); }}
            >
              Remove photo
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Photo photoId={photoId} size={64} radius={12} alt="" />
          <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" style={S.photoBtn} disabled={busy} onClick={() => input.current?.click()}>
                {busy ? <RefreshCw size={15} className="spin" /> : photoId ? <Camera size={15} /> : <ImagePlus size={15} />}
                {busy ? busyLabel : photoId ? "Change" : "Add photo"}
              </button>
              {photoId && !busy && (
                <button type="button" style={{ ...S.photoBtn, color: "var(--danger)" }} onClick={() => { setBytes(null); onChange(null); }}>
                  Remove
                </button>
              )}
            </div>
            <p style={{ ...S.bizRowMeta, margin: 0 }}>
              {bytes ? `Saved, ${Math.max(1, Math.round(bytes / 1024))} KB` : "Optional. Helps you tell stock apart at a glance."}
            </p>
          </div>
        </div>
      )}
      {error && <p style={{ ...S.formError, marginTop: 10 }}>{error}</p>}
    </div>
  );
}

function AddItemModal({ ctx }) {
  const { setModal, activeBizId, activeBiz, addInventoryItem } = ctx;
  const [error, setError] = useState(null);
  const cur = activeBiz?.currency;
  const [name, setName] = useState("");
  const [qty, setQty] = useState("");
  const [cost, setCost] = useState("");
  const [price, setPrice] = useState("");
  const [photoId, setPhotoId] = useState(null);

  // Typed values are in major units (what the user says out loud); everything
  // past this boundary is integer minor units.
  const costMinor = toMinor(cost, cur);
  const priceMinor = toMinor(price, cur);
  const preview = cost !== "" && price !== ""
    ? { profit: priceMinor - costMinor, margin: marginPercent(priceMinor, costMinor) }
    : null;

  const submit = () => {
    setError(null);
    if (!name.trim()) return setError("Give the item a name.");
    const q = num(qty, NaN);
    if (!(q > 0)) return setError("Quantity has to be at least 1.");
    if (!(num(cost, NaN) >= 0)) return setError("Cost cannot be a negative number.");
    if (!(num(price, NaN) > 0)) return setError("Selling price has to be more than 0.");
    addInventoryItem(activeBizId, {
      name: name.trim(),
      qty: Math.round(q),
      unitCost: costMinor,
      unitPrice: priceMinor,
      photoId,
    });
    setModal(null);
  };

  return (
    <ModalShell onClose={() => setModal(null)} title="Add Inventory Item">
      <div style={S.modalBody}>
        <p style={S.fieldLabel}>Photo</p>
        <PhotoField photoId={photoId} onChange={setPhotoId} />

        <p style={S.fieldLabel}>Item Name</p>
        <input style={S.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Bucket Hat" />

        <p style={S.fieldLabel}>Quantity Purchased</p>
        <input style={S.input} type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="e.g. 20" />

        <div style={{ display: "flex", gap: 12 }}>
          <div style={{ flex: 1 }}>
            <p style={S.fieldLabel}>Cost per Unit ({cur})</p>
            <input style={S.input} type="number" min="0" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="e.g. 1500" />
          </div>
          <div style={{ flex: 1 }}>
            <p style={S.fieldLabel}>Selling Price ({cur})</p>
            <input style={S.input} type="number" min="0" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="e.g. 4500" />
          </div>
        </div>

        {preview && (
          <div style={S.calcPreview}>
            <p style={S.calcLabel}>Profit per unit: <strong>{fmt(preview.profit, cur)}</strong></p>
            <p style={S.calcLabel}>Margin: <strong style={{ color: preview.margin >= 30 ? "var(--success)" : "var(--danger)" }}>{preview.margin}%</strong></p>
          </div>
        )}

        {error && <p style={S.formError}>{error}</p>}
        <button style={S.primaryBtn} onClick={submit}>Add to Inventory</button>
      </div>
    </ModalShell>
  );
}

/**
 * Add, change or remove the photo on an item that already exists.
 *
 * Its own sheet rather than a field inside an edit form, because there is no
 * edit form: an item's name and price are set once at creation. This is the
 * only way to reach a photo after the fact, and both real users have stock
 * they added before photos existed.
 */
function ItemPhotoModal({ ctx }) {
  const { setModal, activeBiz, activeBizId, photoItemId, setPhotoItemId, setItemPhoto } = ctx;
  const item = activeBiz?.items?.find((i) => i.id === photoItemId && !i.deletedAt) || null;

  const close = () => { setPhotoItemId(null); setModal(null); };

  // The item can vanish underneath this sheet: deleted on another device and
  // pulled in by a sync while it is open. Saying so beats rendering a photo
  // control for a record that is gone.
  if (!item) {
    return (
      <ModalShell onClose={close} title="Photo">
        <div style={S.modalBody}>
          <p style={S.emptySub}>That item is no longer in your inventory.</p>
          <button style={S.primaryBtn} onClick={close}>Close</button>
        </div>
      </ModalShell>
    );
  }

  return (
    <ModalShell onClose={close} title={item.name}>
      <div style={S.modalBody}>
        {/* No "Photo" label: the sheet is titled with the product's name and
            holds one thing. No "Done" either -- the change is written the
            moment it is made, so that button only ever meant "close", which is
            the drag on a phone and the X on a desktop. Three other sheets had
            the same redundant control removed for the same reason. */}
        <PhotoField
          solo
          photoId={item.photoId}
          onChange={(id) => setItemPhoto(activeBizId, item.id, id, item.photoId)}
        />
      </div>
    </ModalShell>
  );
}

/**
 * A receipt for one sale: preview, then send.
 *
 * It is DRAWN WHEN THE SHEET OPENS, not when Share is tapped, for two reasons.
 * `navigator.share` needs transient activation, which an await can outlive, so
 * a tap that first has to render a canvas can be refused by the browser. And a
 * document going to a customer should be seen before it is sent.
 */
/**
 * Correct a sale that was already recorded.
 *
 * Until now a sale was permanent, so a mistyped price or quantity could only be
 * lived with. That is the wrong trade in a book someone runs a business on: an
 * uncorrectable typo is a number the owner knows is wrong and cannot fix, which
 * is worse for trust than an edit ever is.
 *
 * Only the QUANTITY, the PRICE and the NOTE can change. Not the item, because
 * changing which product was sold is two corrections wearing one coat: the
 * stock has to come back on one shelf and off another, which is a delete and a
 * new sale, and saying so is clearer than pretending otherwise.
 *
 * `updateSale` in the store moves the sale and its stock movement together.
 * They are one fact recorded twice, and editing either alone leaves the books
 * and the shelf disagreeing with nothing to say which is right.
 */
function EditSaleModal({ ctx }) {
  const { setModal, activeBiz, activeBizId, receiptSale, setReceiptSale, updateSale, deleteSale, ask, showToast } = ctx;
  const sale = (activeBiz?.sales || []).find((s) => s.id === receiptSale?.id && !s.deletedAt) || null;
  const cur = activeBiz?.currency;

  const [qty, setQty] = useState(sale ? String(sale.qty) : "1");
  const [price, setPrice] = useState(sale ? String(toMajor(sale.unitPrice, cur)) : "");
  const [note, setNote] = useState(sale?.note || "");
  const [error, setError] = useState(null);

  const close = () => { setReceiptSale(null); setModal(null); };

  if (!sale) {
    return (
      <ModalShell onClose={close} title="Sale">
        <div style={S.modalBody}>
          <p style={S.emptySub}>That sale is no longer here.</p>
          <button style={S.primaryBtn} onClick={close}>Close</button>
        </div>
      </ModalShell>
    );
  }

  const qtyNum = Math.max(0, Math.round(num(qty, 0)));
  const priceMinor = toMinor(price, cur);

  const save = async () => {
    setError(null);
    if (!(qtyNum > 0)) return setError("Quantity has to be at least 1.");
    if (!(num(price, NaN) >= 0)) return setError("Enter the price the customer actually paid.");

    // The same guard the sale form grew this morning, for the same reason: an
    // edit can push stock negative just as easily as a new sale. The figure is
    // what stock WOULD be after the change, so the old quantity is added back
    // before the new one is taken off.
    if (sale.itemId) {
      const item = deriveInventory(activeBiz).find((i) => i.id === sale.itemId);
      const wouldHave = (item?.qty ?? 0) + sale.qty - qtyNum;
      if (wouldHave < 0) {
        const ok = await ask({
          title: "That is more than you have",
          body: `Changing this to ${qtyNum} leaves ${item?.name || "this item"} short by ${Math.abs(wouldHave)} until you restock.`,
          confirmLabel: "Save it anyway",
          cancelLabel: "Change the number",
        });
        if (!ok) return;
      }
    }

    updateSale(activeBizId, sale.id, { qty: qtyNum, unitPrice: priceMinor, note: note.trim() });
    showToast("Sale corrected.");
    close();
  };

  const remove = async () => {
    const yes = await ask({
      title: "Delete this sale?",
      body: "The money comes out of your books and the stock goes back on the shelf. There is no undo.",
      confirmLabel: "Delete sale",
      danger: true,
    });
    if (!yes) return;
    deleteSale(activeBizId, sale.id);
    showToast("Sale deleted. Your stock and revenue are updated.");
    close();
  };

  return (
    <ModalShell onClose={close} title="Correct this sale">
      <div style={S.modalBody}>
        <p style={S.fieldLabel}>Item</p>
        {/* Shown, not editable. Changing which product was sold is a delete and
            a new sale, because the stock has to move on two shelves. */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Photo photoId={activeBiz?.items?.find((i) => i.id === sale.itemId)?.photoId} size={40} radius={10} alt="" />
          <div style={{ minWidth: 0 }}>
            <p style={{ ...S.invName, margin: 0 }}>{sale.itemName}</p>
            <p style={{ ...S.invSub, margin: 0 }}>
              {dateLabel(sale.occurredAt)}
              {sale.isCustom ? " · custom sale" : ""}
            </p>
          </div>
        </div>

        <div style={{ display: "flex", gap: 12 }}>
          <div style={{ flex: 1 }}>
            <p style={S.fieldLabel}>Quantity</p>
            <input style={S.input} type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} />
          </div>
          <div style={{ flex: 1 }}>
            <p style={S.fieldLabel}>Price paid ({cur})</p>
            <input style={S.input} type="number" min="0" value={price} onChange={(e) => setPrice(e.target.value)} />
          </div>
        </div>

        <p style={S.fieldLabel}>Note (optional)</p>
        <input style={S.input} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Order from Instagram" />

        <div style={S.calcPreview}>
          <p style={S.calcLabel}>New total: <strong>{fmt(qtyNum * priceMinor, cur)}</strong></p>
          <p style={S.calcLabel}>Was: <strong>{fmt(sale.qty * sale.unitPrice, cur)}</strong></p>
        </div>

        {error && <p style={S.formError}>{error}</p>}
        <button style={S.primaryBtn} onClick={save}>Save correction</button>
        {/* The row used to open this. Both actions are still one tap from the
            list; only which one leads has changed, because an old sale is
            revisited to fix it far more often than to reprint it. */}
        <button
          style={{ ...S.photoBtn, justifyContent: "center", width: "100%" }}
          onClick={() => setModal("receipt")}
        >
          <Share size={15} />
          Send a receipt
        </button>
        <button style={{ ...S.textBtn, alignSelf: "center", color: "var(--danger)" }} onClick={remove}>
          Delete this sale
        </button>

      </div>
    </ModalShell>
  );
}

function ReceiptModal({ ctx }) {
  const { setModal, activeBiz, receiptSale, setReceiptSale, userName, showToast } = ctx;
  const [state, setState] = useState({ status: "drawing", url: null, blob: null });

  // Every line that belongs to this customer. A basket shares a `groupId`; a
  // sale recorded on its own is a basket of one. Oldest first, because the
  // sales list is newest-first and a receipt should read in the order the
  // items were rung up.
  const group = receiptSale?.groupId
    ? (activeBiz?.sales || [])
        .filter((s) => s.groupId === receiptSale.groupId && !s.deletedAt)
        .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
    : receiptSale ? [receiptSale] : [];

  const close = () => { setReceiptSale(null); setModal(null); };

  const groupKey = group.map((s) => s.id).join(",");

  useEffect(() => {
    if (!group.length || !activeBiz) return undefined;
    let live = true;
    let url = null;
    let bitmaps = [];

    (async () => {
      try {
        // One bitmap per distinct product, not per line: a customer buying the
        // same thing twice should not decode the same photo twice.
        const bitmapByItemId = new Map();
        if (typeof createImageBitmap === "function") {
          const wanted = new Set(group.map((s) => s.itemId).filter(Boolean));
          for (const itemId of wanted) {
            const photoId = activeBiz.items?.find((i) => i.id === itemId)?.photoId;
            if (!photoId) continue;
            const blob = await resolvePhotoBlob(photoId);
            if (!blob) continue;
            try {
              const bmp = await createImageBitmap(blob);
              bitmaps.push(bmp);
              bitmapByItemId.set(itemId, bmp);
            } catch { /* an undecodable photo is a missing photo, not an error */ }
          }
        }

        const blob = await drawReceipt({
          business: activeBiz,
          sales: group,
          ownerName: userName,
          bitmapByItemId,
        });
        for (const b of bitmaps) b.close?.();
        bitmaps = [];
        if (!live) return;
        url = URL.createObjectURL(blob);
        setState({ status: "ready", url, blob });
      } catch (err) {
        for (const b of bitmaps) b.close?.();
        if (live) setState({ status: "error", url: null, blob: null, message: err?.message });
      }
    })();

    return () => { live = false; if (url) URL.revokeObjectURL(url); };
    // Keyed on the LINE IDS rather than the array, which is a new object every
    // render and would redraw the receipt forever.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupKey, activeBiz, userName]);

  const send = async () => {
    if (!state.blob) return;
    const how = await shareReceipt({
      blob: state.blob,
      filename: `receipt-${receiptNumber(group)}.png`,
      title: "Receipt",
    });
    // "cancelled" means the share sheet was dismissed, which is a choice and
    // not something to report back as if it failed.
    if (how === "downloaded") showToast("Receipt saved to your downloads.");
    if (how === "shared") showToast("Receipt sent.");
  };

  return (
    <ModalShell onClose={close} title={group.length > 1 ? `Receipt · ${group.length} items` : "Receipt"}>
      <div style={S.modalBody}>
        {state.status === "drawing" && (
          <p style={{ ...S.emptySub, textAlign: "center", padding: "24px 0" }}>Preparing the receipt...</p>
        )}
        {state.status === "error" && (
          <p style={S.formError}>{state.message || "The receipt could not be created."}</p>
        )}
        {state.status === "ready" && (
          <img
            src={state.url}
            alt={`Receipt ${receiptNumber(group)}`}
            style={{ width: "100%", height: "auto", borderRadius: 12, display: "block", boxShadow: "0 0 0 1px var(--border-color)" }}
          />
        )}
        {/* A centred flex row, not an inline icon before centred text. A button
            centres its whole line box, so an inline SVG plus a label leaves the
            glyph stranded at the left edge of a full-width control. */}
        <button
          style={{ ...S.primaryBtn, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
          disabled={state.status !== "ready"}
          onClick={send}
        >
          <Share size={16} />
          Send receipt
        </button>

      </div>
    </ModalShell>
  );
}

function RestockModal({ ctx }) {
  const { setModal, activeBiz, restockItemId, restockInventoryItem, setRestockItemId, deleteInventoryItem, ask } = ctx;
  const [error, setError] = useState(null);
  const cur = activeBiz?.currency;
  const item = activeBiz
    ? deriveInventory(activeBiz).find((i) => i.id === restockItemId && !i.deletedAt)
    : null;
  const [qty, setQty] = useState("");
  const [cost, setCost] = useState("");

  const close = () => { setRestockItemId(null); setModal(null); };

  const submit = () => {
    if (!item) return;
    setError(null);
    const q = num(qty, NaN);
    if (!(q > 0)) return setError("Quantity has to be at least 1.");
    if (cost !== "" && !(num(cost, NaN) >= 0)) return setError("Cost cannot be a negative number.");
    // Blank keeps the running average unchanged.
    restockInventoryItem(activeBiz.id, item.id, Math.round(q), cost === "" ? null : toMinor(cost, cur));
    close();
  };

  return (
    <ModalShell onClose={close} title="Restock Item">
      <div style={S.modalBody}>
        {!item ? (
          <div style={S.emptyState}>
            <div style={S.emptyIcon}><AlertTriangle size={40} color="var(--warning)" strokeWidth={1.5} /></div>
            <p style={S.emptyTitle}>Item not found</p>
            <p style={S.emptySub}>Select an item from inventory before restocking.</p>
          </div>
        ) : (
          <>
            <p style={S.fieldLabel}>Item</p>
            <input style={S.input} value={item.name} disabled />

            <p style={S.fieldLabel}>Additional Quantity</p>
            <input style={S.input} type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="e.g. 10" />

            <p style={S.fieldLabel}>Cost per Unit for this batch (optional)</p>
            <input
              style={S.input}
              type="number"
              min="0"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              placeholder={`Leave blank to keep ${fmt(item.avgCost, cur)}`}
            />
            <p style={{ fontSize: 11, color: "var(--text-secondary)", margin: "-4px 0 0" }}>
              A different price here is averaged in. It won't reprice the {Math.max(item.qty, 0)} you already have.
            </p>

            {error && <p style={S.formError}>{error}</p>}
            <button style={S.primaryBtn} onClick={submit}>Restock Item</button>
            {/* Removing the product lives here rather than on the row, for the
                reason the Danger zone on Account is behind a disclosure: one
                deliberate tap before a destructive control is on screen at all.
                Same shape as "Delete this sale" at the foot of EditSaleModal. */}
            <button
              style={{ ...S.textBtn, alignSelf: "center", color: "var(--danger)" }}
              onClick={async () => {
                const yes = await ask({
                  title: `Remove ${item.name}?`,
                  body: "It comes out of your inventory list. Every sale you have already recorded for it is kept.",
                  confirmLabel: "Remove item",
                  danger: true,
                });
                if (!yes) return;
                deleteInventoryItem(activeBiz.id, item.id);
                setRestockItemId(null);
                setModal(null);
              }}
            >Remove this item</button>
          </>
        )}
      </div>
    </ModalShell>
  );
}

function AddSaleModal({ ctx }) {
  const { setModal, activeBiz, addSale, businesses, screen, openBiz, ask, setReceiptSale } = ctx;
  // One customer, one basket. `groupId` is minted on the first "add another"
  // and shared by every line after it, so the receipt can show them together
  // while each line stays its own record for stock and profit.
  const [basket, setBasket] = useState({ groupId: null, count: 0, last: null });
  const [wantsReceipt, setWantsReceipt] = useState(false);
  const [error, setError] = useState(null);
  // Inside a business the context is unambiguous. Opened from the shortcut on
  // Home it is not, so the first field is which set of books this belongs to.
  const needsBizPicker = screen !== "business" && businesses.length > 1;
  const cur = activeBiz?.currency;
  const inventory = activeBiz ? deriveInventory(activeBiz).filter((i) => !i.deletedAt) : [];

  const [tab, setTab] = useState("inventory");
  const [itemId, setItemId] = useState(inventory[0]?.id || "");
  const [qty, setQty] = useState("1");
  const [actualPrice, setActualPrice] = useState(
    inventory[0] ? String(toMajor(inventory[0].unitPrice, cur)) : ""
  );
  const [note, setNote] = useState("");

  const [manualName, setManualName] = useState("");
  const [materialCost, setMaterialCost] = useState("");
  const [laborCost, setLaborCost] = useState("");

  const selectedItem = inventory.find((i) => i.id === itemId) || null;

  // Switching business invalidates the selected item, its price and the
  // currency all at once, so the dependent state is reset here rather than in
  // an effect that would fire a render late and briefly price the sale wrong.
  // Both take the chosen value, not an event: Select is the app's own picker
  // now rather than a native <select>, so there is no event to reach into.
  const handleBizChange = (id) => {
    const next = businesses.find((b) => b.id === id);
    if (!next) return;
    openBiz(next.id, { stay: true });
    const first = deriveInventory(next).filter((i) => !i.deletedAt)[0];
    setItemId(first?.id || "");
    setActualPrice(first ? String(toMajor(first.unitPrice, next.currency)) : "");
  };

  const handleItemChange = (id) => {
    setItemId(id);
    const next = inventory.find((i) => i.id === id);
    // Prefill from the newly chosen item, always. The old effect only filled a
    // blank field, so switching items silently kept the previous item's price.
    if (next) setActualPrice(String(toMajor(next.unitPrice, cur)));
  };

  const priceMinor = toMinor(actualPrice, cur);
  const qtyNum = Math.max(0, Math.round(num(qty)));
  const manualCostMinor = toMinor(materialCost, cur) + toMinor(laborCost, cur);

  const soldBelow = tab === "inventory" && selectedItem && actualPrice !== "" && priceMinor < selectedItem.unitPrice;
  const soldAbove = tab === "inventory" && selectedItem && actualPrice !== "" && priceMinor > selectedItem.unitPrice;

  const unitCostMinor = tab === "inventory" ? (selectedItem?.avgCost ?? 0) : manualCostMinor;
  const preview = (tab === "inventory" ? selectedItem && actualPrice !== "" : manualName && actualPrice !== "")
    ? { revenue: priceMinor * qtyNum, profit: (priceMinor - unitCostMinor) * qtyNum }
    : null;

  const submit = async (andAnother = false) => {
    setError(null);
    if (!(qtyNum > 0)) return setError("Quantity has to be at least 1.");
    if (!(num(actualPrice, NaN) >= 0)) return setError("Enter the price the customer actually paid.");

    // AFTER the guards, or a rejected form still burns an id. Minted once, on
    // the first line that is not the last; a sale recorded on its own never
    // gets one, which is most of them. `newId` is the app's one generator, so
    // a group id is the same shape as every other id and survives being made
    // offline.
    const groupId = basket.groupId || (andAnother ? newId() : null);
    let recorded;

    if (tab === "inventory") {
      if (!selectedItem) return setError("Pick an item to sell.");

      // ── selling more than the records show ─────────────────────────────────
      //
      // This used to go straight through. The owner asked for it to stop, and
      // it now does: the form will not record it without a deliberate yes.
      //
      // It is a QUESTION rather than a refusal, and that is not me softening
      // the instruction. A refusal does not undo the sale, it only stops it
      // being written down: the customer has walked off with the goods and the
      // cash is in the drawer either way. An app that will not record real
      // money teaches people to keep a second set of books, which is the one
      // outcome worse than a stock figure that needs correcting.
      //
      // So the accident is blocked and the fact is not. Mistyping 50 for 5 now
      // takes an explicit confirmation to get through, which is what was
      // actually going wrong.
      const have = Math.max(0, selectedItem.qty);
      if (qtyNum > have) {
        const short = qtyNum - have;
        const ok = await ask({
          title: "That is more than you have",
          body: `Your records show ${have} ${have === 1 ? "unit" : "units"} of ${selectedItem.name}. Recording ${qtyNum} leaves you short by ${short} until you restock. If that is what you sold, record it and correct the stock afterwards.`,
          confirmLabel: "Record it anyway",
          cancelLabel: "Change the number",
        });
        if (!ok) return;
      }

      recorded = addSale(activeBiz.id, {
        itemId: selectedItem.id,
        itemName: selectedItem.name,
        qty: qtyNum,
        unitPrice: priceMinor,
        unitCost: selectedItem.avgCost,
        askingPrice: selectedItem.unitPrice,
        note,
        isCustom: false,
        groupId,
      });
    } else {
      if (!manualName.trim()) return setError("Give this custom sale a name.");
      recorded = addSale(activeBiz.id, {
        itemId: null,
        itemName: manualName.trim(),
        qty: qtyNum,
        unitPrice: priceMinor,
        unitCost: manualCostMinor,
        askingPrice: priceMinor,
        note,
        isCustom: true,
        groupId,
      });
    }

    if (andAnother) {
      // Stay open, keep the group, clear only the fields that describe the
      // ITEM. The customer has not changed, so neither has the basket.
      setBasket({ groupId, count: basket.count + 1, last: recorded });
      setItemId(inventory[0]?.id || "");
      setActualPrice(inventory[0] ? String(toMajor(inventory[0].unitPrice, cur)) : "");
      setManualName("");
      setMaterialCost("");
      setLaborCost("");
      setQty("1");
      setNote("");
      return;
    }

    setModal(null);
    // The receipt covers the whole basket, which is why it is opened from the
    // LAST line: every line shares its group, and `ReceiptModal` gathers them.
    if (wantsReceipt && recorded) setReceiptSale(recorded);
    if (wantsReceipt && recorded) setModal("receipt");
  };

  const isInventoryEmpty = tab === "inventory" && inventory.length === 0;

  return (
    <ModalShell onClose={() => setModal(null)} title="Record Sale">
      <div style={S.modalBody}>
        {needsBizPicker && (
          <>
            <p style={S.fieldLabel}>Which business?</p>
            <Select
              full
              value={activeBiz?.id || ""}
              ariaLabel="Which business?"
              options={businesses.map((b) => ({ value: b.id, label: `${b.emoji}  ${b.name}` }))}
              onChange={handleBizChange}
            />
          </>
        )}
        <div style={{ display: "flex", gap: 8, marginBottom: 20, marginTop: needsBizPicker ? 8 : 0, background: "var(--control-bg)", padding: 4, borderRadius: 12 }}>
          <button
            style={{ flex: 1, padding: "8px", borderRadius: 12, border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer", background: tab === "inventory" ? "var(--card-bg)" : "transparent", color: tab === "inventory" ? "var(--text-primary)" : "var(--text-secondary)" }}
            onClick={() => setTab("inventory")}
          >From Inventory</button>
          <button
            style={{ flex: 1, padding: "8px", borderRadius: 12, border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer", background: tab === "custom" ? "var(--card-bg)" : "transparent", color: tab === "custom" ? "var(--text-primary)" : "var(--text-secondary)" }}
            onClick={() => setTab("custom")}
          >Custom Entry</button>
        </div>

        {tab === "inventory" ? (
          inventory.length === 0 ? (
            <div style={S.emptyState}>
              <div style={S.emptyIcon}><Package size={40} color="var(--text-primary)" strokeWidth={1.5} /></div>
              <p style={S.emptyTitle}>No items in inventory</p>
              <p style={S.emptySub}>Switch to "Custom Entry" or add items first.</p>
            </div>
          ) : (
            <>
              <p style={S.fieldLabel}>Select Item</p>
              <Select
                full
                value={itemId}
                ariaLabel="Select item"
                // `deriveInventory` spreads the item, so `photoId` comes
                // through untouched. The picture is the point of the picker for
                // someone standing at a stall with the thing in their hand.
                options={inventory.map((i) => ({
                  value: i.id,
                  label: `${i.name}  (${i.qty} in stock)`,
                  icon: <Photo photoId={i.photoId} size={32} radius={8} alt="" />,
                }))}
                onChange={handleItemChange}
              />

              <p style={S.fieldLabel}>Quantity Sold</p>
              <input style={S.input} type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="1" />

              {selectedItem && qtyNum > selectedItem.qty && (
                <p style={{ fontSize: 12, color: "var(--warning)", margin: "-4px 0 0", fontWeight: 500, lineHeight: 1.45 }}>
                  Only {Math.max(selectedItem.qty, 0)} in stock. Recording this will ask you to confirm.
                </p>
              )}

              <p style={S.fieldLabel}>Actual Selling Price ({cur})</p>
              <input
                style={{ ...S.input, borderColor: soldBelow ? "var(--warning)" : soldAbove ? "var(--success)" : "var(--border-color)" }}
                type="number"
                min="0"
                value={actualPrice}
                onChange={(e) => setActualPrice(e.target.value)}
                placeholder="Price paid by customer"
              />
            </>
          )
        ) : (
          <>
            <p style={S.fieldLabel}>Custom Item Name</p>
            <input style={S.input} value={manualName} onChange={(e) => setManualName(e.target.value)} placeholder="e.g. Custom Crochet Beanie" />

            <p style={S.fieldLabel}>Price Paid by Customer ({cur})</p>
            <input style={S.input} type="number" min="0" value={actualPrice} onChange={(e) => setActualPrice(e.target.value)} placeholder="0" />

            <p style={S.fieldLabel}>Quantity</p>
            <input style={S.input} type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="1" />

            <div style={{ display: "flex", gap: 12 }}>
              <div style={{ flex: 1 }}>
                <p style={S.fieldLabel}>Material / Base Cost</p>
                <input style={S.input} type="number" min="0" value={materialCost} onChange={(e) => setMaterialCost(e.target.value)} placeholder="0" />
              </div>
              <div style={{ flex: 1 }}>
                <p style={S.fieldLabel}>Labor Cost</p>
                <input style={S.input} type="number" min="0" value={laborCost} onChange={(e) => setLaborCost(e.target.value)} placeholder="0" />
              </div>
            </div>

            {manualCostMinor > 0 && (
              <p style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: -8, textAlign: "right" }}>
                Total cost: {fmt(manualCostMinor, cur)}
              </p>
            )}
          </>
        )}

        {!isInventoryEmpty && (
          <>
            <p style={S.fieldLabel}>Note (optional)</p>
            <input style={S.input} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Order from Instagram" />

            {preview && (
              <div style={S.calcPreview}>
                <p style={S.calcLabel}>Total Revenue: <strong>{fmt(preview.revenue, cur)}</strong></p>
                <p style={S.calcLabel}>Net Profit: <strong style={{ color: preview.profit >= 0 ? "var(--success)" : "var(--danger)" }}>{preview.profit >= 0 ? "+" : ""}{fmt(preview.profit, cur)}</strong></p>
              </div>
            )}

            {/* Off by default. Most sales at a stall do not get one, and
                recording a sale has to stay one tap for the common case. */}
            <SwitchRow
              icon={<ScrollText size={20} />}
              label="Give a receipt"
              sub={basket.count > 0
                ? `Covers all ${basket.count + 1} items together`
                : "Shown when you finish, ready to send"}
              on={wantsReceipt}
              onToggle={() => setWantsReceipt((v) => !v)}
            />

            {error && <p style={S.formError}>{error}</p>}

            {basket.count > 0 && (
              <p style={{ ...S.calcLabel, margin: 0, textAlign: "center" }}>
                {basket.count} {basket.count === 1 ? "item" : "items"} added to this sale
              </p>
            )}

            <button style={S.primaryBtn} onClick={() => submit(false)}>
              {basket.count > 0 ? "Finish sale" : "Record Sale"}
            </button>

            {/* The basket. One customer buying three things is three sale
                records, because stock and profit are per item, and ONE receipt,
                because that is what the customer should be handed. */}
            <button style={{ ...S.textBtn, alignSelf: "center" }} onClick={() => submit(true)}>
              + Same customer, another item
            </button>
          </>
        )}
      </div>
    </ModalShell>
  );
}

function PinSetupModal({ ctx }) {
  const { setModal, setHashedPin, setHashedRecoveryKey, setIsPinEnabled, showToast } = ctx;
  const [error, setError] = useState(null);
  const [step, setStep] = useState(1); // 1: set, 2: confirm, 3: recovery
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [recoveryKey, setRecoveryKey] = useState("");

  const handleNext = async () => {
    if (step === 1) {
      if (pin.length !== 4) return setError("The passcode has to be 4 digits.");
      setStep(2);
    } else if (step === 2) {
      if (pin !== confirmPin) return setError("Those two passcodes do not match.");
      const key = genRecoveryKey();
      setRecoveryKey(key);
      
      const hash = await hashPin(pin);
      const keyHash = await hashPin(key.replace("-", ""));
      
      setHashedPin(hash);
      setHashedRecoveryKey(keyHash);
      setIsPinEnabled(true);
      setStep(3);
    } else {
      setModal(null);
      showToast("Security enabled!");
    }
  };

  return (
    <ModalShell onClose={() => setModal(null)} title="Security Setup">
      <div style={{ ...S.modalBody, alignItems: "center", textAlign: "center" }}>
        {step === 1 && (
          <>
            <Lock size={48} color="var(--accent-color)" style={{ marginBottom: 20 }} />
            <h3 style={{ margin: "0 0 8px" }}>Create a PIN</h3>
            <p style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: 24, lineHeight: 1.45 }}>Choose a 4-digit code to protect your data.</p>
            <input 
              style={{ ...S.input, textAlign: "center", fontSize: 24, letterSpacing: 8 }} 
              value={pin} 
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
              placeholder="0000"
              type="tel"
              autoFocus
            />
            <button style={{ ...S.primaryBtn, marginTop: 24 }} onClick={handleNext}>Next</button>
          </>
        )}
        {step === 2 && (
          <>
            <Shield size={48} color="var(--accent-color)" style={{ marginBottom: 20 }} />
            <h3 style={{ margin: "0 0 8px" }}>Confirm PIN</h3>
            <p style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: 24, lineHeight: 1.45 }}>Enter your PIN one more time.</p>
            <input 
              style={{ ...S.input, textAlign: "center", fontSize: 24, letterSpacing: 8 }} 
              value={confirmPin} 
              onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
              placeholder="0000"
              type="tel"
              autoFocus
            />
            <button style={{ ...S.primaryBtn, marginTop: 24 }} onClick={handleNext}>Confirm</button>
          </>
        )}
        {step === 3 && (
          <>
            <Award size={48} color="var(--warning)" style={{ marginBottom: 20 }} />
            <h3 style={{ margin: "0 0 8px" }}>Save Recovery Key</h3>
            <p style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: 24, lineHeight: 1.45 }}>If you forget your PIN, you will need this key to unlock your data.</p>
            <div style={{ background: "var(--card-bg)", border: "2px dashed var(--control-border)", borderRadius: 16, padding: "20px 30px", marginBottom: 24 }}>
              <span style={{ fontSize: 24, fontWeight: 700, color: "var(--text-primary)", letterSpacing: 2, fontFamily: "monospace" }}>{recoveryKey}</span>
            </div>
            <p style={{ fontSize: 12, color: "var(--danger)", fontWeight: 600, marginBottom: 24 }}>⚠️ Screenshot this or write it down. It cannot be recovered!</p>
            {error && <p style={S.formError}>{error}</p>}
            <button style={S.primaryBtn} onClick={handleNext}>Finish Setup</button>
          </>
        )}
      </div>
    </ModalShell>
  );
}

function DeleteBizModal({ ctx }) {
  const { setModal, activeBiz, deleteBusiness } = ctx;
  return (
    <ModalShell onClose={() => setModal(null)} title="Delete Business">
      <div style={S.modalBody}>
        <div style={S.deleteWarning}>
          <div style={S.deleteIcon}><AlertTriangle size={36} color="var(--danger)" strokeWidth={1.5} /></div>
          <p style={S.deleteTitle}>Delete "{activeBiz?.name}"?</p>
          <p style={S.deleteSub}>This will permanently remove this business and all its inventory and sales data. This cannot be undone.</p>
        </div>
        <button style={{ ...S.primaryBtn, background: "var(--danger)" }} onClick={() => deleteBusiness(activeBiz?.id)}>
          Yes, Delete Business
        </button>
        <button style={S.ghostBtn} onClick={() => setModal(null)}>Cancel</button>
      </div>
    </ModalShell>
  );
}

function Toast({ toast, onDismiss }) {
  if (!toast) return null;
  const bad = toast.tone === "error";
  return (
    <div
      className="bt-toast"
      style={{ position: "fixed", bottom: "calc(148px + env(safe-area-inset-bottom))", left: 24, right: 24, display: "flex", justifyContent: "center", zIndex: 10000 }}
      onClick={onDismiss}
      role="status"
      aria-live="polite"
    >
      <div style={{
        background: bad ? "var(--danger)" : "rgba(44, 24, 16, 0.95)",
        color: "var(--focus-ink)",
        // An error can be a whole sentence, so it wraps and sits as a block
        // rather than a pill; an acknowledgement stays a pill.
        padding: bad ? "12px 18px" : "12px 24px",
        borderRadius: bad ? 16 : 99,
        maxWidth: 420, fontSize: 14, fontWeight: 600, lineHeight: 1.45, textAlign: "center",
        boxShadow: "var(--shadow-float)",
        animation: "bt-toast-in var(--motion-enter) cubic-bezier(0.18, 0.89, 0.32, 1.28) forwards",
        cursor: "pointer",
      }}>
        {toast.msg}
      </div>
    </div>
  );
}

/**
 * The app's own confirmation, replacing `window.confirm`.
 *
 * Built on ModalShell so it inherits the sheet on a phone and the centred
 * dialog on a wider screen, and so a destructive answer looks destructive
 * rather than being the second identical-looking button in an OS chrome.
 * Cancel is listed first and is the wider target: the default answer to a
 * question you did not expect should be the safe one.
 */
function ConfirmDialog({ dialog }) {
  const [typed, setTyped] = useState("");
  const word = dialog.requireTyped;
  const free = dialog.freeText;
  // A typed confirmation has to match; a free-text answer only has to exist.
  const blocked = free
    ? typed.trim().length === 0
    : Boolean(word) && typed.trim().toUpperCase() !== word;
  return (
    <ModalShell onClose={() => dialog.settle(free ? null : false)} title={dialog.title}>
      <div style={S.modalBody}>
        {dialog.body && <p style={{ ...S.emptySub, textAlign: "left", margin: "0 0 4px" }}>{dialog.body}</p>}
        {(word || free) && (
          <>
            {word && <p style={S.fieldLabel}>Type {word} to confirm</p>}
            <input
              style={S.input}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={dialog.placeholder || ""}
              autoComplete="off"
              autoCapitalize={word ? "characters" : "off"}
              aria-label={word ? `Type ${word} to confirm` : dialog.title}
              autoFocus
            />
          </>
        )}
        <button type="button" style={S.ghostBtn} onClick={() => dialog.settle(free ? null : false)}>
          {dialog.cancelLabel}
        </button>
        <button
          type="button"
          disabled={blocked}
          style={{
            ...(dialog.danger ? { ...S.primaryBtn, background: "var(--danger)", color: "var(--card-bg)" } : S.primaryBtn),
            ...(blocked ? { opacity: 0.45, cursor: "not-allowed" } : {}),
          }}
          onClick={() => !blocked && dialog.settle(free ? typed.trim() : true)}
        >
          {dialog.confirmLabel}
        </button>
      </div>
    </ModalShell>
  );
}

/* ─── BOTTOM NAV ────────────────────────────────────────────────────────────── */
/**
 * The one toggle, and the row that owns it.
 *
 * There were three of these written inline, in TWO sizes: 44x24 with an 18px
 * knob for dark mode, 40x20 with a 16px knob for the passcode and the analytics
 * consent. The same control, drawn two ways, four pixels apart.
 *
 * None of them was a control at all. Each was a pair of `<div>`s inside a
 * `<div onClick>`, so three settings, one of which is a security feature and
 * one of which is a consent decision, could not be reached with a keyboard and
 * announced nothing to a screen reader. The row is a `<button role="switch">`
 * now, which gets Space and Enter, the focus ring, and a spoken on/off state
 * for free.
 *
 * The knob moves on a `transform`, not on `left`. `left` is layout, recomputed
 * every frame; a transform is composited. The old rule was `transition: 0.3s`
 * with no property named at all, which animates EVERYTHING, including the
 * track colour and anything inherited.
 */
function Toggle({ on, tone = "var(--accent-color)" }) {
  return (
    <span aria-hidden="true" style={{ ...S.toggleTrack, background: on ? tone : "var(--border-color)" }}>
      <span style={{ ...S.toggleKnob, transform: on ? "translateX(20px)" : "none" }} />
    </span>
  );
}

/**
 * A settings section that stays shut until you ask for it.
 *
 * Two different jobs, and they pull in opposite directions:
 *
 *  - ABOUT holds three documents nobody reads twice. Collapsed, it costs one
 *    line instead of a third of the screen, and the rows above it get read.
 *  - DANGER ZONE holds erasing an account and erasing a phone. Those were a
 *    permanently visible row and a permanently visible button at the bottom of
 *    a screen people scroll to for their own name. One deliberate tap before
 *    they are even on screen is the point: not to hide them, to make reaching
 *    them a decision.
 *
 * The header is a real <button> with aria-expanded, so it is reachable by
 * keyboard and announces its own state, and the chevron turns on the same
 * duration as everything else that moves in place.
 */
/**
 * The app's select.
 *
 * A native `<select>` draws its own arrow, and that arrow is the one mark in
 * this interface nobody chose. Measured against the app's own chevrons it was
 * wrong three ways at once: a different SHAPE from the lucide chevron used
 * everywhere else, in --text-primary rather than the --text-secondary every
 * other chevron uses (so it was the DARKEST chevron on the screen, on the least
 * important control), and crammed 10px from the edge where a lucide chevron
 * carries its own 20px box. That is what reads as floating: it is not on the
 * grid, not in the palette, and not in the icon family.
 *
 * `appearance: none` removes it and the chevron is drawn like any other, so it
 * inherits the scale and the token. It points DOWN rather than right on
 * purpose: a right chevron in this app means "go to another screen", and a
 * select opens a list in place. The arrow is `pointerEvents: none` so the whole
 * control, arrow included, is still the native select and keeps the platform
 * picker, its keyboard behaviour and its accessibility for free.
 */
/**
 * A few choices on one row, the rest in a sheet.
 *
 * Sixteen colours and forty-one emoji laid out in full turned the add-business
 * form into two walls you scroll past to reach the button that creates the
 * business. Collapsing them entirely would cost a tap on the common case, so
 * the common case stays on screen: one row that fits exactly, and a button
 * carrying the number of others, which answers "is it worth looking?" before
 * you look.
 *
 * The chosen option is always in the row even when it is not one of the first
 * few, because a picker that hides your own selection is reporting the wrong
 * state.
 */
function QuickPick({ title, quick, all, value, onChange, renderOption, gap }) {
  const [open, setOpen] = useState(false);
  const head = quick.includes(value) ? quick : [value, ...quick.slice(0, quick.length - 1)];
  const rest = all.length - head.length;

  return (
    <>
      <div style={{ display: "flex", flexWrap: "wrap", gap, alignItems: "center" }}>
        {head.map((o) => renderOption(o, o === value, () => onChange(o)))}
        {/* Only when there IS a tail. `rest` used to be assumed positive, which
            it stopped being the moment colours already in use were withheld:
            with three left in the palette the row showed every one of them and
            then a button reading "+0" that opened a sheet listing the same
            three. */}
        {rest > 0 && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label={`${title}: show all ${all.length}`}
            style={S.pickMore}
          >
            {"+" + rest}
          </button>
        )}
      </div>

      {open && (
        <ModalShell onClose={() => setOpen(false)} title={title}>
          <div style={S.modalBody}>
            <div style={{ display: "flex", flexWrap: "wrap", gap }}>
              {all.map((o) => renderOption(o, o === value, () => { onChange(o); setOpen(false); }))}
            </div>
          </div>
        </ModalShell>
      )}
    </>
  );
}

function Select({ value, onChange, options, full = false, ariaLabel, placeholder, onCustom, customLabel }) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => String(o.value) === String(value));
  // A stored value the list does not contain is still the truth: show it.
  const shown = current ? current.label : (value ? String(value) : "");

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen(true)}
        style={full ? S.selectFull : S.select}
      >
        {/* The chosen option's mark rides on the trigger too, or picking a
            photo in the sheet would show one and then hide it again the moment
            the sheet closed. */}
        {current?.icon}
        <span style={{ ...S.selectValue, ...(shown ? {} : { color: "var(--text-secondary)" }) }}>
          {shown || placeholder || ""}
        </span>
        <ChevronDown size={20} color="var(--text-secondary)" style={{ flexShrink: 0 }} />
      </button>

      {open && (
        <ModalShell onClose={() => setOpen(false)} title={ariaLabel}>
          <div style={S.modalBody}>
            {options.map((o) => {
              const chosen = String(o.value) === String(value);
              return (
                <button
                  key={String(o.value)}
                  type="button"
                  aria-current={chosen ? "true" : undefined}
                  onClick={() => { onChange(o.value); setOpen(false); }}
                  style={{ ...S.optionRow, ...(chosen ? S.optionRowOn : {}) }}
                >
                  {o.icon}
                  <span style={{ flex: 1, textAlign: "left", minWidth: 0 }}>{o.label}</span>
                  {chosen && <Check size={20} color="var(--accent-text)" style={{ flexShrink: 0 }} />}
                </button>
              );
            })}
            {onCustom && (
              <button
                type="button"
                onClick={async () => {
                  setOpen(false);
                  const typed = await onCustom();
                  if (typed) onChange(typed);
                }}
                style={{ ...S.optionRow, color: "var(--accent-text)", fontWeight: 600 }}
              >
                <span style={{ flex: 1, textAlign: "left" }}>{customLabel}</span>
                <ChevronRight size={20} color="var(--accent-text)" style={{ flexShrink: 0 }} />
              </button>
            )}
          </div>
        </ModalShell>
      )}
    </>
  );
}

function Disclosure({ title, sub, icon, children, tone }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={S.settingsSection}>
      <div style={S.settingsCard}>
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          style={S.discloseRow}
        >
          {icon}
          <span style={{ flex: 1, textAlign: "left" }}>
            <span style={{ ...S.settingsRowLabel, display: "block", color: tone || "var(--text-primary)" }}>{title}</span>
            {sub && <span style={{ ...S.settingsRowSub, display: "block" }}>{sub}</span>}
          </span>
          <ChevronRight
            size={20}
            color={tone || "var(--text-secondary)"}
            style={{ flexShrink: 0, transform: open ? "rotate(90deg)" : "none", transition: "transform var(--motion-move) var(--ease-out)" }}
          />
        </button>
        {open && (
          <>
            <div style={S.settingsDivider} />
            {children}
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Feedback that goes somewhere.
 *
 * What was here said "Feedback sent! Thank you" and sent nothing: the textarea
 * had no `value` and no `onChange`, so the words were never read by anything at
 * all. Someone typing a considered message was told it had gone, and waited.
 *
 * The rule this component exists to obey: **say what actually happened.** The
 * three outcomes are on the server, on this phone until there is signal, or
 * could not be saved. There is no fourth where the app claims a success it
 * cannot back.
 */
function FeedbackCard({ showToast }) {
  const FACES = ["😞", "😐", "🙂", "😊", "🤩"];
  const [rating, setRating] = useState(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);

  const send = async () => {
    if (busy) return;
    setBusy(true);
    const how = await sendFeedback({ rating, message, appVersion: VERSION });
    setBusy(false);

    if (how === "empty") { showToast("Say a little about how it is going first."); return; }
    if (how === "failed") { showToast("That could not be saved on this phone.", "error"); return; }

    // The toast is the honest part. "Queued" is not a failure and is not
    // dressed up as success either.
    showToast(how === "sent" ? "Thank you, that reached us." : "Saved. It will send when you are back online.");
    setDone(how);
    setRating(null);
    setMessage("");
  };

  return (
    <div style={S.feedbackCard}>
      <p style={S.feedbackTitle}>How is BizTrack working for you?</p>
      <p style={S.feedbackSub}>
        {done === "queued"
          ? "Waiting for signal. You can close the app; it will still send."
          : "It is read by the person who builds it."}
      </p>
      <div style={S.emojiRow}>
        {FACES.map((e, i) => (
          <button
            key={e}
            type="button"
            style={{ ...S.emojiBtn, ...(rating === i + 1 ? { background: "var(--control-bg)", outline: "2px solid var(--accent-text)" } : {}) }}
            aria-label={`Rate ${i + 1} out of 5`}
            aria-pressed={rating === i + 1}
            onClick={() => setRating(i + 1)}
          >{e}</button>
        ))}
      </div>
      <textarea
        placeholder="Tell us what you think or what you'd like to see..."
        style={S.feedbackInput}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        maxLength={4000}
      />
      <button style={S.submitBtn} disabled={busy} onClick={send}>
        {busy ? "Sending..." : "Send Feedback"}
      </button>
    </div>
  );
}

function SwitchRow({ icon, label, sub, on, onToggle, tone }) {
  return (
    <button type="button" role="switch" aria-checked={on} style={S.switchRow} onClick={onToggle}>
      {icon}
      <span style={{ flex: 1, textAlign: "left" }}>
        <span style={{ ...S.settingsRowLabel, display: "block" }}>{label}</span>
        <span style={{ ...S.settingsRowSub, display: "block" }}>{sub}</span>
      </span>
      <Toggle on={on} tone={tone} />
    </button>
  );
}

function BottomNav({ ctx }) {
  const { screen, setScreen } = ctx;
  const tabs = [
    { id: "home", icon: <Home size={22} />, label: "Home" },
    { id: "analytics", icon: <div id="nav-analytics"><BarChart2 size={22} /></div>, label: "Analytics" },
    { id: "settings", icon: <Settings size={22} />, label: "Settings" },
  ];
  const index = tabs.findIndex((x) => x.id === screen);
  // A screen that is not one of the three gets NO marker rather than a wrong
  // one. It is still PARKED on the destination it was opened from, so coming
  // back does not slide it in from Home, and so the answer does not depend on
  // where you happened to be before: a business belongs to Home, and Account,
  // About and the legal documents are all reached from Settings.
  const parent = { business: "home", bizAnalysis: "analytics", account: "settings", about: "settings", privacy: "settings", terms: "settings" }[screen];
  const parked = index >= 0 ? index : Math.max(0, tabs.findIndex((x) => x.id === parent));
  return (
    <div style={S.bottomNav} className="bt-nav">
      <div className="bt-navtrack">
        {/* Drawn behind the items and moved, never redrawn. aria-hidden
            because each button already reports whether it is the current one. */}
        <span
          className="bt-navmarker"
          aria-hidden="true"
          data-off={index < 0 ? "true" : undefined}
          style={{ "--nav-index": parked }}
        >
          <span className="bt-navmarker-pill" />
        </span>
        {tabs.map((t) => (
        <button
          key={t.id}
          className="bt-navitem"
          style={S.navItem}
          aria-current={screen === t.id ? "page" : undefined}
          onClick={() => setScreen(t.id)}
        >
          <span className="bt-navpill" style={S.navPill}>
            <span style={{ display: "flex", alignItems: "center", justifyContent: "center", color: screen === t.id ? "var(--text-primary)" : "var(--text-secondary)" }}>{t.icon}</span>
            <span className="bt-navlabel" style={{ ...S.navLabel, ...(screen === t.id ? { color: "var(--text-primary)" } : {}) }}>{t.label}</span>
          </span>
        </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Record a sale, from wherever you are looking at your books.
 *
 * This is the app's core verb and it was four taps deep: Home, into a business,
 * into the third tab, then a dashed button. Someone at a stall with a customer
 * waiting does not make four taps. It is an ACTION, not a destination, which is
 * why it is a button over the content rather than a fourth item in the nav.
 *
 * Only on Home and inside a business -- the two screens where you are actually
 * looking at trade. On Settings it would be noise.
 */
function RecordSaleButton({ ctx }) {
  const { screen, businesses, setModal, openBiz, showToast } = ctx;
  if (screen !== "home" && screen !== "business") return null;

  const start = () => {
    if (businesses.length === 0) {
      // Nothing to sell from yet. Send them to the step that unblocks it rather
      // than opening a form with an empty picker.
      showToast("Add a business first");
      return setModal("addBiz");
    }
    // With one business there is nothing to choose, so choose it. With several,
    // the sheet asks -- see the picker in AddSaleModal.
    if (screen !== "business") openBiz(businesses[0].id, { stay: true });
    setModal("addSale");
  };

  return (
    <button className="bt-fab" style={S.fab} onClick={start} aria-label="Record a sale">
      <Plus size={20} strokeWidth={2.5} />
      <span style={S.fabLabel}>Sale</span>
    </button>
  );
}

/* ─── ABOUT SCREEN ─────────────────────────────────────────────────────────── */
function AboutScreen({ ctx }) {
  const { setScreen, checkUpdates } = ctx;
  const [tab, setTab] = useState("features"); // "features" | "updates"

  const features = [
    { icon: <Store size={20} />, title: "Multi-Business Management", desc: "Track and manage multiple business ventures from a single unified dashboard." },
    { icon: <Package size={20} />, title: "Smart Inventory Tracking", desc: "Real-time stock monitoring with intelligent low-stock alerts and cost-per-unit analysis." },
    { icon: <TrendingUp size={20} />, title: "Performance Analytics", desc: "Visualize your growth with profit rankings, revenue charts, and detailed business insights." },
    { icon: <Lock size={20} />, title: "Yours, and portable", desc: "Records are stored on your device and, if you sign in, backed up to your account so you can reach them from another phone. Export everything as CSV whenever you want." },
    { icon: <Cloud size={20} />, title: "Local-First / PWA Ready", desc: "Install BizTrack on your home screen for a native experience that works offline." },
    { icon: <Sparkles size={20} />, title: "Custom Sales Entry", desc: "Flexible recording for both inventoried products and custom one-off services." }
  ];

  return (
    <div style={S.screen} className="bt-screen">
      <div style={S.pageHeader}>
        <button style={S.backBtn} onClick={() => setScreen("settings")} aria-label="Back"><ArrowLeft size={22} /></button>
        <h2 style={S.pageTitle}>About BizTrack</h2>
        <div style={{ width: 32 }} />
      </div>

      <div style={S.tabs}>
        <button 
          style={{ ...S.tab, ...(tab === "features" ? S.tabActive : {}) }} 
          onClick={() => setTab("features")}
        >Features</button>
        <button 
          style={{ ...S.tab, ...(tab === "updates" ? S.tabActive : {}) }} 
          onClick={() => setTab("updates")}
        >Updates</button>
      </div>

      <div style={S.tabContent}>
        <div style={S.tabInner} className="bt-tabinner">
          {tab === "features" ? (
            <>
              <div style={{ ...S.summaryCard, textAlign: "center", padding: "40px 24px" }}>
                <div style={{ background: "rgba(255,255,255,0.1)", width: 80, height: 80, borderRadius: 22, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", position: "relative" }}>
                   <Store size={40} color="var(--on-color)" />
                </div>
                <h2 style={{ ...S.userName, color: "var(--on-color)" }}>BizTrack</h2>
                <p style={{ ...S.greeting, color: "rgba(255,255,255,0.7)", fontSize: 14, marginTop: 8 }}>Built for anyone running a small business, and keeping the books in their head.</p>
              </div>

              <p style={S.sectionLabel}>Core Features</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {features.map((f, i) => (
                  <div key={i} style={{ ...S.settingsCard, padding: 16, display: "flex", gap: 16 }}>
                    <div style={{ width: 44, height: 44, borderRadius: 12, background: "rgba(193,127,90,0.1)", color: "var(--accent-color)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      {f.icon}
                    </div>
                    <div>
                      <p style={{ ...S.settingsRowLabel, fontSize: 16 }}>{f.title}</p>
                      <p style={{ ...S.settingsRowSub, lineHeight: 1.5, marginTop: 4 }}>{f.desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ ...S.infoCard, background: "rgba(193,127,90,0.05)", borderLeft: "4px solid var(--accent-color)", marginTop: 12 }}>
                <p style={{ ...S.infoLabel, color: "var(--accent-color)" }}>Built with ❤️ for</p>
                <p style={S.infoVal}>Independent business owners</p>
                <p style={S.infoSub}>Whether you sell phones, food, fabric, or your own time, BizTrack is here to tell you what you actually made.</p>
              </div>

              {/*
                The usage-data consent. It lives at the foot of this tab rather
                than in Settings because the owner wanted it out of the way, and
                it cannot simply be deleted: `track()` and `flush()` both refuse
                unless it is true, and the privacy policy promises that
                collection is conditional on it and can be withdrawn. The policy
                names this exact route, so it moves only if the policy moves too.
              */}
              {isBackendConfigured && (
                <div style={{ ...S.settingsCard, marginTop: 20 }}>
                  <SwitchRow
                    icon={<TrendingUp size={20} color="var(--text-secondary)" />}
                    label="Share usage data"
                    sub="Which screens and features you use, and crashes. Never your business data."
                    on={Boolean(ctx.analyticsConsent)}
                    tone="var(--success)"
                    onToggle={() => {
                      const next = !ctx.analyticsConsent;
                      ctx.chooseAnalytics(next);
                      ctx.showToast(next ? "Thank you. Usage data on." : "Usage data off. Queue cleared.");
                    }}
                  />
                </div>
              )}
            </>
          ) : (
            <>
              <button 
                style={{ ...S.primaryBtn, marginBottom: 8, background: "var(--accent-color)", position: "relative", overflow: "hidden" }} 
                onClick={() => checkUpdates(true)}
              >
                {ctx.updateProgress > 0 && ctx.updateProgress < 100 ? (
                  <div style={{ position: "absolute", inset: 0, background: "rgba(255,255,255,0.2)", width: `${ctx.updateProgress}%`, transition: "width var(--motion-move) var(--ease-out)" }} />
                ) : null}
                <span style={{ position: "relative", zIndex: 1 }}>
                  {ctx.updateProgress > 0 && ctx.updateProgress < 100 ? `Checking... ${ctx.updateProgress}%` : "Check for Updates"}
                </span>
              </button>
              
              <div style={S.timeline}>
                {UPDATE_LOG.map((log, idx) => (
                  <div key={log.version} style={S.updateItem}>
                    {idx !== UPDATE_LOG.length - 1 && <div style={S.timelineLine} />}
                    <div style={{ ...S.timelineDot, background: idx === 0 ? "var(--accent-color)" : "var(--border-color)" }} />
                    <div style={{ flex: 1, paddingBottom: 32 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                        <span style={{ ...S.badge, background: idx === 0 ? "rgba(193,127,90,0.1)" : "var(--border-color)", color: idx === 0 ? "var(--accent-color)" : "var(--text-secondary)", fontSize: 12, borderRadius: 99 }}>{log.version}</span>
                        <span style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 600 }}>{log.date}</span>
                      </div>
                      <h3 style={{ fontSize: 16, color: "var(--text-primary)", margin: "0 0 12px", fontWeight: 700, letterSpacing: -0.1 }}>{log.title}</h3>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {log.changes.map((change, i) => (
                          <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                            <CheckCircle2 size={14} color="var(--accent-color)" style={{ marginTop: 2, flexShrink: 0 }} />
                            <p style={{ fontSize: 14, color: "var(--text-secondary)", margin: 0, lineHeight: 1.45 }}>{change}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
          <div style={{ height: 40 }} />
        </div>
      </div>
    </div>
  );
}


/* ─── ONBOARDING ───────────────────────────────────────────────────────────── */
function Onboarding({ ctx, deferredPrompt, setDeferredPrompt }) {
  const { auth, businesses, replaceBusinesses, userName, userEmail, setUserName, setUserEmail, setOnboardingComplete, currency, setCurrency, lowStockThreshold, setLowStockThreshold, showToast, askText, ask } = ctx;
  const [step, setStep] = useState(0);
  const [showImport, setShowImport] = useState(false);

  /**
   * THE ACCOUNT ALREADY KNOWS THIS, so stop asking for it.
   *
   * `userName`, `userEmail` and `onboardingComplete` are DEVICE-LOCAL and
   * never sync, so signing in on a second phone runs the whole wizard again
   * -- and it asked for a name and an email belonging to an account that had
   * just been authenticated with both. The owner's words: "if this email is
   * indeed in the database, it should have all that information."
   *
   * The name is prefilled from whatever the provider gave us, so it is one
   * tap rather than typing. The EMAIL STEP IS SKIPPED ENTIRELY when there is
   * an account, and that is the stronger point: the account's address is the
   * verified one, and a second field invites a DIFFERENT, unverified address
   * that nothing in the app would ever use. Redundant is the small problem;
   * contradictory is the real one.
   *
   * This does not fix the underlying split -- a device that has never seen
   * this account still starts at step 0 -- but it stops the wizard asking for
   * what it is already holding.
   */
  const account = auth?.session?.user || null;
  const accountEmail = auth?.email || "";
  const accountName = String(
    account?.user_metadata?.full_name || account?.user_metadata?.name || "",
  ).trim();

  // The standalone check lived here too, duplicating the one inside
  // InstallPrompt (which also covers iOS's own flag). Two copies of a decision
  // about whether to show one card; the card now decides for itself.
  const initialName = userName !== "Business Owner" ? userName : accountName;
  const [name, setName] = useState(initialName);
  const [email, setEmail] = useState(userEmail || accountEmail);

  const hasStarted = businesses.length > 0 || initialName.length > 0;

  const next = () => {
    if (step === 1 && name.trim()) { setUserName(name.trim()); }
    if (step === 2 && email.trim()) { setUserEmail(email.trim()); }
    if (step === 3) {
      // Recording this on the ACCOUNT is not done here. Flipping the flag is
      // what the effect in App watches, and one owner for that write is the
      // point -- doing it in both places sent two PUTs for one event, which
      // is how two copies of a job start drifting.
      setOnboardingComplete(true);
      return;
    }
    // Signed in: take the verified address and step over the question.
    if (step === 1 && accountEmail) { setUserEmail(accountEmail); setStep(3); return; }
    setStep(step + 1);
  };

  const handleExport = () => {
    const payload = buildBackup({ businesses, userName, userEmail, currency, lowStockThreshold });
    if (saveBackupFile(payload)) {
      showToast("Saved. Open BizTrack on the other phone and choose Load from File.");
    } else {
      showToast("Could not save the file on this device.", "error");
    }
  };

  /**
   * Takes the data directly instead of reading it from state.
   *
   * It used to read `importData`, which the Paste Code button set immediately
   * before calling this -- so it parsed the PREVIOUS value, which on a first
   * attempt was the empty string. Transfer-between-phones therefore failed
   * every single time with "that doesn't look like a backup code", on the one
   * screen someone reaches while moving their books to a new device.
   */
  /**
   * Restoring here used to skip the confirmation that the same action carries
   * on the Account screen: it called `replaceBusinesses` the moment the file
   * parsed. Two implementations of one bulk write, and the one that drifted was
   * the one nobody had looked at.
   *
   * It asks whenever there is something to lose. Onboarding is usually an empty
   * app, where confirming a replacement of nothing is noise, but it is
   * re-enterable with real books present.
   */
  const handleImport = async (raw) => {
    let parsed;
    try {
      // parseBackup accepts codes exported by older builds too, and migrates
      // them on the way in.
      parsed = parseBackup(typeof raw === "string" ? JSON.parse(raw) : raw, currency);
    } catch {
      return showToast("That does not look like a BizTrack backup.", "error");
    }
    if (!parsed) return showToast("That backup has missing or damaged business data, so nothing was changed.", "error");

    if (businesses.length > 0) {
      const incoming = summarizeLocal(parsed.businesses);
      const current = summarizeLocal(businesses);
      if (!(await ask({
        title: "Restore this backup?",
        body:
          `Coming in: ${incoming.businesses} businesses, ${incoming.items} items, ${incoming.sales} sales. ` +
          `On this phone now: ${current.businesses} businesses, ${current.items} items, ${current.sales} sales. ` +
          "Everything currently on this phone is replaced.",
        confirmLabel: "Replace my books",
        danger: true,
      }))) return;
    }

    replaceBusinesses(parsed.businesses);
    if (parsed.userName) setUserName(parsed.userName);
    if (parsed.userEmail) setUserEmail(parsed.userEmail);
    if (parsed.currency) setCurrency(parsed.currency);
    if (parsed.lowStockThreshold) setLowStockThreshold(parsed.lowStockThreshold);
    showToast(`Restored ${parsed.businesses.length} business${parsed.businesses.length === 1 ? "" : "es"}.`);
    setShowImport(false);
  };

  return (
    <div style={{ ...S.shell, background: "var(--focus-ground)", color: "var(--focus-ink)", textAlign: "center" }}>
      <div style={{ ...S.phone, background: "var(--focus-ground)", justifyContent: "center", padding: 40 }} className="bt-focus">
        {step === 0 && (
          <div style={{ animation: "bt-rise var(--motion-enter) var(--ease-out)" }}>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 32, position: "relative" }}>
               <div style={{ position: "absolute", width: 140, height: 140, background: "rgba(193, 127, 90, 0.15)", filter: "blur(30px)", borderRadius: "50%" }} />
               <img src="/avatar-1-coin.svg" alt="" style={{ width: 140, height: 140, position: "relative", zIndex: 1 }} />
            </div>
            <h1 style={{ ...S.userName, color: "var(--focus-ink)", marginBottom: 12 }}>Welcome to BizTrack</h1>
            <p style={{ ...S.greeting, color: "rgba(255,255,255,0.7)", fontSize: 16, marginBottom: 32 }}>Your all-in-one business growth companion.</p>
            
            {/*
              One card, one message. This was the app's own explanation card
              with <InstallPrompt> nested inside it, and the prompt is
              absolutely positioned, so it escaped the card and floated over the
              two controls below: rescue and transfer. It renders in the flow
              now, and the reason to install is stated once, here, in the words
              that matter: the books are per-origin and moving without the app
              loses them.
            */}
            <InstallPrompt
              inline
              deferredPrompt={deferredPrompt}
              setDeferredPrompt={setDeferredPrompt}
            />

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <button style={{ ...S.primaryBtn, background: "var(--focus-ink)", color: "var(--focus-ground)" }} onClick={next}>
                {hasStarted ? "Continue Setup" : "Get Started"}
              </button>

              <button 
                style={{ ...S.ghostBtn, border: "none", color: "rgba(255,255,255,0.62)", fontSize: 11, marginTop: 12 }}
                onClick={() => ctx.checkRescue(true)}
              >
                {ctx.isRescuing ? "Searching for data..." : "Looking for lost data? Tap to Rescue"}
              </button>

              <button 
                style={{ ...S.ghostBtn, border: "none", color: "rgba(255,255,255,0.75)" }}
                onClick={() => setShowImport(!showImport)}
              >
                Transfer from another device
              </button>

              {showImport && (
                <div style={{ display: "flex", gap: 8, animation: "bt-rise var(--motion-move) var(--ease-out)" }}>
                  <button
                    style={{ ...S.ghostBtn, flex: 1, fontSize: 12, padding: "10px", borderColor: "rgba(255,255,255,0.2)", color: "rgba(255,255,255,0.6)" }}
                    onClick={handleExport}
                  >Save to File</button>
                  <button
                    style={{ ...S.ghostBtn, flex: 1, fontSize: 12, padding: "10px", borderColor: "rgba(255,255,255,0.2)", color: "rgba(255,255,255,0.6)" }}
                    onClick={async () => {
                      let raw;
                      try {
                        raw = await pickBackupFile();
                      } catch (err) {
                        return showToast(err.message, "error");
                      }
                      if (raw) handleImport(raw);
                    }}
                  >Load from File</button>
                </div>
              )}

              {showImport && (
                <button
                  style={{ ...S.textBtn, color: "rgba(255,255,255,0.62)", fontSize: 11, marginTop: 10 }}
                  onClick={async () => {
                    const code = await askText({
                      title: "Paste your backup code",
                      body: "Older versions of BizTrack handed you a long code instead of a file. Paste the whole thing.",
                      placeholder: "Paste the code here",
                      confirmLabel: "Restore",
                    });
                    if (code) handleImport(code);
                  }}
                >
                  I have a code from an older version
                </button>
              )}
            </div>
          </div>
        )}
        {step === 1 && (
          <div style={{ animation: "bt-rise var(--motion-enter) var(--ease-out)" }}>
            <h2 style={{ ...S.sectionLabel, color: "var(--focus-ink)", fontSize: 26, fontWeight: 600, letterSpacing: -0.7, marginBottom: 24 }}>What's your name?</h2>
            <input 
              style={{ ...S.input, background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", color: "var(--focus-ink)", textAlign: "center", fontSize: 18 }}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Sabi"
              autoFocus
            />
            <button style={{ ...S.primaryBtn, background: "var(--focus-ink)", color: "var(--focus-ground)", marginTop: 24, opacity: name.trim() ? 1 : 0.5 }} disabled={!name.trim()} onClick={next}>Continue</button>
          </div>
        )}
        {step === 2 && (
          <div style={{ animation: "bt-rise var(--motion-enter) var(--ease-out)" }}>
            <h2 style={{ ...S.sectionLabel, color: "var(--focus-ink)", fontSize: 26, fontWeight: 600, letterSpacing: -0.7, marginBottom: 12 }}>Your Email?</h2>
            <p style={{ ...S.greeting, color: "rgba(255,255,255,0.7)", marginBottom: 24 }}>Optional: To help you manage your business data.</p>
            <input 
              style={{ ...S.input, background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", color: "var(--focus-ink)", textAlign: "center", fontSize: 18 }}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="hello@example.com"
              type="email"
              autoFocus
            />
            <button style={{ ...S.primaryBtn, background: "var(--focus-ink)", color: "var(--focus-ground)", marginTop: 24 }} onClick={() => {
              if (email.trim() && !validateEmail(email)) {
                showToast("That email address does not look right.", "error");
                return;
              }
              next();
            }}>Continue</button>
          </div>
        )}
        {step === 3 && (
          <div style={{ animation: "bt-rise var(--motion-enter) var(--ease-out)" }}>
            <h2 style={{ ...S.sectionLabel, color: "var(--focus-ink)", fontSize: 26, fontWeight: 600, letterSpacing: -0.7, marginBottom: 12 }}>All set, {name || initialName}!</h2>
            <p style={{ ...S.greeting, color: "rgba(255,255,255,0.7)", marginBottom: 32 }}>Let's start by adding your first business on the home screen.</p>
            <div style={{ background: "rgba(255,255,255,0.05)", borderRadius: 16, padding: 30, border: "1.5px dashed rgba(255,255,255,0.2)" }}>
               <Store size={48} color="rgba(255,255,255,0.3)" style={{ marginBottom: 12 }} />
               <p style={{ fontSize: 14, color: "rgba(255,255,255,0.5)" }}>Your dashboard is waiting...</p>
            </div>
            <button style={{ ...S.primaryBtn, background: "var(--focus-ink)", color: "var(--focus-ground)", marginTop: 40 }} onClick={next}>Enter Dashboard</button>
          </div>
        )}
      </div>
      <p style={{ position: "absolute", bottom: 20, left: 0, right: 0, textAlign: "center", fontSize: 11, color: "rgba(255,255,255,0.55)", pointerEvents: "none" }}>BizTrack {VERSION} • Build {BUILD_DATE}</p>
    </div>
  );
}

/* ─── SECURITY ─────────────────────────────────────────────────────────────── */
function PinLock({ ctx, onUnlock }) {
  const { ask } = ctx;
  const [input, setInput] = useState("");
  const [recoveryMode, setRecoveryMode] = useState(null); // null, 'key', 'email'
  const [recoveryInput, setRecoveryInput] = useState("");
  const [emailCode, setEmailCode] = useState("");
  const [sentCode, setSentCode] = useState("");
  const [isSending, setIsSending] = useState(false);

  const { hashedPin, hashedRecoveryKey, userName, userEmail, userAvatar, loginAttempts, setLoginAttempts, lockoutUntil, setLockoutUntil, setHashedPin, setIsPinEnabled, setHashedRecoveryKey, showToast } = ctx;

  const isLockedOut = lockoutUntil && new Date(lockoutUntil) > new Date();
  const secondsLeft = isLockedOut ? Math.ceil((new Date(lockoutUntil) - new Date()) / 1000) : 0;

  useEffect(() => {
    if (isLockedOut) {
      const timer = setInterval(() => {
        if (new Date(lockoutUntil) <= new Date()) {
          setLockoutUntil(null);
          setLoginAttempts(0);
          clearInterval(timer);
        }
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [isLockedOut, lockoutUntil]);

  const press = async (n) => {
    if (isLockedOut || input.length >= 4) return;
    const newVal = input + n;
    setInput(newVal);
    if (newVal.length === 4) {
      const hash = await hashPin(newVal);
      if (hash === hashedPin) {
        setLoginAttempts(0);
        setLockoutUntil(null);
        setTimeout(onUnlock, 200);
      } else {
        const nextAttempts = loginAttempts + 1;
        setLoginAttempts(nextAttempts);
        if (nextAttempts >= 5) {
          const lockoutTime = new Date(Date.now() + 30000).toISOString();
          setLockoutUntil(lockoutTime);
        }
        setTimeout(() => setInput(""), 500);
      }
    }
  };

  const handleEmailReset = async () => {
    const emailToUse = String(userEmail || "").trim();
    if (!emailToUse || !validateEmail(emailToUse)) {
      showToast("No email address is stored on this account. Use your 8-character Recovery Key instead.", "error");
      return;
    }
    setIsSending(true);
    const code = genEmailCode();
    const success = await sendResetEmail(userEmail, userName, code, showToast);
    setIsSending(false);
    
    if (success) {
      setSentCode(code);
      setRecoveryMode('email');
      showToast("Reset code sent to your email!");
    } else {
      showToast("Could not send the email. Check your connection and try again.", "error");
    }
  };

  const verifyEmailCode = () => {
    if (emailCode === sentCode || (EMAILJS_CONFIG.PUBLIC_KEY === "YOUR_PUBLIC_KEY" && emailCode === "000000")) {
      resetEverything();
    } else {
      showToast("That code is not right. Try again.", "error");
    }
  };

  const submitRecoveryKey = async () => {
    const hash = await hashPin(recoveryInput.toUpperCase().replace(/\s/g, ""));
    if (hash === hashedRecoveryKey) {
      resetEverything();
    } else {
      showToast("That recovery key is not right.", "error");
    }
  };

  const resetEverything = async () => {
    if (await ask({
      title: "Reset passcode and unlock?",
      body: "The passcode and recovery key are removed. Your books are untouched.",
      confirmLabel: "Reset passcode",
      danger: true,
    })) {
      setHashedPin(null);
      setHashedRecoveryKey(null);
      setIsPinEnabled(false);
      setLoginAttempts(0);
      setLockoutUntil(null);
      onUnlock();
    }
  };

  if (recoveryMode === 'key') {
    return (
      <div style={{ ...S.shell, background: "var(--bg-primary)" }}>
        <div style={{ ...S.phone, padding: 40, alignItems: "center", justifyContent: "center" }} className="bt-focus">
          <Shield size={48} color="var(--accent-color)" style={{ marginBottom: 20 }} />
          <h2 style={{ ...S.userName, marginBottom: 8 }}>PIN Recovery</h2>
          <p style={{ ...S.greeting, textAlign: "center", marginBottom: 32 }}>Enter the 8-character recovery key you saved earlier.</p>
          <input 
            style={{ ...S.input, textAlign: "center", letterSpacing: 2, textTransform: "uppercase" }}
            value={recoveryInput}
            onChange={(e) => setRecoveryInput(e.target.value)}
            placeholder="XXXX-XXXX"
            autoFocus
          />
          <button style={{ ...S.primaryBtn, marginTop: 24 }} onClick={submitRecoveryKey}>Reset Passcode</button>
          <button style={{ ...S.ghostBtn, marginTop: 12 }} onClick={() => setRecoveryMode(null)}>Back to PIN</button>
        </div>
      </div>
    );
  }

  if (recoveryMode === 'email') {
    return (
      <div style={{ ...S.shell, background: "var(--bg-primary)" }}>
        <div style={{ ...S.phone, padding: 40, alignItems: "center", justifyContent: "center" }} className="bt-focus">
          <Smartphone size={48} color="var(--accent-color)" style={{ marginBottom: 20 }} />
          <h2 style={{ ...S.userName, marginBottom: 8 }}>Email Recovery</h2>
          <p style={{ ...S.greeting, textAlign: "center", marginBottom: 32 }}>Enter the 6-digit code sent to<br/><strong>{userEmail}</strong></p>
          <input 
            style={{ ...S.input, textAlign: "center", letterSpacing: 4, fontSize: 24, fontWeight: 700 }}
            value={emailCode}
            onChange={(e) => setEmailCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="000000"
            type="tel"
            autoFocus
          />
          <button style={{ ...S.primaryBtn, marginTop: 24 }} onClick={verifyEmailCode}>Verify Code</button>
          <button style={{ ...S.ghostBtn, marginTop: 12 }} onClick={() => setRecoveryMode(null)}>Back to PIN</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ ...S.shell, background: "var(--bg-primary)" }}>
      <div style={{ ...S.phone, padding: 40, alignItems: "center", justifyContent: "center" }} className="bt-focus">
        <div style={{ ...S.avatar, width: 64, height: 64, fontSize: 28, marginBottom: 16 }}>{userAvatar?.startsWith('/') ? <img src={userAvatar} alt="" style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover" }} /> : (userAvatar || (userName || "B")[0])}</div>
        <h2 style={{ ...S.userName, marginBottom: 8 }}>Welcome back</h2>
        <p style={{ ...S.greeting, marginBottom: 40 }}>{isLockedOut ? `Locked out for ${secondsLeft}s` : "Enter PIN to unlock"}</p>
        
        <div style={{ display: "flex", gap: 16, marginBottom: 40 }}>
          {[0,1,2,3].map(i => (
            <div key={i} style={{ width: 16, height: 16, borderRadius: "50%", background: input.length > i ? "var(--text-primary)" : "var(--border-color)", border: isLockedOut ? "1px solid var(--danger)" : "none" }} />
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20, opacity: isLockedOut ? 0.3 : 1 }}>
          {[1,2,3,4,5,6,7,8,9].map(n => (
            <button key={n} style={S.numKey} onClick={() => press(n)} disabled={isLockedOut}>{n}</button>
          ))}
          <div />
          <button style={S.numKey} onClick={() => press(0)} disabled={isLockedOut}>0</button>
          <button style={{ ...S.numKey, fontSize: 14 }} onClick={() => setInput("")} disabled={isLockedOut}>Clear</button>
        </div>

        <div style={{ marginTop: 32, display: "flex", flexDirection: "column", gap: 8, width: "100%", alignItems: "center" }}>
          {(!userEmail || !validateEmail(userEmail)) ? (
             <div style={{ background: "rgba(193, 127, 90, 0.05)", padding: "12px 16px", borderRadius: 12, border: "1px solid rgba(193, 127, 90, 0.1)", marginBottom: 8, width: "100%" }}>
                <p style={{ fontSize: 11, color: "var(--warning)", margin: 0, fontWeight: 700, textAlign: "center" }}>⚠️ No recovery email configured</p>
                <p style={{ fontSize: 11, color: "var(--text-secondary)", margin: "4px 0 0", textAlign: "center" }}>Please use your Recovery Key or Data Rescue below.</p>
             </div>
          ) : (
            <button 
              style={{ ...S.textBtn, color: "var(--accent-color)", padding: 10 }} 
              onClick={handleEmailReset}
              disabled={isSending}
            >
              {isSending ? "Sending code..." : `Forgot PIN? Reset via ${userEmail}`}
            </button>
          )}
          
          <button 
            style={{ ...S.textBtn, fontSize: 11, opacity: 0.6 }} 
            onClick={() => setRecoveryMode('key')}
          >
            Or use 8-digit Recovery Key
          </button>
          
          <div style={{ height: 1, background: "var(--border-color)", width: "60%", margin: "8px 0" }} />
          
          <button 
            style={{ ...S.textBtn, fontSize: 12, color: "var(--warning)", fontWeight: 700, background: "rgba(139, 105, 20, 0.1)", padding: "10px 20px", borderRadius: 99 }} 
            onClick={async () => {
              if (await ask({
                title: "Search for older backups?",
                body: "This looks through storage left by previous versions of BizTrack on this device. Nothing changes unless something is found.",
                confirmLabel: "Search",
              })) {
                ctx.checkRescue(true);
              }
            }}
          >
            {ctx.isRescuing ? "Scanning device..." : "Try Emergency Data Rescue"}
          </button>

          <button 
            style={{ ...S.textBtn, opacity: 0.8, marginTop: 12 }} 
            onClick={() => window.location.reload(true)}
          >
            App stuck? Force Refresh
          </button>
          <p style={{ fontSize: 11, opacity: 0.55, marginTop: 6 }}>BizTrack {VERSION}</p>
        </div>
      </div>
    </div>
  );
}

/* ─── FEATURE GUIDE ────────────────────────────────────────────────────────── */
function FeatureGuide({ ctx }) {
  const [step, setStep] = useState(0);
  const { setHasSeenGuide } = ctx;

  // Every line here has to be true for someone with ONE business, because that
  // is what both real users have and this is the first thing the app says to
  // them. It used to read "across all businesses", "to your portfolio" and
  // "profit ranking", which describes a portfolio tracker: the framing the app
  // spent two days moving away from, still being taught to every new user on
  // their first screen. A ranking of one is also simply not there to see.
  const steps = [
    { target: "home-summary", text: "This is what you have made this month.", pos: "bottom" },
    { target: "add-biz-btn", text: "Running more than one thing? Add it here and they stay separate.", pos: "top" },
    { target: "nav-analytics", text: "This is where you find what sells, what earns, and what is stuck on the shelf.", pos: "top" },
  ];

  const next = () => {
    if (step === steps.length - 1) {
      setHasSeenGuide(true);
    } else {
      setStep(step + 1);
    }
  };

  const current = steps[step];
  const el = document.getElementById(current.target);
  const rect = el ? el.getBoundingClientRect() : { top: 0, left: 0, width: 0, height: 0 };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, pointerEvents: "none" }}>
      <div style={{ 
        position: "absolute", 
        inset: 0, 
        background: "rgba(0,0,0,0.7)", 
        clipPath: `polygon(0% 0%, 0% 100%, ${rect.left}px 100%, ${rect.left}px ${rect.top}px, ${rect.right}px ${rect.top}px, ${rect.right}px ${rect.bottom}px, ${rect.left}px ${rect.bottom}px, ${rect.left}px 100%, 100% 100%, 100% 0%)`,
        pointerEvents: "auto"
      }} onClick={next} />
      
      <div style={{ 
        position: "absolute", 
        top: current.pos === "bottom" ? rect.bottom + 20 : rect.top - 120,
        left: Math.max(20, Math.min(window.innerWidth - 220, rect.left + rect.width/2 - 100)),
        width: 200,
        background: "var(--card-bg)",
        borderRadius: 16,
        padding: 16,
        boxShadow: "var(--shadow-float)",
        pointerEvents: "auto",
        animation: "bt-rise var(--motion-move) var(--ease-out)"
      }}>
        <p style={{ fontSize: 14, color: "var(--text-primary)", fontWeight: 400, margin: "0 0 12px", lineHeight: 1.45 }}>{current.text}</p>
        <button style={{ ...S.primaryBtn, padding: "8px", fontSize: 12 }} onClick={next}>
          {step === steps.length - 1 ? "Finish Guide" : "Next Tip"}
        </button>
      </div>
    </div>
  );
}



/* ─── ACCOUNT SCREEN ───────────────────────────────────────────────────────── */
function AccountScreen({ ctx }) {
  const { setScreen, setModal, userName, setUserName, businesses, userEmail, setUserEmail, showToast, ask, userAvatar, setUserAvatar, isPinEnabled } = ctx;
  // The pre-ledger snapshot is written once, before the migration, and never
  // again, so whether it exists cannot change while this screen is open.
  const [hasPreUpgradeBackup] = useState(() => Boolean(readSnapshot()));
  return (
    <div style={S.screen} className="bt-screen">
      <div style={S.pageHeader}>
        <button style={S.backBtn} onClick={() => setScreen("home")} aria-label="Back">
          <ArrowLeft size={22} />
        </button>
        <h2 style={S.pageTitle}>Account</h2>
        <div style={{ width: 32 }} />
      </div>

      <div style={S.tabInner} className="bt-tabinner">
        {/* PREMIUM PROFILE HEADER */}
        <div style={S.summaryCard}>
          <div style={{ display: "flex", alignItems: "center", gap: 16, position: "relative", zIndex: 1 }}>
            <div style={{ ...S.avatar, width: 64, height: 64, fontSize: 28 }}>{userAvatar?.startsWith('/') ? <img src={userAvatar} alt="" style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover" }} /> : (userAvatar || (userName || "B")[0])}</div>
            <div style={{ minWidth: 0 }}>
              <p style={{ ...S.summaryLabel, margin: 0, opacity: 0.8 }}>Owner Profile</p>
              <h2 style={{ ...S.userName, color: "var(--on-color)", marginTop: 4, overflowWrap: "anywhere" }}>{userName}</h2>
              {/* Ellipsised rather than wrapped: an address broken across two
                  lines is harder to read than a truncated one, and the full
                  value is in the Email Address field further down this screen. */}
              <p style={{ ...S.greeting, color: "rgba(255,255,255,0.6)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{userEmail || "No email linked"}</p>
            </div>
          </div>
        </div>


        
        
        {/* PREMIUM AVATAR PICKER */}
        <div style={S.settingsSection}>
          <p style={S.settingsSectionTitle}>Choose Persona</p>
          <div style={{ 
            display: "flex", 
            gap: 16, 
            overflowX: "auto", 
            padding: "8px 4px 20px", 
            WebkitOverflowScrolling: "touch",
            scrollbarWidth: "thin",
            msOverflowStyle: "auto"
          }}>
            {["/avatars/avatar1.png", "/avatars/avatar2.png", "/avatars/avatar3.png", "/avatars/avatar4.png", "/avatars/avatar5.png"].map((a, i) => (
              <button
                key={a}
                onClick={() => {
                  setUserAvatar(a);
                  showToast("Persona updated");
                }}
                // Five buttons whose only content was an image with no alt
                // text: a screen reader read "button" five times with nothing
                // to choose between them, and nothing said which was picked.
                aria-label={`Persona ${i + 1}`}
                aria-pressed={userAvatar === a}
                style={{
                  ...S.avatar,
                  width: 72,
                  height: 72,
                  flexShrink: 0,
                  padding: 4,
                  overflow: "hidden",
                  border: userAvatar === a ? "3px solid var(--accent-color)" : "3px solid var(--border-color)",
                  background: userAvatar === a ? "var(--control-bg)" : "var(--card-bg)",
                  transition: "border-color var(--motion-move) var(--ease-out), background-color var(--motion-move) var(--ease-out)",
                  cursor: "pointer",
                  borderRadius: "50%"
                }}
              >
                <img src={a} alt="" style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover" }} />
              </button>
            ))}
          </div>
        </div>

        {/* INFO SECTION */}
        <div style={S.settingsSection}>
          <p style={S.settingsSectionTitle}>Personal Details</p>
          <div style={S.settingsCard}>
             <div style={S.settingsRow}>
               <div style={{ flex: 1 }}>
                 <p style={S.settingsRowLabel}>Full Name</p>
                 <input 
                   style={S.settingsInput} 
                   value={userName} 
                   onChange={(e) => setUserName(e.target.value)}
                   placeholder="Enter your name"
                 />
               </div>
             </div>
             <div style={S.settingsDivider} />
             <div style={S.settingsRow}>
               <div style={{ flex: 1 }}>
                 <p style={S.settingsRowLabel}>Email Address</p>
                 <input 
                   style={S.settingsInput} 
                   value={userEmail} 
                   onChange={(e) => setUserEmail(e.target.value)}
                   onBlur={() => {
                     if (userEmail && !validateEmail(userEmail)) {
                       showToast("That email address does not look right.", "error");
                     }
                   }}
                   placeholder="Enter your email"
                 />
               </div>
             </div>
          </div>
        </div>

        
        {/* BACKUP */}
        <div style={S.settingsSection}>
          <p style={S.settingsSectionTitle}>Backup</p>
          <div style={S.settingsCard}>
            {/*
              Account status and sign-out. This used to be the route a
              local-only user took to GET an account, which mattered when
              declining the sign-in screen was possible; it is not, so every
              reader of this row is already signed in. The remaining branch is
              the build with no server configured.
            */}
            {!isBackendConfigured ? (
              <div style={S.settingsRow}>
                <Cloud size={20} color="var(--text-secondary)" />
                <div style={{ flex: 1 }}>
                  <p style={S.settingsRowLabel}>Cloud Backup</p>
                  <p style={S.settingsRowSub}>Not available in this build.</p>
                </div>
              </div>
            ) : ctx.auth?.session ? (
              <>
                {/*
                  Status and action, split. This was one row: a line that read
                  as information, whose whole surface silently signed you out,
                  with the only clue a small word on the right. Removing the
                  duplicate sign-out elsewhere in the same pass then left no
                  control anywhere that says what it does.
                */}
                {/*
                  This row is a STATUS, not a slogan. It used to read "Backed
                  up to your account" whenever a session existed -- before any
                  sync had ever succeeded, and regardless of whether one ever
                  would. Eight accounts read that sentence for days while the
                  server refused every single write, and the only other clue
                  was "waiting for a connection", which pointed at the one
                  thing that was not wrong.

                  So a failure now says it failed, and says what is safe.
                */}
                {(() => {
                  const failed = ctx.sync?.status === "failed";
                  return (
                    <div style={S.settingsRow}>
                      <Cloud size={20} color={failed ? "var(--danger)" : "var(--success)"} />
                      <div style={{ flex: 1 }}>
                        <p style={S.settingsRowLabel}>
                          {failed ? "Backup is not working" : "Backed up to your account"}
                        </p>
                        <p style={S.settingsRowSub}>
                          {ctx.auth.session.user?.email || "Signed in"}
                          {ctx.sync?.status === "offline" ? " · waiting for a connection" : ""}
                          {ctx.sync?.status === "synced" ? " · up to date" : ""}
                          {failed ? " · your records are safe on this phone" : ""}
                        </p>
                        {/* The real reason, not a guess at it. Small, but present:
                            a week from now this is the difference between a
                            console dig and a glance. */}
                        {failed && ctx.sync?.lastError ? (
                          <p style={{ ...S.settingsRowSub, color: "var(--danger)", marginTop: 2 }}>
                            {String(ctx.sync.lastError)}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  );
                })()}
                <div style={S.settingsDivider} />
                <div style={S.settingsRow} onClick={async () => {
                  if (await ask({
                    title: "Sign out?",
                    body: "Your records stay on this device. Signing out never deletes them.",
                    confirmLabel: "Sign out",
                  })) {
                    ctx.signOutOfAccount();
                    showToast("Signed out. Your records are still here.");
                  }
                }}>
                  <LogOut size={20} color="var(--text-secondary)" />
                  <div style={{ flex: 1 }}>
                    <p style={S.settingsRowLabel}>Sign out</p>
                    <p style={S.settingsRowSub}>Your records stay on this device.</p>
                  </div>
                  <ChevronRight size={20} color="var(--text-secondary)" />
                </div>
              </>
            ) : (
              /* This used to offer "Back up to an account" to a local-only
                 user. There is no such user: reaching any screen in the app
                 now means being signed in. The branch survives for the
                 misconfigured-deploy case, where `isBackendConfigured` is
                 false and there is no account to describe. */
              <div style={S.settingsRow}>
                <Cloud size={20} color="var(--text-secondary)" />
                <div style={{ flex: 1 }}>
                  <p style={S.settingsRowLabel}>Backup unavailable</p>
                  <p style={S.settingsRowSub}>
                    This build has no server configured, so your books stay on this phone. Save them to a file to keep a copy.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* YOUR FILES */}
        <div style={S.settingsSection}>
          <p style={S.settingsSectionTitle}>Your files</p>
          <div style={S.settingsCard}>
             <div style={S.settingsRow} onClick={() => exportCsvReport({ businesses, userName, notify: showToast })}>
               <Upload size={20} color="var(--text-secondary)" />
               <div style={{ flex: 1 }}>
                 <p style={S.settingsRowLabel}>Export as CSV</p>
                 <p style={S.settingsRowSub}>A spreadsheet to read or send on. Not a backup.</p>
               </div>
               <ChevronRight size={20} color="var(--text-secondary)" />
             </div>
             <div style={S.settingsDivider} />
             {/*
               A file, not the clipboard. A few hundred sales is tens to
               hundreds of kilobytes, and that pasted into a prompt() on Android
               truncates silently -- which restores PART of someone's books and
               looks like it worked. A file also survives, can be kept, and can
               be sent over WhatsApp, which is how these users move things
               between phones.
             */}
             <div style={S.settingsRow} onClick={() => {
               const payload = buildBackup({
                 businesses, userName, userEmail: ctx.userEmail,
                 currency: ctx.currency, lowStockThreshold: ctx.lowStockThreshold,
               });
               const totals = summarizeLocal(businesses);
               if (saveBackupFile(payload)) {
                 track("backup.save_file", { count: totals.businesses });
                 showToast(`Saved ${totals.businesses} business${totals.businesses === 1 ? "" : "es"} to a file.`);
               } else {
                 showToast("Could not save the file on this device.");
               }
             }}>
               <Download size={20} color="var(--success)" />
               <div style={{ flex: 1 }}>
                 <p style={S.settingsRowLabel}>Save My Data to a File</p>
                 {/* It says "your books" rather than "a backup", and names the
                     one thing it leaves behind. The file carries the ledger as
                     JSON; product photos are blobs in a separate IndexedDB and
                     are NOT in it. The old wording, "a backup to restore from,
                     or to move to another phone", became false the moment
                     photos existed, and this project has already shipped two
                     claims its architecture had made untrue and logged both as
                     liability. Say the limit, or put the photos in the file.
                     There is no third option that is honest. */}
                 <p style={S.settingsRowSub}>Your books, to restore from or to move to another phone. Product photos are not included.</p>
               </div>
             </div>
             {hasPreUpgradeBackup && (
               <>
                 <div style={S.settingsDivider} />
                 <div style={S.settingsRow} onClick={() => downloadSnapshot(showToast)}>
                   <Shield size={20} color="var(--text-secondary)" />
                   <div style={{ flex: 1 }}>
                     <p style={S.settingsRowLabel}>Pre-Upgrade Backup</p>
                     <p style={S.settingsRowSub}>Your books exactly as they were before the last update.</p>
                   </div>
                 </div>
               </>
             )}
             <div style={S.settingsDivider} />
             {/*
               Restore genuinely replaces everything -- it is the one bulk write
               left in the app -- so the confirmation states what arrives AND
               what goes, in counts rather than in the word "data". parseBackup
               validates before any of it is trusted.
             */}
             <div style={S.settingsRow} onClick={async () => {
               let raw;
               try {
                 raw = await pickBackupFile();
               } catch (err) {
                 return showToast(err.message, "error");
               }
               if (!raw) return; // cancelled; not an error, say nothing

               const parsed = parseBackup(raw, ctx.currency);
               if (!parsed) return showToast("That backup has missing or damaged business data, so nothing was changed.", "error");

               const incoming = summarizeLocal(parsed.businesses);
               const current = summarizeLocal(businesses);

               if (!(await ask({
                 title: "Restore this backup?",
                 body:
                   `Coming in: ${incoming.businesses} businesses, ${incoming.items} items, ${incoming.sales} sales. ` +
                   `On this phone now: ${current.businesses} businesses, ${current.items} items, ${current.sales} sales. ` +
                   "Everything currently on this phone is replaced. If you need it, cancel and save it to a file first.",
                 confirmLabel: "Replace my books",
                 danger: true,
               }))) return;

               ctx.replaceBusinesses(parsed.businesses);
               if (parsed.userName) ctx.setUserName(parsed.userName);
               if (parsed.userEmail) ctx.setUserEmail(parsed.userEmail);
               if (parsed.currency) ctx.setCurrency(parsed.currency);
               track("backup.restore_file", { count: incoming.businesses });
               showToast(`Restored ${incoming.businesses} business${incoming.businesses === 1 ? "" : "es"}.`);
             }}>
               <Upload size={20} color="var(--warning)" />
               <div style={{ flex: 1 }}>
                 <p style={S.settingsRowLabel}>Restore From a File</p>
                 <p style={S.settingsRowSub}>Load books saved from this or another phone.</p>
               </div>
             </div>
          </div>
        </div>

        {/* SECURITY */}
        <div style={S.settingsSection}>
          <p style={S.settingsSectionTitle}>Security</p>
          <div style={S.settingsCard}>
            <SwitchRow
              icon={<Lock size={20} color="var(--text-secondary)" />}
              label="Passcode Lock"
              sub={isPinEnabled ? "Enabled. Tap to disable" : "Disabled. Tap to enable"}
              on={isPinEnabled}
              tone="var(--success)"
              onToggle={async () => {
                if (isPinEnabled) {
                  if (await ask({
                    title: "Turn off the passcode?",
                    body: "The recovery key is removed with it. Your books stay exactly as they are.",
                    confirmLabel: "Turn off",
                    danger: true,
                  })) {
                    ctx.setIsPinEnabled(false);
                    ctx.setHashedPin(null);
                    ctx.setHashedRecoveryKey(null);
                    showToast("PIN disabled");
                  }
                } else {
                  setModal("pin-setup");
                }
              }}
            />
          </div>
        </div>

        {/* DANGER ZONE: shut by default. Both of these erase something that
            cannot be recovered, and both used to be permanently on screen. */}
        <Disclosure
          title="Danger zone"
          sub="Delete your account, or erase everything on this phone."
          icon={<AlertTriangle size={20} color="var(--danger)" />}
          tone="var(--danger)"
        >
          {isBackendConfigured && ctx.auth?.session && (
            <>
            <div style={S.settingsRow} onClick={async () => {
              // Two gates on purpose. The first is the one that matters: it
              // offers the export BEFORE anything is destroyed, because the
              // cloud copy may be the only backup of someone's books.
              // Typed confirmation, not a second tap. A destructive action
              // reached by muscle memory is not a decision. It is one dialog
              // now rather than a confirm followed by a prompt: the second
              // native dialog was the one Android is most likely to suppress,
              // and a suppressed prompt returns null, which made deleting an
              // account impossible rather than merely awkward.
              if (!(await ask({
                title: "Delete your account?",
                body:
                  "This erases your account and every record stored on our servers. It cannot be undone. " +
                  "Records on THIS device are NOT deleted: they stay until you clear the app. " +
                  "Export your data first if you have not already.",
                confirmLabel: "Delete my account",
                requireTyped: "DELETE",
                danger: true,
              }))) return;

              showToast("Deleting your account…");
              const { error } = await deleteAccount();
              if (error) return showToast(error.message);
              showToast("Account deleted. Your device records are still here.");
              setScreen("home");
            }}>
              <Trash2 size={20} color="var(--danger)" />
              <div style={{ flex: 1 }}>
                <p style={{ ...S.settingsRowLabel, color: "var(--danger)" }}>Delete Account</p>
                <p style={S.settingsRowSub}>Erase your account and everything stored on our servers. Records on this device stay.</p>
              </div>
            </div>
              <div style={S.settingsDivider} />
            </>
          )}
          <div
            style={S.settingsRow}
        onClick={async () => {
          // Last chance to walk away with a copy, offered BEFORE the final
          // confirmation rather than after it, so it arrives while walking
          // away is still the answer.
          //
          // This used to call downloadSnapshot, which is the PRE-UPGRADE
          // backup: written once before the ledger migration and never
          // rewritten. Someone who had traded for months since then did the
          // right thing, took the copy, erased, and was left holding their
          // books as of migration day. And the whole offer was gated on that
          // snapshot existing, so a user who had never migrated -- which is
          // every new user -- was offered no copy at all before the wipe.
          if (await ask({
            title: "Download a copy first?",
            body: "This saves everything on this phone as a file you can restore from later. Strongly recommended before erasing anything.",
            confirmLabel: "Download a copy",
            cancelLabel: "Skip",
          })) {
            const saved = saveBackupFile(buildBackup({
              businesses, userName, userEmail: ctx.userEmail,
              currency: ctx.currency, lowStockThreshold: ctx.lowStockThreshold,
            }));
            if (!saved) {
              showToast("Could not save the file on this device. Nothing was erased.", "error");
              return;
            }
          }
          if (!(await ask({
            title: "Erase everything on this phone?",
            body: "Every business, sale and item stored in this browser is deleted. There is no undo.",
            confirmLabel: "Erase everything",
            requireTyped: "ERASE",
            danger: true,
          }))) return;
          // `localStorage.clear()` does NOT touch IndexedDB, and product
          // photos live there. Without this line the dialog above, which says
          // everything stored in this browser is deleted, would be false: the
          // books would go and every photograph of the stock would remain on
          // the phone the owner believed they had just wiped.
          await deleteAllPhotos();
          localStorage.clear();
          window.location.reload();
        }}
          >
            <Trash2 size={20} color="var(--danger)" />
            <div style={{ flex: 1 }}>
              <p style={{ ...S.settingsRowLabel, color: "var(--danger)" }}>Erase this phone</p>
              <p style={S.settingsRowSub}>Delete every business, sale and item stored in this browser. There is no undo.</p>
            </div>
          </div>
        </Disclosure>

        
        <div style={{ height: 40 }} />
        <p style={{ textAlign: "center", fontSize: 11, color: "var(--text-secondary)", opacity: 0.6, marginBottom: 20 }}>BizTrack {VERSION} • Build {BUILD_DATE}</p>
      </div>
    </div>
  );
}


/* ─── STYLES ────────────────────────────────────────────────────────────────── */
/** The one type step a section label uses. Shared so `sectionLabel` and
 *  `sectionHead` cannot drift apart: they differ only in whether they own the
 *  break above them. */
/**
 * The photo column.
 *
 * A product photo is CONTENT, not an interface glyph, so it does not sit in
 * the 20px icon slot that puts text on 72. It gets a real column, and there is
 * exactly one: 24 of gutter + 16 of card padding + 48 + 12, so every row that
 * leads with a picture starts its text on **100**.
 *
 * It is one number because it was three. The inventory row spent 48, every
 * sale row spent 40, and the low-stock strip spends 28, which put text on 100,
 * 92 and 78 on screens a person flips between with a tab strip. 92 against 100
 * is the near-miss class this file has a whole pass about: far too small to
 * name and far too large not to feel.
 */
const PHOTO = { size: 48, radius: 12, gap: 12 };

/** How many low-stock items Home names before it starts counting instead.
 *  Four is a strip; twenty is a wall above the ledger someone opened the app
 *  to read. The rest are not hidden, they are counted, and each named row
 *  carries the shop it is in so the reader knows where to go. */
const LOW_STOCK_SHOWN = 4;

const SECTION_TYPE = { fontSize: 16, fontWeight: 700, color: "var(--text-primary)", margin: 0, letterSpacing: -0.1 };

const S = {
  shell: { minHeight: "100dvh", background: "var(--bg-primary)", display: "flex", justifyContent: "center", fontFamily: "var(--font-sans)", padding: 0, margin: 0 },
  phone: { width: "100%", maxWidth: 600, height: "100dvh", background: "var(--bg-primary)", overflow: "hidden", display: "flex", flexDirection: "column", position: "relative", shadow: "none", borderRadius: 0 },
  screenWrap: { flex: 1, overflow: "hidden", position: "relative" },
  screen: { position: "absolute", inset: 0, overflowY: "auto", paddingTop: "env(safe-area-inset-top)", paddingBottom: "calc(80px + env(safe-area-inset-bottom))", scrollbarWidth: "none" },

  // Home's rhythm, and it is the same fix Analytics finding 1 got.
  //
  // It measured 8 / 16 / 14: three breaks doing one job, none of them chosen,
  // each one whatever margin the PRECEDING element happened to carry -- the
  // header's 8, the summary card's 16, the banner's own. 16 against 14 is the
  // two-pixel near-miss this project has a whole pass about.
  //
  // Now every break belongs to the block that STARTS, on the app's one ratio:
  // 12 within a group, 28 between. The header and the summary card are one idea
  // (who you are, how your month is going), so that gap is 12. The warning and
  // the list are each a new section, so both are 28.
  homeHeader: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "16px 24px 0" },
  greeting: { fontSize: 14, color: "var(--text-secondary)", margin: 0, fontWeight: 400, letterSpacing: 0 },
  userName: { fontSize: 26, color: "var(--text-primary)", margin: "2px 0 0", fontWeight: 600, fontFamily: "var(--font-sans)", letterSpacing: -0.7, lineHeight: 1.15 },
  avatar: { width: 44, height: 44, borderRadius: "50%", background: "linear-gradient(135deg,#A5603A,#7A5514)", color: "var(--bg-primary)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 18, flexShrink: 0 },
  settingsInput: { width: "100%", border: "1px solid var(--border-color)", borderRadius: 12, padding: "12px", fontSize: 16, color: "var(--text-primary)", background: "var(--card-bg)", marginTop: 4 },

  summaryCard: { margin: "12px 24px 0", background: "linear-gradient(135deg,var(--focus-ground),#5C3D2E)", borderRadius: 22, padding: "20px 16px", position: "relative", overflow: "hidden" },
  summaryLabel: { fontSize: 11, color: "rgba(255,255,255,0.85)", margin: "0 0 6px", letterSpacing: 0.8, textTransform: "uppercase", fontWeight: 600 },
  summaryAmount: { fontSize: 36, color: "var(--on-color)", margin: "0 0 18px", fontFamily: "var(--font-sans)", fontWeight: 500, letterSpacing: -1.6, lineHeight: 1.05 },
  amountUnit: { fontSize: "0.5em", fontWeight: 500, opacity: 0.5, letterSpacing: 0.8, marginRight: "0.2em" },
  summaryRow: { display: "flex", alignItems: "center", gap: 16 },
  summaryNote: { fontSize: 12, color: "rgba(255,255,255,0.78)", margin: 0, lineHeight: 1.5, maxWidth: 380 },
  summaryDivider: { width: 1, height: 28, background: "rgba(255,255,255,0.2)" },
  summarySubLabel: { fontSize: 11, color: "rgba(255,255,255,0.8)", margin: "0 0 3px", textTransform: "uppercase", letterSpacing: 0.6, fontWeight: 600 },
  summarySubVal: { fontSize: 16, color: "var(--on-color)", margin: 0, fontWeight: 600 },

  alertBanner: { margin: "28px 24px 0", background: "var(--warning-bg)", borderRadius: 16, padding: "13px 15px", display: "grid", gridTemplateColumns: "20px minmax(0,1fr)", columnGap: 12, alignItems: "start", border: "1px solid var(--warning-border)" },
  alertIcon: { fontSize: 20, flexShrink: 0, marginTop: 1 },
  alertTitle: { fontSize: 14, fontWeight: 600, color: "var(--warning)", margin: "0 0 3px" },
  alertSub: { fontSize: 12, color: "var(--text-secondary)", margin: 0, fontWeight: 400, lineHeight: 1.45 },

  sectionRow: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 24px 12px", marginTop: 28 },
  /* The TYPE only, and no margin. Used inside `sectionRow`, which is a centred
     flex row, and as the base for the onboarding headings. A top margin on
     either would misalign the label against the button beside it. */
  sectionLabel: { ...SECTION_TYPE },
  /* A label that STARTS a section in a scrolling column, and owns the break
     above it.
     That break used to be residue rather than a decision: `tabInner` supplies a
     12px gap and each section was separated by whatever `marginBottom` the
     PRECEDING element happened to carry. The summary card had 16, a chart card
     had 8, and a list row had none, so the three gaps on Analytics measured 28,
     20 and 12. The last one is the defect: 12 is also the gap between two rows
     INSIDE the list above it, so a new heading sat no further from the previous
     section than two items in one list, and nine rows read as a single run.
     Owned here, every section break is 12 + 16 = 28 against 12 within a group:
     one ratio, one place to change it, and nothing to remember at a call site. */
  sectionHead: { ...SECTION_TYPE, marginTop: 16 },
  // The lead owns the same 16 as a section head, so the break above it is the
  // app's 28 and it sits in the page's rhythm rather than beside it. No
  // background, no border, no radius: on a screen of eleven cards the one thing
  // that is not a card is the thing the eye finds first.
  lead: { marginTop: 16 },

  // The business named beside its period control. Both are about the WHOLE
  // page, so they sit above everything rather than beside the first card.
  analysisHead: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, minWidth: 0 },
  analysisBiz: { ...SECTION_TYPE, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  chartNote: { fontSize: 12, color: "var(--text-secondary)", margin: 0, lineHeight: 1.5 },

  // Not `infoCard`: that carries a 4px accent border, which is a status device,
  // and this is a figure rather than a status. Same 16 padding as every card.
  shelfCard: { background: "var(--card-bg)", borderRadius: 16, padding: "14px 16px", boxShadow: "0 0 0 1px var(--border-color)", display: "flex", flexDirection: "column", gap: 4 },
  shelfValue: { fontSize: 20, fontWeight: 600, letterSpacing: -0.4, color: "var(--text-primary)", margin: 0 },
  leadEyebrow: { fontSize: 11, fontWeight: 600, letterSpacing: 0.6, textTransform: "uppercase", margin: "0 0 6px" },
  leadBody: { fontSize: 16, fontWeight: 500, lineHeight: 1.45, letterSpacing: -0.1, color: "var(--text-primary)", margin: 0, maxWidth: 420 },
  textBtn: { fontSize: 14, color: "var(--accent-text)", fontWeight: 600, background: "none", border: "none", cursor: "pointer", padding: "12px 6px", margin: "-12px -6px", minHeight: 44 },

  /* No side padding, because the row is full-bleed: the wash has to reach both
     screen edges or it is a card again. The 24px gutter moved onto the row's
     own padding, so text still starts on 24 and the figures still end on 366. */
  bizList: { display: "flex", flexDirection: "column" },
  bizRow: { display: "grid", gridTemplateColumns: "36px minmax(0,1fr) auto", alignItems: "center", gap: "0 12px", padding: "14px 24px", width: "100%", background: "none", border: "none", borderBottom: "1px solid var(--border-color)", textAlign: "left", cursor: "pointer", font: "inherit", color: "inherit" },
  /* The shop's own sign, and the only thing on this screen that is allowed to
     carry the owner's colour. It replaced a 4px stripe plus a bare glyph, which
     between them were 1.8% of the row: too small to recognise before reading,
     and sitting at the edge rather than where the eye enters. 36px is not a
     round number chosen by feel, it is what keeps the text on 72: the 24 gutter
     plus 36 plus the row's own 12 gap. */
  /* 36 rather than the old 20, and the number is not free: text after an icon
     sits on 72, which is the 24 gutter plus this slot plus the row's 12px gap.
     It also finally gives the glyph a box it fits in. The sweep has reported an
     emoji painting 25px inside a declared 20px slot since the motion session. */
  /* Full row height and flush to the screen edge, inside the 24px gutter where
     no type ever goes. That is the whole reason it can be full strength: no
     contrast ratio applies to a band nothing is written on. */
  bizKerb: { position: "absolute", left: 0, top: 0, bottom: 0, width: 10 },
  /* 24, up from 19. An emoji renders about 1.37x its font-size, so this paints
     33x31 and the 36px slot holds it with 1.5px clear, measured on all four
     rows at offset 0,0 from the slot's centre. Do not raise it further without
     re-measuring: 26px is where it stops fitting. */
  // The picture as a control. No fill, no border and no shadow of its own: the
  // image is the affordance and a frame around it would be a second one.
  photoTarget: { background: "none", border: "none", padding: 0, cursor: "pointer", borderRadius: 16, lineHeight: 0, display: "block" },
  photoBtn: { display: "inline-flex", alignItems: "center", gap: 6, background: "var(--control-bg)", color: "var(--text-primary)", border: "1px solid var(--control-border)", borderRadius: 12, padding: "8px 12px", fontSize: 14, fontWeight: 600, fontFamily: "var(--font-sans)", cursor: "pointer", minHeight: 40 },
  bizRowSlot: { width: 36, textAlign: "center", fontSize: 24, lineHeight: 1 },
  bizRowMain: { display: "flex", flexDirection: "column", gap: 3, minWidth: 0 },
  bizRowName: { fontSize: 14, fontWeight: 600, color: "var(--text-primary)" },
  bizRowMeta: { fontSize: 12, fontWeight: 400, color: "var(--text-secondary)" },
  bizRowRight: { display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3, textAlign: "right" },
  bizRowAmount: { fontSize: 16, fontWeight: 600, color: "var(--text-primary)", letterSpacing: -0.2 },
  bizRowNote: { fontSize: 12, fontWeight: 500, whiteSpace: "nowrap" },
  bizName: { fontSize: 14, fontWeight: 600, color: "var(--text-primary)", margin: "0 0 3px" },
  bizCat: { fontSize: 12, color: "var(--text-secondary)", margin: 0, fontWeight: 400 },
  badge: { fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 99 },

  /* Its own gutter now. It used to inherit one from bizList, which the
     full-bleed rows took away. */
  emptyState: { padding: "40px 16px", textAlign: "center" },
  emptyIcon: { fontSize: 40, margin: "0 0 12px" },
  emptyTitle: { fontSize: 16, fontWeight: 600, color: "var(--text-primary)", margin: "0 0 6px" },
  emptySub: { fontSize: 14, color: "var(--text-secondary)", margin: 0, fontWeight: 400, lineHeight: 1.45 },

  // BIZ SCREEN
  bizHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 24px 10px", flexShrink: 0 },
  backBtn: { fontSize: 22, background: "none", border: "none", cursor: "pointer", color: "var(--text-primary)", margin: -11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", width: 44, height: 44, flexShrink: 0 },
  iconBtn: { fontSize: 18, background: "none", border: "none", cursor: "pointer", margin: -12, display: "flex", alignItems: "center", justifyContent: "center", width: 44, height: 44, flexShrink: 0 },
  bizHeaderCenter: { display: "flex", alignItems: "center", gap: 8 },
  bizHeaderName: { fontSize: 16, fontWeight: 600, color: "var(--text-primary)", letterSpacing: -0.1 },

  bizHero: { margin: "0 24px 16px", borderRadius: 22, padding: "20px 16px", position: "relative", overflow: "hidden" },
  heroLabel: { fontSize: 11, color: "rgba(255,255,255,0.88)", margin: "0 0 4px", textTransform: "uppercase", letterSpacing: 0.6, fontWeight: 600 },
  heroAmount: { fontSize: 26, color: "var(--on-color)", margin: "0 0 12px", fontFamily: "var(--font-sans)", fontWeight: 500, letterSpacing: -0.8, lineHeight: 1.05 },
  heroMeta: { display: "flex", gap: 16, fontSize: 12, color: "rgba(255,255,255,0.8)", fontWeight: 400, marginBottom: 14 },
  heroMetaVal: { color: "var(--on-color)", fontWeight: 600 },
  progBg: { height: 4, background: "rgba(255,255,255,0.22)", borderRadius: 99, overflow: "hidden" },
  progFill: { height: "100%", background: "rgba(255,255,255,0.85)", borderRadius: 99 },

  tabs: { display: "flex", padding: "0 24px", gap: 8, marginBottom: 14, flexShrink: 0 },
  tab: { flex: 1, padding: "9px 0", borderRadius: 12, border: "none", background: "var(--control-bg)", color: "var(--text-secondary)", fontWeight: 600, fontSize: 14, cursor: "pointer", fontFamily: "var(--font-sans)", transition: "background-color var(--motion-tap) var(--ease-out), color var(--motion-tap) var(--ease-out)" },
  tabActive: { background: "var(--text-primary)", color: "var(--bg-primary)" },
  tabContent: { flex: 1 },
  /* The photo is CONTENT, so it gets a real column rather than the 20px icon
     slot the alignment system reserves for interface glyphs. Text in these rows
     therefore starts on 108 (24 gutter + 16 card padding + 56 + 12) rather than
     the usual 40. That is a deliberate second column, not a near-miss: it is
     36px clear of the 72 line, and every row has the slot whether it holds a
     photo or not, so nothing in the list is ragged. */
  /* 48, not 56. The row already carried a name, two meta lines, a restock
     button and a profit column, and at 320 a 56px photo left the name 54px to
     live in. Measured, not guessed. */
  customTag: { fontSize: 11, fontWeight: 600, color: "var(--warning)", background: "var(--control-bg)", padding: "2px 6px", borderRadius: 99, letterSpacing: 0.4, textTransform: "uppercase", whiteSpace: "nowrap", flexShrink: 0 },
  invPhotoBtn: { background: "none", border: "none", padding: 0, marginRight: PHOTO.gap, cursor: "pointer", borderRadius: 12, flexShrink: 0, lineHeight: 0 },
  tabInner: { padding: "0 24px", display: "flex", flexDirection: "column", gap: 12 },

  infoCard: { background: "var(--card-bg)", borderRadius: 16, padding: "14px 16px 14px 12px", borderLeft: "4px solid var(--warning)", boxShadow: "0 0 0 1px var(--border-color)" },
  infoLabel: { fontSize: 11, color: "var(--text-secondary)", margin: "0 0 5px", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.6 },
  infoVal: { fontSize: 16, color: "var(--text-primary)", margin: "0 0 4px", fontWeight: 600 },
  infoSub: { fontSize: 12, color: "var(--text-secondary)", margin: "2px 0 0", fontWeight: 400, lineHeight: 1.45 },

  statsGrid: { display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 10 },
  statCard: { background: "var(--card-bg)", borderRadius: 16, padding: "16px", boxShadow: "0 0 0 1px var(--border-color)" },
  statLbl: { fontSize: 11, color: "var(--text-secondary)", margin: "0 0 6px", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.6 },
  statVal: { fontSize: 20, fontWeight: 700, color: "var(--text-primary)", margin: 0, letterSpacing: -0.3 },

  dashedBtn: { background: "none", border: "2px dashed var(--control-border)", borderRadius: 12, padding: "13px", textAlign: "center", color: "var(--accent-text)", fontWeight: 600, fontSize: 14, cursor: "pointer", width: "100%", fontFamily: "var(--font-sans)" },

  // Wraps, and the wrap engages only when the row genuinely does not fit. At
  // 320 the widest of these wants 48 of photo, 12 of gap, a 96px name floor and
  // a money column whose MIN-content is 99, because "FCFA 45,500" is one
  // unbreakable token: 255 in 240. Four things and not one of them can give, so
  // the figures take their own line rather than the row running past the card
  // edge. At 360 and up nothing moves.
  invRow: { background: "var(--card-bg)", borderRadius: 16, padding: "14px 16px", display: "flex", flexWrap: "wrap", rowGap: 4, justifyContent: "space-between", alignItems: "flex-start", boxShadow: "0 0 0 1px var(--border-color)" },
  // The sold-out group's header. Same surface, radius, padding and hairline as
  // the rows it holds, because a shut section here IS a row on this screen's
  // card. It does not wrap: an icon, a two-line label and a chevron, with the
  // label the only thing allowed to give.
  invGroupRow: { background: "var(--card-bg)", borderRadius: 16, padding: "14px 16px", display: "flex", alignItems: "center", gap: 12, boxShadow: "0 0 0 1px var(--border-color)", border: "none", width: "100%", cursor: "pointer", font: "inherit", textAlign: "left" },
  invNameRow: { display: "flex", alignItems: "center", gap: 8, marginBottom: 5 },
  invName: { fontSize: 14, fontWeight: 600, color: "var(--text-primary)", margin: 0 },
  invSub: { fontSize: 12, color: "var(--text-secondary)", margin: "2px 0 0", fontWeight: 400 },
  invProfit: { fontSize: 14, fontWeight: 600, color: "var(--success)", margin: 0 },
  // The figure that leads an inventory row. Not green: it is a count, not a
  // gain, and the badge beside it is what carries any colour the row needs.
  invStock: { fontSize: 16, fontWeight: 600, color: "var(--text-primary)", margin: 0, whiteSpace: "nowrap" },
  lowBadge: { fontSize: 11, fontWeight: 600, background: "var(--danger-bg)", color: "var(--danger)", padding: "2px 7px", borderRadius: 99, whiteSpace: "nowrap", flexShrink: 0 },
  marginBadge: { fontSize: 11, color: "var(--success)", fontWeight: 600, background: "var(--success-bg)", padding: "2px 8px", borderRadius: 99 },
  deleteBtn: { fontSize: 14, color: "var(--danger)", background: "none", border: "none", cursor: "pointer", fontWeight: 700, width: 44, height: 44, margin: "-12px -14px -12px 0", display: "flex", alignItems: "center", justifyContent: "center" },

  saleRow: { background: "var(--card-bg)", borderRadius: 16, padding: "14px 16px", display: "flex", flexWrap: "wrap", rowGap: 4, justifyContent: "space-between", alignItems: "center", boxShadow: "0 0 0 1px var(--border-color)" },
  saleName: { fontSize: 14, fontWeight: 600, color: "var(--text-primary)", margin: "0 0 4px" },
  saleSub: { fontSize: 12, color: "var(--text-secondary)", margin: 0, fontWeight: 400 },
  saleRev: { fontSize: 16, fontWeight: 600, color: "var(--text-primary)", margin: "0 0 3px" },
  salePft: { fontSize: 12, color: "var(--success)", fontWeight: 500 },
  restockBtn: { background: "var(--control-bg)", color: "var(--warning)", border: "none", padding: "0 16px", minHeight: 44, borderRadius: 12, fontSize: 14, fontWeight: 600, cursor: "pointer", marginTop: 8, display: "inline-flex", alignItems: "center" },

  // ANALYTICS
  analyticsRow: { background: "var(--card-bg)", borderRadius: 16, padding: "14px 16px", display: "grid", gridTemplateColumns: "20px minmax(0,1fr) auto", columnGap: 12, rowGap: 10, alignItems: "center", boxShadow: "0 0 0 1px var(--border-color)" },
  /* No `marginBottom`. It was one of the three ad-hoc values faking a section
     break; `sectionHead` owns that now. */
  // 16 top and bottom, 8 left and right, and both halves of that are chosen.
  //
  // It was 16/8/8, which is the one spelling that is wrong: 16 above the plot
  // and 8 below it, so the chart sat high in its own surface for no reason
  // anyone picked. Vertically it is symmetric now, like every other card.
  //
  // Horizontally it stays at 8, and that is the design system's own "unless
  // content genuinely demands asymmetry". It was measured rather than assumed:
  // at 320 the extra 16px of plot is worth ONE more week label on the axis
  // (7 of 8 against 6), and at 360 and up it costs nothing either way. A card
  // of text spends 16 at the sides; a card holding a plot spends 8 and buys a
  // label with it.
  chartCard: { background: "var(--card-bg)", borderRadius: 16, padding: "16px 8px", boxShadow: "0 0 0 1px var(--border-color)" },
  noteCard: { background: "var(--control-bg)", borderRadius: 16, padding: "14px 16px" },
  rankNum: { fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", textAlign: "center", fontVariantNumeric: "tabular-nums" },
  /* When the ring is on screen the rank IS the legend. Reusing the number that
     was already in the row beats adding a colour dot beside it: the row
     already carries a rank, an emoji and a name, and a fourth mark would be
     one more thing competing in a 20px column.

     `ringColor`, never the raw colour. White on the raw palette fails AA on
     NINE of the sixteen, worst 3.10:1 on the sage, which is exactly what
     `heroTint` was written to prevent and exactly what this nearly shipped.
     `ringColor` darkens in light mode and LIFTS in dark, because a darkened
     segment is invisible on a dark card. The segment uses the same function,
     so the key and the slice are the same colour in both themes. */
  rankKey: { width: 20, height: 20, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  analyticsProfit: { fontSize: 14, fontWeight: 600, color: "var(--text-primary)", margin: 0, whiteSpace: "nowrap" },

  // SETTINGS
  pageHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 24px 16px" },
  pageTitle: { fontSize: 20, fontWeight: 600, color: "var(--text-primary)", margin: 0, fontFamily: "var(--font-sans)", letterSpacing: -0.4 },

  // 16, not 28: the container this sits in already supplies a 12px gap, and
  // 28 on top of that measured 40. Same trap the summary card fell into twice
  // today -- a component with its own outer margin nested in something that
  // already has one. The break you get is the SUM.
  settingsSection: { marginTop: 16 },
  settingsSectionTitle: { fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: 0.6, margin: "0 0 12px" },
  settingsCard: { background: "var(--card-bg)", borderRadius: 16, overflow: "hidden", boxShadow: "0 0 0 1px var(--border-color)" },
  settingsRow: { display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", cursor: "pointer" },
  /* Same geometry as settingsRow, with a button's defaults undone so the row
     looks identical to the ones beside it. */
  switchRow: { display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", cursor: "pointer", width: "100%", background: "none", border: "none", font: "inherit", textAlign: "left" },
  /* Exactly settingsRow's geometry, with a button's defaults undone, so the
     header of a shut section is indistinguishable from any other row. */
  discloseRow: { display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", cursor: "pointer", width: "100%", background: "none", border: "none", font: "inherit", textAlign: "left" },
  toggleTrack: { width: 44, height: 24, borderRadius: 99, position: "relative", flexShrink: 0, display: "block", transition: "background-color var(--motion-move) var(--ease-out)" },
  toggleKnob: { width: 18, height: 18, borderRadius: "50%", background: "var(--card-bg)", position: "absolute", top: 3, left: 3, transition: "transform var(--motion-move) var(--ease-out)" },
  settingsRowLabel: { fontSize: 14, fontWeight: 600, color: "var(--text-primary)", margin: "0 0 2px" },
  settingsRowSub: { fontSize: 12, color: "var(--text-secondary)", margin: 0, fontWeight: 400 },
  settingsDivider: { height: 1, background: "var(--border-color)", margin: "0 16px" },
  /* The two shapes a select takes here: compact, sitting at the end of a
     settings row, and full width inside a form. Both hide the platform arrow
     and leave room for the one the app draws: 12 of inset, a 20px chevron, and
     6 of air before the text can reach it. */
  select: { display: "inline-flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 500, color: "var(--text-primary)", background: "var(--control-bg)", border: "1px solid var(--control-border)", borderRadius: 12, padding: "10px 12px", minHeight: 44, cursor: "pointer", fontFamily: "var(--font-sans)" },
  /* `flex: 1` so the label takes the slack and the chevron is pushed to the
     field's edge. Without it the span sizes to its text and the arrow sits
     wherever the words happen to end: measured 93px short of the right edge on
     the sale sheet, which is exactly the "floating" the native arrow was
     replaced for. `minWidth: 0` is what lets it ellipsise instead of refusing
     to shrink, the same flex default that produced two other bugs this week. */
  selectValue: { flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  /* An option is a row on the sheet, on the same 16px inner padding and 12px
     radius as every other control. The chosen one is marked by the accent tint
     AND a tick, never by colour alone. */
  optionRow: { display: "flex", alignItems: "center", gap: 12, width: "100%", minHeight: 52, padding: "12px 16px", borderRadius: 12, border: "1px solid var(--border-color)", background: "var(--card-bg)", color: "var(--text-primary)", fontSize: 16, fontWeight: 500, fontFamily: "var(--font-sans)", cursor: "pointer", textAlign: "left" },
  optionRowOn: { background: "var(--control-bg)", borderColor: "var(--accent-text)", fontWeight: 600 },

  feedbackCard: { background: "var(--card-bg)", borderRadius: 16, padding: "16px", boxShadow: "0 0 0 1px var(--border-color)" },
  feedbackTitle: { fontSize: 16, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 4px", letterSpacing: -0.1 },
  feedbackSub: { fontSize: 14, color: "var(--text-secondary)", margin: "0 0 16px", fontWeight: 400, lineHeight: 1.45 },
  emojiRow: { display: "flex", gap: 4, marginBottom: 16 },
  emojiBtn: { flex: 1, minWidth: 0, fontSize: 28, background: "none", border: "none", cursor: "pointer", padding: "4px 0", borderRadius: 12 },
  feedbackInput: { width: "100%", minHeight: 80, borderRadius: 12, border: "1.5px solid var(--border-color)", padding: "10px 12px", fontSize: 16, fontFamily: "var(--font-sans)", color: "var(--text-primary)", background: "var(--bg-primary)", resize: "none", boxSizing: "border-box", marginBottom: 12 },
  submitBtn: { width: "100%", background: "var(--text-primary)", color: "var(--bg-primary)", border: "none", borderRadius: 12, padding: "14px", fontSize: 16, fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-sans)" },

  // MODALS
  modalOverlay: { position: "absolute", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "flex-end", zIndex: 100 },
  modalSheet: { position: "relative", background: "var(--bg-primary)", borderRadius: "22px 22px 0 0", width: "100%", maxHeight: "90%", overflowY: "auto", paddingBottom: "calc(40px + env(safe-area-inset-bottom))" },
  /* The strip the drag starts from: the handle and the title, and nothing
     below them. `touchAction: none` is what stops the browser claiming the
     gesture as a scroll before the handler ever sees it, and it is scoped to
     this strip precisely so the form underneath still scrolls normally. */
  modalGrab: { touchAction: "none", cursor: "grab", userSelect: "none" },
  modalHandle: { width: 40, height: 4, background: "var(--control-border)", borderRadius: 99, margin: "14px auto 4px" },
  /* Hidden by default and revealed at 700px by `.bt-sheet-close`. Inline
     styles outrank a stylesheet, so the media query carries `!important`,
     which is the same reason every responsive block in this app does. */
  modalClose: { display: "none", position: "absolute", top: 12, right: 12, width: 40, height: 40, alignItems: "center", justifyContent: "center", background: "var(--control-bg)", color: "var(--text-secondary)", border: "none", borderRadius: "50%", cursor: "pointer" },
  modalTitle: { fontSize: 20, fontWeight: 600, color: "var(--text-primary)", margin: "8px 24px 16px", fontFamily: "var(--font-sans)", letterSpacing: -0.4 },
  modalBody: { padding: "0 24px", display: "flex", flexDirection: "column", gap: 12 },

  fieldLabel: { fontSize: 14, fontWeight: 500, color: "var(--text-secondary)", margin: "4px 0 4px", letterSpacing: 0 },
  formError: { fontSize: 13, fontWeight: 500, color: "var(--danger)", background: "var(--danger-bg)", border: "1px solid var(--danger-border)", borderRadius: 12, padding: "10px 14px", margin: 0, lineHeight: 1.45, animation: "bt-rise var(--motion-move) var(--ease-out)" },
  /* The same block on the screens that are dark in BOTH themes, which cannot
     use the light-mode tint above. Passed to them through `styles`, which is
     how they already get everything else, so there is one definition rather
     than one per screen. */
  formErrorDark: { fontSize: 13, fontWeight: 500, color: "var(--danger-on-focus)", background: "var(--danger-on-focus-bg)", border: "1px solid var(--danger-on-focus-border)", borderRadius: 12, padding: "10px 14px", margin: "0 0 12px", lineHeight: 1.45, animation: "bt-rise var(--motion-move) var(--ease-out)" },
  formNoticeDark: { fontSize: 13, fontWeight: 500, color: "var(--success-on-focus)", background: "var(--success-on-focus-bg)", border: "1px solid var(--success-on-focus-border)", borderRadius: 12, padding: "10px 14px", margin: "0 0 12px", lineHeight: 1.45, animation: "bt-rise var(--motion-move) var(--ease-out)" },
  input: { width: "100%", height: 48, borderRadius: 12, border: "1.5px solid var(--border-color)", padding: "0 14px", fontSize: 16, fontFamily: "var(--font-sans)", color: "var(--text-primary)", background: "var(--card-bg)", boxSizing: "border-box", appearance: "auto" },
  /* S.input, minus the platform arrow it explicitly asked for, plus room for
     the drawn one. Everything else matches the text fields it sits between. */
  selectFull: { display: "flex", alignItems: "center", gap: 8, width: "100%", height: 48, borderRadius: 12, border: "1.5px solid var(--border-color)", padding: "0 14px", fontSize: 16, fontFamily: "var(--font-sans)", color: "var(--text-primary)", background: "var(--card-bg)", boxSizing: "border-box", cursor: "pointer", textAlign: "left" },

  colorDot: { width: 44, height: 44, borderRadius: "50%", border: "none", cursor: "pointer", outlineOffset: 3 },
  /* Sized to the thing it sits beside, so the row stays one row. The count
     reads as a quantity rather than as an icon, which is the point: it says
     how much more there is without anyone having to open it. */
  pickMore: { width: 44, height: 44, borderRadius: "50%", border: "1px dashed var(--control-border)", background: "transparent", color: "var(--accent-text)", fontSize: 13, fontWeight: 700, fontFamily: "var(--font-sans)", cursor: "pointer", flexShrink: 0 },
  emojiPick: { fontSize: 24, border: "none", cursor: "pointer", padding: "6px", borderRadius: 12, width: 44, height: 44 },

  calcPreview: { background: "var(--success-bg)", borderRadius: 12, padding: "12px 16px", border: "1.5px solid var(--success-border)" },
  calcLabel: { fontSize: 14, color: "var(--text-primary)", margin: "2px 0", fontWeight: 400 },

  primaryBtn: { width: "100%", background: "var(--text-primary)", color: "var(--bg-primary)", border: "none", borderRadius: 12, padding: "15px", fontSize: 16, fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-sans)", marginTop: 4 },
  ghostBtn: { width: "100%", background: "transparent", color: "var(--text-secondary)", border: "1.5px solid var(--control-border)", borderRadius: 12, padding: "14px", fontSize: 16, fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-sans)" },

  deleteWarning: { background: "var(--danger-bg)", borderRadius: 16, padding: "20px", textAlign: "center" },
  deleteIcon: { fontSize: 36, margin: "0 0 10px" },
  deleteTitle: { fontSize: 16, fontWeight: 700, color: "var(--danger)", margin: "0 0 8px", letterSpacing: -0.1 },
  deleteSub: { fontSize: 14, color: "var(--danger)", margin: 0, fontWeight: 400, lineHeight: 1.5 },

  // BOTTOM NAV
  bottomNav: { position: "absolute", bottom: 0, left: 0, right: 0, minHeight: "calc(78px + env(safe-area-inset-bottom))", boxSizing: "border-box", background: "var(--card-bg)", borderTop: "1px solid var(--border-color)", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 24px env(safe-area-inset-bottom)" },
  navItem: { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", cursor: "pointer", padding: 0 },
  navPill: { display: "inline-flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3, width: 88, padding: "8px 0", borderRadius: 16, position: "relative", zIndex: 1 },
  // Sits ON the grid rather than above it: its right edge is the 24px gutter,
  // the same line every amount in the ledger ends on. It was at 20 -- the only
  // element on the screen off the gutter, and 4px off is exactly the kind of
  // near-miss that reads as a mistake.
  //
  // The fill is not a special colour: it is the same `--text-primary` on
  // `--bg-primary` as every primary button in the app, so the action looks
  // like an action rather than like a floating ornament. What was making it
  // shout was the shadow -- 24px at 28% on a screen whose cards had just been
  // reduced to rules -- and the size.
  /**
   * THE FLOATING LAYER, measured from the bottom bar up.
   *
   *   0    the bar itself, 78px plus the gesture inset
   *   90   the Sale button, 12px of clearance above it, 46px tall
   *   148  anything above the button: the toast, and the install card on a
   *        screen that has a button
   *
   * Everything here also sits on the 24px screen gutter, so a toast lines up
   * with the card it is reporting on rather than 8px outside it.
   */
  fab: { position: "absolute", right: 24, bottom: "calc(90px + env(safe-area-inset-bottom))", zIndex: 90, display: "inline-flex", alignItems: "center", gap: 8, padding: "0 18px 0 15px", height: 46, borderRadius: 99, border: "none", cursor: "pointer", background: "var(--text-primary)", color: "var(--bg-primary)", boxShadow: "var(--shadow-raised)" },
  fabLabel: { fontSize: 14, fontWeight: 600, letterSpacing: -0.1 },
  navLabel: { fontSize: 11, color: "var(--text-secondary)", fontWeight: 500, letterSpacing: 0.2 },

  numKey: { width: 64, height: 64, borderRadius: "50%", border: "1.5px solid var(--border-color)", background: "var(--card-bg)", fontSize: 24, fontWeight: 700, color: "var(--text-primary)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" },

  // TIMELINE
  timeline: { display: "flex", flexDirection: "column", gap: 24, paddingLeft: 12, marginTop: 10 },
  updateItem: { display: "flex", gap: 20, position: "relative" },
  timelineLine: { position: "absolute", left: 6, top: 0, bottom: -24, width: 2, background: "var(--border-color)", zIndex: 0 },
  timelineDot: { width: 14, height: 14, borderRadius: "50%", border: "3px solid var(--bg-primary)", position: "relative", zIndex: 1, marginTop: 18, marginLeft: -0.5 },
};
