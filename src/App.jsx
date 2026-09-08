import { useState, useEffect, useRef } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { Home, BarChart2, Settings, Store, Package, Coins, AlertTriangle, ArrowLeft, Trash2, Award, DollarSign, Upload, Cloud, Smartphone, ChevronRight, Download, Share, PlusSquare, X, Lock, Moon, Sun, Shield, TrendingUp, Info, Sparkles, CheckCircle2, RefreshCw, ScrollText } from "lucide-react";
import { useStore, selectBusinesses, selectInventory, readSnapshot, STORAGE_KEY } from "./store/useStore";
import { formatMoney, toMinor, toMajor, marginPercent, CURRENCIES } from "./domain/money.js";
import { calcBizStats, calcPortfolioStats, saleRevenue, saleCost, saleProfit, saleDiscount, getStatus } from "./domain/stats.js";
import { deriveInventory, hasStockDiscrepancy } from "./domain/inventory.js";
import { parseBackup, migrateState, verifyMigration } from "./domain/migrate.js";
import { isBackendConfigured } from "./backend/supabase.js";
import { useAuth } from "./backend/useAuth.js";
import { useSync } from "./backend/useSync.js";
import { useClaim } from "./backend/useClaim.js";
import { signOut, deleteAccount } from "./backend/auth.js";
import AuthScreen from "./screens/AuthScreen.jsx";
import LegalScreen from "./screens/LegalScreen.jsx";
import ClaimScreen from "./screens/ClaimScreen.jsx";
import { DOCUMENTS } from "./legal/documents.js";
import { track, startAnalytics, setAppVersion, getConsent, setConsent, flush as flushAnalytics } from "./analytics/analytics.js";
import { installErrorCapture } from "./analytics/errors.js";
import { useRegisterSW } from "virtual:pwa-register/react";
import { requestNotificationPermission, sendLowStockNotification } from "./utils/notificationService";
import { buildBackup, saveBackupFile, pickBackupFile } from "./utils/transfer.js";
import { summarizeLocal } from "./backend/claim.js";
/* ─── INITIAL DATA ─────────────────────────────────────────────────────────── */
const COLORS = ["#C17F5A","#8B6914","#7A9B76","#B85C5C","#5C7A8B","#9B5C8B","#5C8B6E","#8B7A5C"];
const COLOR_NAMES = ["Terracotta","Gold","Sage","Rose","Slate","Plum","Mint","Sand"];
const CATEGORIES = ["Crochet","Jewelry","Beauty","Food","Fashion","Thrift","Accessories","Other"];

const EMOJIS = ["🧶","📿","🌿","👗","💍","🎀","🛍️","🧴","🍱","👜","🌸","✨","🪡","🧁","💄"];
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
  profitable: { bg: "#E8F5E3", text: "#3A7D2C", label: "Profitable" },
  "break-even": { bg: "#FFF8E1", text: "#8B6914", label: "Break Even" },
  losing: { bg: "#FDECEA", text: "#C0392B", label: "Losing" },
};

const dateLabel = (occurredAt) => {
  const d = String(occurredAt || "").slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (d === today) return "Today";
  if (d === yesterday) return "Yesterday";
  return d;
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
const downloadSnapshot = () => {
  const snapshot = readSnapshot();
  if (!snapshot) {
    alert("No pre-upgrade backup was found on this device.");
    return false;
  }
  downloadJson(snapshot, `BizTrack_PreUpgrade_Backup_${String(snapshot.savedAt).slice(0, 10)}.json`);
  return true;
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

const sendResetEmail = async (email, name, code) => {
  const recipient = String(email || "").trim();
  if (!recipient || !validateEmail(recipient)) {
    console.error("[BizTrack] Invalid recipient email:", recipient);
    alert("Verification failed: The email address stored in your profile is invalid or missing.");
    return false;
  }

  if (EMAILJS_CONFIG.PUBLIC_KEY === "YOUR_PUBLIC_KEY" || !EMAILJS_CONFIG.PUBLIC_KEY) {
    console.warn("EmailJS not configured. Simulating email send...");
    alert("SIMULATION: Reset code " + code + " sent to " + recipient);
    return true; 
  }
  
  if (!window.emailjs) {
    alert("Email recovery needs an internet connection. Use your 8-character Recovery Key instead.");
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
      alert("Verification email sent! Please check your inbox (and Spam folder).");
      return true;
    }
    return false;
  } catch (err) {
    console.error("EmailJS Error:", err);
    // Handle the specific 'recipients address empty' error more gracefully
    const errMsg = err.text || err.message || "Unknown error";
    if (errMsg.toLowerCase().includes("recipient")) {
       alert("Email Delivery Failed: The stored email address is not being recognized by our service. Please use your 8-digit Recovery Key to unlock your account.");
    } else {
       alert(`Email failed: ${errMsg}`);
    }
    return false;
  }
};

/* ─── ROOT ─────────────────────────────────────────────────────────────────── */

/* ─── INSTALL PROMPT ────────────────────────────────────────────────────────── */
function InstallPrompt({ deferredPrompt, setDeferredPrompt }) {
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
    <div style={{ position: "absolute", bottom: 85, left: 16, right: 16, background: "var(--card-bg)", borderRadius: 16, padding: "14px 16px", boxShadow: "0 8px 30px rgba(44,24,16,0.15)", border: "1px solid var(--border-color)", zIndex: 100, display: "flex", gap: 12, alignItems: "flex-start" }}>
      <button onClick={() => setDismissed(true)} style={{ position: "absolute", top: 8, right: 8, background: "none", border: "none", color: "var(--text-secondary)", cursor: "pointer", padding: 4 }}>
        <X size={16} />
      </button>
      <div style={{ background: "#F5F0EA", borderRadius: 12, padding: 10, flexShrink: 0, color: "#8B6914" }}>
        <Download size={24} />
      </div>
      <div style={{ flex: 1, paddingRight: 16 }}>
        <p style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 4px" }}>Install BizTrack</p>
        {isIOS ? (
          <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: 0, lineHeight: 1.4 }}>
            Must use <strong>Safari</strong> to install: Tap <Share size={12} style={{ display: "inline", verticalAlign: "middle" }} /> then <strong>Add to Home Screen</strong> <PlusSquare size={12} style={{ display: "inline", verticalAlign: "middle" }} />
          </p>
        ) : (
          <>
            <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "0 0 8px", lineHeight: 1.4 }}>
              Add to your home screen for offline access and a native app feel.
            </p>
            <button onClick={handleInstallClick} style={{ background: "var(--text-primary)", color: "var(--bg-primary)", border: "none", padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
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

function useRescueData(hydrated) {
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
            if (manual) alert(`Data found and restored: ${count} business${count === 1 ? "" : "es"}.`);
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
            if (manual) alert("No backup found in IndexedDB.");
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
                    if (manual) alert(`Data found and restored from IndexedDB: ${count} business${count === 1 ? "" : "es"}.`);
                    setIsRescuing(false);
                    resolve(true);
                  }
                } catch { /* not valid JSON, skip */ }
              }
            };
          });
          
          transaction.oncomplete = () => {
            if (!found) {
               if (manual) alert("No recoverable data found.");
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
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      console.log('SW Registered: ' + r)
    },
    onRegisterError(error) {
      console.log('SW registration error', error)
    },
  });

  const hydrated = true; // Since we are on LS, it's always technically hydrated after first tick
  const { isRescuing, checkRescue } = useRescueData(hydrated);

  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [updateProgress, setUpdateProgress] = useState(0);
  const [isUpdating, setIsUpdating] = useState(false);

  // Session lives in React, not the persisted store: supabase-js already owns
  // session storage and refresh, and duplicating it is how you end up showing
  // someone as signed in against a token that expired days ago.
  const auth = useAuth();
  const [analyticsConsent, setAnalyticsConsentState] = useState(() => getConsent());
  const claim = useClaim(auth.userId);
  // Held until the user has said what should happen to books already on this
  // device. Pushing first and asking afterwards would make the question moot.
  const sync = useSync(auth.userId, { paused: claim.needed || claim.checking });

  useEffect(() => {
    setAppVersion(VERSION);
    startAnalytics();
    installErrorCapture();
  }, []);

  // Chosen explicitly by the user on the sign-in screen; not persisted, so the
  // choice is re-offered next launch rather than silently stranding them local.
  const [skippedAuth, setSkippedAuth] = useState(false);
  
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
          if (manual && reg.waiting) {
            setUpdateProgress(100);
            setTimeout(() => {
              setUpdateProgress(0);
              setNeedRefresh(true);
            }, 500);
            return;
          }

          if (manual) {
            setUpdateProgress(40);
            await new Promise(r => setTimeout(r, 600)); // Visual buffer
            setUpdateProgress(70);
          }
          
          await reg.update();
          
          if (manual) {
            setUpdateProgress(100);
            setTimeout(() => {
              setUpdateProgress(0);
              if (!reg.waiting && !reg.installing) {
                showToast("App is up to date!");
              } else if (reg.waiting) {
                setNeedRefresh(true);
              }
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
  const [activeBizId, setActiveBizId] = useState(null);
  const [bizTab, setBizTab] = useState("overview");
  const [modal, setModal] = useState(null); // null | "addBiz" | "addItem" | "restock" | "addSale" | "editBiz" | "deleteBiz" | "toast"
  const [restockItemId, setRestockItemId] = useState(null);
  const [activeToast, setActiveToast] = useState(null);
  const toastTimer = useRef(null);
  
  const showToast = (msg) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setActiveToast(msg);
    toastTimer.current = setTimeout(() => {
      setActiveToast(null);
      toastTimer.current = null;
    }, 1500);
  };

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

  const activeBiz = businesses.find((b) => b.id === activeBizId) || null;

  const openBiz = (id) => { setActiveBizId(id); setBizTab("overview"); setScreen("business"); };

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

  const deleteInventoryItem = (bizId, itemId) => {
    storeDeleteItem(bizId, itemId);
    track("item.delete");
    showToast("Item removed.");
  };

  const addSale = (bizId, sale) => {
    const { item } = storeRecordSale(bizId, sale);
    // `kind` separates inventoried sales from one-off custom work, which is
    // the split worth knowing. Neither carries what was sold or for how much.
    track("sale.record", { kind: sale?.isCustom ? "custom" : "item" });
    showToast("Sale recorded!");

    if (!item) return;
    if (hasStockDiscrepancy(item)) {
      // The sale is kept -- it happened. Surface the mismatch to reconcile.
      track("stock.oversold");
      showToast(`${item.name} is oversold by ${Math.abs(item.qty)}. Check your stock.`);
      return;
    }
    if (item.qty > 0 && item.qty <= lowStockThreshold) {
      const biz = businesses.find((b) => b.id === bizId);
      sendLowStockNotification(item.name, item.qty, biz?.name || "your business");
    }
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

  const startSignIn = () => setSkippedAuth(false);

  const ctx = { businesses, analyticsConsent, chooseAnalytics, startSignIn, replaceBusinesses, migrationIssues, auth, sync, signOutOfAccount, screen, setScreen, activeBiz, activeBizId, openBiz, bizTab, setBizTab, modal, setModal, showToast, addBusiness, deleteBusiness, addInventoryItem, restockInventoryItem, restockItemId, setRestockItemId, deleteInventoryItem, addSale, currency, setCurrency, isDarkMode, setIsDarkMode, lowStockThreshold, setLowStockThreshold, userName, setUserName, onboardingComplete, setOnboardingComplete, hasSeenGuide, setHasSeenGuide, isPinEnabled, hashedPin, setHashedPin, hashedRecoveryKey, setHashedRecoveryKey, loginAttempts, setLoginAttempts, lockoutUntil, setLockoutUntil, userEmail, setUserEmail, userAvatar, setUserAvatar, setIsPinEnabled, checkUpdates, updateProgress, checkRescue, isRescuing };

    const [isUnlocked, setIsUnlocked] = useState(false);

  // Safe to early-return from here on: every hook above has already run.
  if (isStateCorrupt || migrationFailed) {
    return (
      <div style={{ ...S.shell, background: "#2C1810", color: "#FAF8F4" }}>
        <div style={{ ...S.phone, background: "#2C1810", justifyContent: "center", alignItems: "center", padding: 40, textAlign: "center" }}>
          <AlertTriangle size={48} color="#F0C040" style={{ marginBottom: 20 }} />
          <h2 style={{ ...S.userName, color: "#FAF8F4", marginBottom: 8 }}>We couldn't open your records</h2>
          <p style={{ ...S.greeting, color: "rgba(255,255,255,0.7)", marginBottom: 8 }}>
            <strong>Nothing has been deleted.</strong> Your data is still on this device.
          </p>
          <p style={{ ...S.greeting, color: "rgba(255,255,255,0.5)", fontSize: 12, marginBottom: 32 }}>
            Download a copy first, then try a rescue scan. Please don't clear the app or reinstall it.
          </p>
          <button style={{ ...S.primaryBtn, background: "#FAF8F4", color: "#2C1810" }} onClick={downloadSnapshot}>
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
    return <div style={{ ...S.shell, background: "#2C1810" }} />;
  }

  if (isBackendConfigured && !auth.session && !skippedAuth) {
    return (
      <AuthScreen
        styles={S}
        hasLocalData={businesses.length > 0}
        onSkip={() => setSkippedAuth(true)}
      />
    );
  }

  if (claim.needed) {
    return (
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

  if (!onboardingComplete) return <Onboarding ctx={ctx} deferredPrompt={deferredPrompt} setDeferredPrompt={setDeferredPrompt} />;
  if (isPinEnabled && !isUnlocked) return <PinLock ctx={ctx} onUnlock={() => setIsUnlocked(true)} />;

  // Analytics consent. Nothing is collected until this is answered, so the
  // prompt is a gate on collection rather than a notice about it.
  if (isBackendConfigured && analyticsConsent === null) {
    return (
      <div style={{ ...S.shell, background: "#2C1810", color: "#FAF8F4" }}>
        <div style={{ ...S.phone, background: "#2C1810", justifyContent: "center", padding: 32 }}>
          <div style={{ background: "rgba(255,255,255,0.08)", width: 62, height: 62, borderRadius: 18, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20 }}>
            <TrendingUp size={30} color="#FAF8F4" />
          </div>
          <h1 style={{ ...S.userName, color: "#FAF8F4", fontSize: 24, marginBottom: 10 }}>
            Help us fix what breaks
          </h1>
          <p style={{ fontSize: 14, lineHeight: 1.65, color: "rgba(255,255,255,0.75)", margin: "0 0 14px" }}>
            BizTrack is in beta. If you allow it, the app will tell us which screens you
            open, which features you use, and when something crashes — so we fix the
            right things.
          </p>
          <p style={{ fontSize: 13, lineHeight: 1.6, color: "rgba(255,255,255,0.55)", margin: "0 0 6px" }}>
            <strong style={{ color: "rgba(255,255,255,0.8)" }}>We never send your business data.</strong> No item
            names, no prices, no sales figures, no customer details. Only which parts of
            the app were used.
          </p>
          <p style={{ fontSize: 13, lineHeight: 1.6, color: "rgba(255,255,255,0.55)", margin: "0 0 22px" }}>
            You can change this any time in Settings.
          </p>

          <button
            style={{ ...S.primaryBtn, background: "#FAF8F4", color: "#2C1810", marginTop: 0 }}
            onClick={() => chooseAnalytics(true)}
          >
            Allow
          </button>
          <button
            style={{ ...S.primaryBtn, background: "transparent", color: "#FAF8F4", border: "1px solid rgba(255,255,255,0.25)", marginTop: 10 }}
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

  return (
    <div style={S.shell}>
      <div style={S.phone}>
        <div style={S.screenWrap}>
          {screen === "home" && <HomeScreen ctx={ctx} />}
          {screen === "business" && activeBiz && <BusinessScreen ctx={ctx} />}
          {screen === "settings" && <SettingsScreen ctx={ctx} />}
          {screen === "analytics" && <AnalyticsScreen ctx={ctx} />}
          {screen === "account" && <AccountScreen ctx={ctx} />}
          {screen === "about" && <AboutScreen ctx={ctx} />}
          {screen === "privacy" && <LegalScreen styles={S} doc={DOCUMENTS.privacy} onBack={() => setScreen("settings")} />}
          {screen === "terms" && <LegalScreen styles={S} doc={DOCUMENTS.terms} onBack={() => setScreen("settings")} />}
        </div>
        <InstallPrompt deferredPrompt={deferredPrompt} setDeferredPrompt={setDeferredPrompt} />
        <BottomNav ctx={ctx} />
        {onboardingComplete && !hasSeenGuide && <FeatureGuide ctx={ctx} />}

        {/* MODALS */}
        {modal === "addBiz" && <AddBizModal ctx={ctx} />}
        {modal === "addItem" && <AddItemModal ctx={ctx} />}
        {modal === "restock" && <RestockModal ctx={ctx} />}
        {modal === "addSale" && <AddSaleModal ctx={ctx} />}
        {modal === "pin-setup" && <PinSetupModal ctx={ctx} />}
        {modal === "delete-biz" && <DeleteBizModal ctx={ctx} />}
        {/* INDEPENDENT TOAST */}
        {activeToast && <Toast msg={activeToast} onDismiss={() => setActiveToast(null)} />}

        {/* PWA UPDATE MODAL */}
        {(needRefresh || isUpdating) && (
          <div style={S.modalOverlay}>
             <div style={{ ...S.modalSheet, padding: 32, textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center" }}>
                <div style={{ background: "rgba(193,127,90,0.1)", width: 64, height: 64, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20 }}>
                   <RefreshCw size={32} color="var(--accent-color)" className={isUpdating ? "spin" : ""} />
                </div>
                <h2 style={S.modalTitle}>{isUpdating ? "Installing Update..." : "Update Available"}</h2>
                <p style={{ ...S.greeting, color: "var(--text-secondary)", fontSize: 14, marginBottom: 24, lineHeight: 1.5 }}>
                   {isUpdating ? "Downloading and applying the latest changes. This will only take a moment." : "A new version of BizTrack is ready with improvements and new features. Update now to stay current?"}
                </p>

                {isUpdating ? (
                   <div style={{ width: "100%", height: 8, background: "var(--border-color)", borderRadius: 99, overflow: "hidden", marginBottom: 12 }}>
                      <div style={{ height: "100%", width: `${updateProgress}%`, background: "var(--accent-color)", transition: "width 0.3s ease" }} />
                   </div>
                ) : (
                  <div style={{ display: "flex", gap: 12, width: "100%" }}>
                     <button 
                       style={{ ...S.ghostBtn, flex: 1 }} 
                       onClick={() => setNeedRefresh(false)}
                     >Later</button>
                     <button 
                       style={{ ...S.primaryBtn, flex: 2, marginTop: 0 }} 
                       onClick={() => {
                         setIsUpdating(true);
                         setUpdateProgress(10);
                         // Simulate installation progress before reload
                         let p = 10;
                         const interval = setInterval(() => {
                           p += 15;
                           if (p >= 95) {
                             clearInterval(interval);
                             updateServiceWorker(true);
                           } else {
                             setUpdateProgress(p);
                           }
                         }, 150);
                       }}
                     >Update Now</button>
                  </div>
                )}
             </div>
          </div>
        )}
      </div>
    </div>
  );
}


/* ─── HOME SCREEN ───────────────────────────────────────────────────────────── */
function HomeScreen({ ctx }) {
  const { businesses, openBiz, setModal, lowStockThreshold, userName, setScreen, userAvatar, migrationIssues } = ctx;
  const totals = calcPortfolioStats(businesses);
  const allLowStock = businesses.flatMap((b) =>
    deriveInventory(b)
      .filter((i) => !i.deletedAt && i.qty <= lowStockThreshold)
      .map((i) => ({ ...i, bizName: b.name, bizColor: b.color }))
  );
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <div style={S.screen}>
      <div style={S.homeHeader}>
        <div>
          <p style={S.greeting}>{greeting}, {userName}</p>
          <h1 style={S.userName}>Your Businesses</h1>
        </div>
        <div style={{ ...S.avatar, cursor: "pointer" }} onClick={() => setScreen("account")}>{userAvatar?.startsWith('/') ? <img src={userAvatar} style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover" }} /> : (userAvatar || (userName || "B")[0])}</div>
      </div>

      {/* SUMMARY CARD */}
      <div id="home-summary" style={S.summaryCard}>
        <div style={S.summaryOrb} />
        <p style={S.summaryLabel}>Total Profit This Month</p>
        <h2 style={S.summaryAmount}>{fmt(totals.profit)}</h2>
        <div style={S.summaryRow}>
          <div>
            <p style={S.summarySubLabel}>Revenue</p>
            <p style={S.summarySubVal}>{fmt(totals.revenue)}</p>
          </div>
          <div style={S.summaryDivider} />
          <div>
            <p style={S.summarySubLabel}>Businesses</p>
            <p style={S.summarySubVal}>{businesses.length} active</p>
          </div>
          <div style={S.summaryDivider} />
          <div>
            <p style={S.summarySubLabel}>Margin</p>
            <p style={S.summarySubVal}>{totals.margin}%</p>
          </div>
        </div>
      </div>

      {/* The upgrade completed but the numbers didn't reconcile. Say so plainly
          and put the untouched original one tap away. */}
      {migrationIssues?.length > 0 && (
        <div style={{ ...S.alertBanner, background: "#FDECEA", border: "1px solid #C0392B" }}>
          <AlertTriangle style={S.alertIcon} size={18} color="#C0392B" />
          <div style={{ flex: 1 }}>
            <p style={{ ...S.alertTitle, color: "#C0392B" }}>Please check your numbers</p>
            <p style={S.alertSub}>
              Some totals changed during the last app update. Nothing was deleted, and a copy of
              your original data is saved on this device.
            </p>
            <button
              style={{ ...S.textBtn, color: "#C0392B", marginTop: 8 }}
              onClick={downloadSnapshot}
            >Download original data</button>
          </div>
        </div>
      )}

      {/* LOW STOCK BANNER */}
      {allLowStock.length > 0 && (
        <div style={S.alertBanner}>
          <AlertTriangle style={S.alertIcon} size={18} color="#8B6914" />
          <div>
            <p style={S.alertTitle}>Low Stock on {allLowStock.length} item{allLowStock.length > 1 ? "s" : ""}</p>
            <p style={S.alertSub}>{allLowStock.map((i) => i.name).join(", ")}</p>
          </div>
        </div>
      )}

      {/* BUSINESSES */}
      <div style={S.sectionRow}>
        <p style={S.sectionLabel}>My Businesses</p>
        <button id="add-biz-btn" style={S.textBtn} onClick={() => setModal("addBiz")}>+ Add New</button>
      </div>

      <div style={S.cardList}>
        {businesses.length === 0 && (
          <div style={S.emptyState}>
            <div style={S.emptyIcon}><Store size={40} color="var(--text-primary)" strokeWidth={1.5} /></div>
            <p style={S.emptyTitle}>No businesses yet</p>
            <p style={S.emptySub}>Tap "+ Add New" to get started</p>
          </div>
        )}
        {businesses.map((biz) => {
          const stats = calcBizStats(biz);
          const ss = STATUS_STYLE[getStatus(stats.margin)];
          return (
            <div key={biz.id} style={{ ...S.bizCard, borderLeftColor: biz.color }} onClick={() => openBiz(biz.id)}>
              <div style={S.bizCardLeft}>
                <div style={{ ...S.bizEmoji, background: biz.color + "22" }}>{biz.emoji}</div>
                <div>
                  <p style={S.bizName}>{biz.name}</p>
                  <p style={S.bizCat}>{biz.category} · {biz.items.filter((i) => !i.deletedAt).length} items</p>
                </div>
              </div>
              <div style={S.bizCardRight}>
                <p style={S.bizProfit}>{fmt(stats.profit, biz.currency)}</p>
                <span style={{ ...S.badge, background: ss.bg, color: ss.text }}>{ss.label}</span>
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ height: 40 }} />
      <p style={{ textAlign: "center", fontSize: 10, color: "var(--text-secondary)", opacity: 0.5 }}>BizTrack {VERSION} • Build {BUILD_DATE}</p>
    </div>
  );
}

/* ─── BUSINESS SCREEN ───────────────────────────────────────────────────────── */
function BusinessScreen({ ctx }) {
  const { activeBiz, bizTab, setBizTab, setScreen, setModal, deleteInventoryItem, lowStockThreshold, setRestockItemId } = ctx;
  const stats = calcBizStats(activeBiz);
  // Quantity and average cost are folded from the stock ledger on read.
  const inventory = deriveInventory(activeBiz).filter((i) => !i.deletedAt);

  return (
    <div style={S.screen}>
      <div style={S.bizHeader}>
        <button style={S.backBtn} onClick={() => setScreen("home")}><ArrowLeft size={22} /></button>
        <div style={S.bizHeaderCenter}>
          <span style={{ fontSize: 18 }}>{activeBiz.emoji}</span>
          <span style={S.bizHeaderName}>{activeBiz.name}</span>
        </div>
        <button style={S.iconBtn} onClick={() => setModal("delete-biz")}><Trash2 size={20} color="var(--text-primary)" /></button>
      </div>

      {/* HERO */}
      <div style={{ ...S.bizHero, background: activeBiz.color }}>
        <div style={S.heroOrb} />
        <div style={S.heroRow}>
          <div>
            <p style={S.heroLabel}>Revenue</p>
            <p style={S.heroVal}>{fmt(stats.revenue, activeBiz.currency)}</p>
          </div>
          <div>
            <p style={S.heroLabel}>Profit</p>
            <p style={S.heroVal}>{fmt(stats.profit, activeBiz.currency)}</p>
          </div>
          <div>
            <p style={S.heroLabel}>Margin</p>
            <p style={S.heroVal}>{stats.margin}%</p>
          </div>
        </div>
        <div style={S.progBg}>
          <div style={{ ...S.progFill, width: Math.min(100, Number(stats.margin)) + "%" }} />
        </div>
        <p style={S.heroSub}>{stats.margin}% of revenue kept as profit</p>
      </div>

      {/* TABS */}
      <div style={S.tabs}>
        {["overview","inventory","sales"].map((t) => (
          <button key={t} style={{ ...S.tab, ...(bizTab === t ? S.tabActive : {}) }} onClick={() => setBizTab(t)}>
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      <div style={S.tabContent}>
        {bizTab === "overview" && <OverviewTab biz={activeBiz} stats={stats} lowStockThreshold={lowStockThreshold} inventory={inventory} />}
        {bizTab === "inventory" && <InventoryTab biz={activeBiz} setModal={setModal} deleteInventoryItem={deleteInventoryItem} setRestockItemId={setRestockItemId} lowStockThreshold={lowStockThreshold} inventory={inventory} />}
        {bizTab === "sales" && <SalesTab biz={activeBiz} setModal={setModal} />}
      </div>
    </div>
  );
}

function OverviewTab({ biz, stats, lowStockThreshold, inventory }) {
  const cur = biz.currency;
  const best = [...inventory].sort((a, b) => b.sold - a.sold)[0];
  const lowStock = inventory.filter((i) => i.qty > 0 && i.qty <= lowStockThreshold);
  const oversold = inventory.filter(hasStockDiscrepancy);
  const recentSales = biz.sales.slice(0, 3);
  return (
    <div style={S.tabInner}>
      {oversold.length > 0 && (
        <div style={{ ...S.infoCard, borderLeftColor: "#C0392B" }}>
          <p style={{...S.infoLabel, display:"flex", alignItems:"center", gap:6, color:"#C0392B"}}><AlertTriangle size={14} color="#C0392B"/> Stock Discrepancy</p>
          {oversold.map((i) => (
            <p key={i.id} style={S.infoSub}>{i.name} — {Math.abs(i.qty)} more sold than recorded as bought. Restock to correct.</p>
          ))}
        </div>
      )}
      {best && best.sold > 0 && (
        <div style={S.infoCard}>
          <p style={{...S.infoLabel, display:"flex", alignItems:"center", gap:6}}><Award size={14} color="#8B6914"/> Best Seller</p>
          <p style={S.infoVal}>{best.name}</p>
          <p style={S.infoSub}>{best.sold} units sold · {fmt(best.unitPrice, cur)} each · {itemEconomics(best).margin}% margin</p>
        </div>
      )}
      {lowStock.length > 0 && (
        <div style={{ ...S.infoCard, borderLeftColor: "#E67E22" }}>
          <p style={{...S.infoLabel, display:"flex", alignItems:"center", gap:6}}><AlertTriangle size={14} color="#E67E22"/> Low Stock</p>
          {lowStock.map((i) => (
            <p key={i.id} style={S.infoSub}>{i.name} — only {i.qty} left</p>
          ))}
        </div>
      )}
      <div style={S.statsGrid}>
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
          <p style={{ ...S.statVal, fontSize: 13 }}>{fmt(stats.revenue, cur)}</p>
        </div>
        <div style={S.statCard}>
          <p style={S.statLbl}>COGS</p>
          <p style={{ ...S.statVal, fontSize: 13 }}>{fmt(stats.cogs, cur)}</p>
        </div>
      </div>
      {recentSales.length > 0 && (
        <>
          <p style={S.sectionLabel}>Recent Sales</p>
          {recentSales.map((sale) => (
            <div key={sale.id} style={S.saleRow}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <p style={S.saleName}>{sale.itemName}</p>
                  {sale.isCustom && <span style={{ fontSize: 9, fontWeight: 800, color: "#8B6914", background: "#F5F0EA", padding: "1px 5px", borderRadius: 4, textTransform: "uppercase" }}>Custom ✨</span>}
                </div>
                <p style={S.saleSub}>{sale.qty} {sale.qty > 1 ? "units" : "unit"} · {dateLabel(sale.occurredAt)}</p>
              </div>
              <div style={{ textAlign: "right" }}>
                <p style={S.saleRev}>{fmt(saleRevenue(sale), cur)}</p>
                <p style={S.salePft}>+{fmt(saleProfit(sale), cur)}</p>
              </div>
            </div>
          ))}
        </>
      )}
      <div style={{ height: 8 }} />
    </div>
  );
}

function InventoryTab({ biz, setModal, deleteInventoryItem, setRestockItemId, lowStockThreshold, inventory }) {
  const cur = biz.currency;
  return (
    <div style={S.tabInner}>
      <button style={S.dashedBtn} onClick={() => setModal("addItem")}>+ Add New Item</button>
      {inventory.length === 0 && (
        <div style={S.emptyState}>
          <div style={S.emptyIcon}><Package size={40} color="#2C1810" strokeWidth={1.5} /></div>
          <p style={S.emptyTitle}>No items yet</p>
          <p style={S.emptySub}>Add your first product above</p>
        </div>
      )}
      {inventory.map((item) => {
        const { profit, margin } = itemEconomics(item);
        return (
          <div key={item.id} style={S.invRow}>
            <div style={{ flex: 1 }}>
              <div style={S.invNameRow}>
                <p style={S.invName}>{item.name}</p>
                {hasStockDiscrepancy(item)
                  ? <span style={{ ...S.lowBadge, background: "#C0392B", color: "#FFF" }}>Oversold</span>
                  : item.qty <= lowStockThreshold && <span style={S.lowBadge}>Low</span>}
              </div>
              {/* Average cost across every batch bought, not just the latest price. */}
              <p style={S.invSub}>Avg cost: {fmt(item.avgCost, cur)} · Asking: {fmt(item.unitPrice, cur)}</p>
              <p style={S.invSub}>{item.qty} in stock · {item.sold} sold</p>
              <button
                style={S.restockBtn}
                onClick={() => { setRestockItemId(item.id); setModal("restock"); }}
              >+ Restock</button>
            </div>
            <div style={{ alignItems: "flex-end", display: "flex", flexDirection: "column", gap: 6 }}>
              <p style={S.invProfit}>+{fmt(profit, cur)}/unit</p>
              <span style={S.marginBadge}>{margin}%</span>
              <button
                style={S.deleteBtn}
                onClick={() => {
                  if (confirm(`Remove "${item.name}" from inventory? Its sales history is kept.`)) {
                    deleteInventoryItem(biz.id, item.id);
                  }
                }}
              >✕</button>
            </div>
          </div>
        );
      })}
      <div style={{ height: 8 }} />
    </div>
  );
}

function SalesTab({ biz, setModal }) {
  const cur = biz.currency;
  const stats = calcBizStats(biz);
  return (
    <div style={S.tabInner}>
      <button style={S.dashedBtn} onClick={() => setModal("addSale")}>+ Record New Sale</button>
      {biz.sales.length > 0 && (
        <div style={{ ...S.infoCard, background: "#F0FAF0" }}>
          <p style={S.infoLabel}>All Time</p>
          <p style={S.infoSub}>Revenue: {fmt(stats.revenue, cur)} · Profit: {fmt(stats.profit, cur)}</p>
        </div>
      )}
      {biz.sales.length === 0 && (
        <div style={S.emptyState}>
          <div style={S.emptyIcon}><Coins size={40} color="#2C1810" strokeWidth={1.5} /></div>
          <p style={S.emptyTitle}>No sales yet</p>
          <p style={S.emptySub}>Record your first sale above</p>
        </div>
      )}
      {biz.sales.map((sale) => (
        <div key={sale.id} style={S.saleRow}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <p style={S.saleName}>{sale.itemName}</p>
              {sale.isCustom && <span style={{ fontSize: 9, fontWeight: 800, color: "#8B6914", background: "#F5F0EA", padding: "1px 5px", borderRadius: 4, textTransform: "uppercase" }}>Custom ✨</span>}
            </div>
            <p style={S.saleSub}>{sale.qty} {sale.qty > 1 ? "units" : "unit"} · {dateLabel(sale.occurredAt)}{sale.note ? ` · ${sale.note}` : ""}</p>
          </div>
          <div style={{ textAlign: "right" }}>
            <p style={S.saleRev}>{fmt(saleRevenue(sale), cur)}</p>
            <p style={S.salePft}>+{fmt(saleProfit(sale), cur)}</p>
          </div>
        </div>
      ))}
      <div style={{ height: 8 }} />
    </div>
  );
}

/* ─── ANALYTICS SCREEN ──────────────────────────────────────────────────────── */
function AnalyticsScreen({ ctx }) {
  const { businesses, setScreen } = ctx;
  const sorted = [...businesses].map((b) => ({ ...b, stats: calcBizStats(b) })).sort((a, b) => b.stats.profit - a.stats.profit);
  const totals = calcPortfolioStats(businesses);
  const maxProfit = Math.max(...sorted.map((b) => b.stats.profit), 1);

  const chartData = sorted.map((b) => ({
    name: b.name.split(" ")[0],
    profit: b.stats.profit,
    color: b.color
  }));

  return (
    <div style={S.screen}>
      <div style={S.pageHeader}>
        <button style={S.backBtn} onClick={() => setScreen("home")}><ArrowLeft size={22} /></button>
        <h2 style={S.pageTitle}>Analytics</h2>
        <div style={{ width: 32 }} />
      </div>

      <div style={S.tabInner}>
        {/* TOTALS */}
        <div style={S.summaryCard}>
          <div style={S.summaryOrb} />
          <p style={S.summaryLabel}>Total Revenue</p>
          <h2 style={S.summaryAmount}>{fmt(totals.revenue)}</h2>
          <div style={S.summaryRow}>
            <div>
              <p style={S.summarySubLabel}>Profit</p>
              <p style={S.summarySubVal}>{fmt(totals.profit)}</p>
            </div>
            <div style={S.summaryDivider} />
            <div>
              <p style={S.summarySubLabel}>Avg Margin</p>
              <p style={S.summarySubVal}>{totals.margin}%</p>
            </div>
          </div>
        </div>

        {/* CHART */}
        <p style={S.sectionLabel}>Profit Overview</p>
        <div style={{ ...S.infoCard, height: 200, padding: "20px 10px 10px -10px", marginBottom: 20 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#9B7B5E", fontFamily: "'DM Sans', sans-serif" }} tickLine={false} axisLine={false} />
              <YAxis tickFormatter={(val) => val >= 1000 ? (val / 1000) + 'k' : val} tick={{ fontSize: 10, fill: "#9B7B5E", fontFamily: "'DM Sans', sans-serif" }} tickLine={false} axisLine={false} width={40} />
              <Tooltip 
                cursor={{ fill: "rgba(44,24,16,0.04)" }} 
                contentStyle={{ borderRadius: 12, border: "none", boxShadow: "0 4px 16px rgba(44,24,16,0.1)", fontSize: 13, fontFamily: "'DM Sans', sans-serif", fontWeight: 700, color: "var(--text-primary)" }} 
                itemStyle={{ color: "var(--text-primary)" }} 
                formatter={(value) => [fmt(value), "Profit"]} 
              />
              <Bar dataKey="profit" radius={[8, 8, 0, 0]}>
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* PROFIT RANKING */}
        <p style={S.sectionLabel}>Profit by Business</p>
        {sorted.map((b, i) => (
          <div key={b.id} style={S.analyticsRow}>
            <div style={S.analyticsLeft}>
              <span style={S.rankNum}>#{i + 1}</span>
              <span style={{ fontSize: 18 }}>{b.emoji}</span>
              <div>
                <p style={S.bizName}>{b.name}</p>
                <p style={S.bizCat}>{b.stats.margin}% margin</p>
              </div>
            </div>
            <div style={{ flex: 1, padding: "0 12px" }}>
              <div style={S.barBg}>
                <div style={{ ...S.barFill, width: ((b.stats.profit / maxProfit) * 100) + "%", background: b.color }} />
              </div>
            </div>
            <p style={S.analyticsProfit}>{fmt(b.stats.profit)}</p>
          </div>
        ))}

        {/* BEST ITEMS ACROSS ALL */}
        <p style={S.sectionLabel}>Top Items (All Businesses)</p>
        {businesses
          .flatMap((b) => deriveInventory(b)
            .filter((i) => !i.deletedAt)
            .map((i) => ({ ...i, bizName: b.name, bizCurrency: b.currency, margin: itemEconomics(i).margin })))
          .sort((a, b) => b.sold - a.sold)
          .slice(0, 5)
          .map((item) => (
            <div key={item.id} style={S.invRow}>
              <div style={{ flex: 1 }}>
                <p style={S.invName}>{item.name}</p>
                <p style={S.invSub}>{item.bizName} · {item.sold} sold · {item.margin}% margin</p>
              </div>
              <p style={S.invProfit}>{fmt(item.unitPrice * item.sold, item.bizCurrency)}</p>
            </div>
          ))}
        <div style={{ height: 16 }} />
      </div>
    </div>
  );
}

/* ─── SETTINGS SCREEN ───────────────────────────────────────────────────────── */
function SettingsScreen({ ctx }) {
  const { setScreen, businesses, currency, setCurrency, lowStockThreshold, setLowStockThreshold, showToast, userName, userAvatar, isDarkMode, setIsDarkMode } = ctx;
  const currencies = CURRENCIES;

  return (
    <div style={S.screen}>
      <div style={S.pageHeader}>
        <button style={S.backBtn} onClick={() => setScreen("home")}>←</button>
        <h2 style={S.pageTitle}>Settings</h2>
        <div style={{ width: 32 }} />
      </div>

      <div style={S.tabInner}>
        
        {/* ACCOUNT LINK */}
        <div style={S.settingsSection}>
          <p style={S.settingsSectionTitle}>Account</p>
          <div style={S.settingsCard}>
            <div style={S.settingsRow} onClick={() => setScreen("account")}>
              <div style={{ ...S.avatar, width: 40, height: 40, fontSize: 16 }}>{userAvatar?.startsWith('/') ? <img src={userAvatar} style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover" }} /> : (userAvatar || (userName || "B")[0])}</div>
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
            <div style={S.settingsRow} onClick={() => setIsDarkMode(!isDarkMode)}>
              {isDarkMode ? <Moon size={20} color="var(--accent-color)" /> : <Sun size={20} color="var(--accent-color)" />}
              <div style={{ flex: 1 }}>
                <p style={S.settingsRowLabel}>Dark Mode</p>
                <p style={S.settingsRowSub}>{isDarkMode ? "Enabled" : "Disabled"}</p>
              </div>
              <div style={{ 
                width: 44, 
                height: 24, 
                borderRadius: 20, 
                background: isDarkMode ? "var(--accent-color)" : "#E0D6C8", 
                position: "relative",
                transition: "0.3s"
              }}>
                <div style={{ 
                  width: 18, 
                  height: 18, 
                  borderRadius: "50%", 
                  background: "var(--card-bg)", 
                  position: "absolute", 
                  top: 3, 
                  left: isDarkMode ? 23 : 3,
                  transition: "0.3s"
                }} />
              </div>
            </div>
          </div>
        </div>

        {/* PREFERENCES */}
        <div style={S.settingsSection}>
          <p style={S.settingsSectionTitle}>Preferences</p>
          <div style={S.settingsCard}>
            <div style={S.settingsRow}>
              <DollarSign size={20} color="#9B7B5E" />
              <div style={{ flex: 1 }}>
                <p style={S.settingsRowLabel}>Currency</p>
                <p style={S.settingsRowSub}>Applies to new businesses</p>
              </div>
              <select
                value={currency}
                onChange={(e) => { setCurrency(e.target.value); showToast("Currency updated!"); }}
                style={S.select}
              >
                {currencies.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div style={S.settingsDivider} />
            <div style={S.settingsRow}>
              <AlertTriangle size={20} color="#9B7B5E" />
              <div style={{ flex: 1 }}>
                <p style={S.settingsRowLabel}>Low Stock Alert</p>
                <p style={S.settingsRowSub}>Alert when qty is at or below</p>
              </div>
              <select
                value={lowStockThreshold}
                onChange={(e) => { setLowStockThreshold(Number(e.target.value)); showToast("Threshold updated!"); }}
                style={S.select}
              >
                {[1,2,3,5,10].map((n) => <option key={n} value={n}>{n} units</option>)}
              </select>
            </div>
          </div>
        </div>

        
        {/* DATA */}
        <div style={S.settingsSection}>
          <p style={S.settingsSectionTitle}>Data</p>
          <div style={S.settingsCard}>
            <div style={S.settingsRow} onClick={() => {
              if (businesses.length === 0) {
                showToast("No data to export!");
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
              rows.push(["Total Sales Recorded", businesses.reduce((a, b) => a + b.sales.length, 0)]);
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

                if (biz.sales.length > 0) {
                  sep();
                  rows.push(["── Sales History ──"]);
                  rows.push(["Date", "Item", "Qty", "Unit Price", "Revenue", "Cost", "Profit", "Discount", "Note"]);
                  biz.sales.forEach((sale) => {
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
              rows.push(["End of Report — BizTrack " + VERSION]);

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
              showToast("Report exported!");
            }}>
              <Upload size={20} color="#9B7B5E" />
              <div style={{ flex: 1 }}>
                <p style={S.settingsRowLabel}>Export as CSV</p>
                <p style={S.settingsRowSub}>Download all your data</p>
              </div>
              <ChevronRight size={20} color="#9B7B5E" />
            </div>
            <div style={S.settingsDivider} />
            {/*
              The route an existing local-only user takes to get an account.
              Before this, declining the sign-in screen set skippedAuth and
              nothing ever cleared it, so there was no way back inside the app
              -- and this row still advertised cloud backup as "Soon" while it
              was running.
            */}
            {!isBackendConfigured ? (
              <div style={S.settingsRow}>
                <Cloud size={20} color="#9B7B5E" />
                <div style={{ flex: 1 }}>
                  <p style={S.settingsRowLabel}>Cloud Backup</p>
                  <p style={S.settingsRowSub}>Not available in this build.</p>
                </div>
              </div>
            ) : ctx.auth?.session ? (
              <div style={S.settingsRow} onClick={() => {
                if (confirm("Sign out?\n\nYour records stay on this device — signing out never deletes them.")) {
                  ctx.signOutOfAccount();
                  showToast("Signed out. Your records are still here.");
                }
              }}>
                <Cloud size={20} color="#3A7D2C" />
                <div style={{ flex: 1 }}>
                  <p style={S.settingsRowLabel}>Backed up to your account</p>
                  <p style={S.settingsRowSub}>
                    {ctx.auth.session.user?.email || "Signed in"}
                    {ctx.sync?.status === "offline" ? " · waiting for a connection" : ""}
                    {ctx.sync?.status === "synced" ? " · up to date" : ""}
                  </p>
                </div>
                <span style={{ ...S.settingsRowSub, color: "var(--accent-color)", fontWeight: 700 }}>Sign out</span>
              </div>
            ) : (
              <div style={S.settingsRow} onClick={() => { track("account.start_from_settings"); ctx.startSignIn(); }}>
                <Cloud size={20} color="var(--accent-color)" />
                <div style={{ flex: 1 }}>
                  <p style={S.settingsRowLabel}>Back up to an account</p>
                  <p style={S.settingsRowSub}>
                    Keep your books if this phone is lost, and reach them from another one. Nothing on this device is removed.
                  </p>
                </div>
                <ChevronRight size={20} color="var(--text-secondary)" />
              </div>
            )}
          </div>
        </div>

        {/* ABOUT */}
        <div style={S.settingsSection}>
          <p style={S.settingsSectionTitle}>About</p>
          <div style={S.settingsCard}>
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
          </div>
        </div>

        {/* FEEDBACK */}
        <div style={S.settingsSection}>
          <p style={S.settingsSectionTitle}>Feedback</p>
          <div style={S.feedbackCard}>
            <p style={S.feedbackTitle}>How is BizTrack working for you?</p>
            <p style={S.feedbackSub}>Your feedback helps us improve</p>
            <div style={S.emojiRow}>
              {["😞","😐","🙂","😊","🤩"].map((e, i) => (
                <button key={i} style={S.emojiBtn} onClick={() => showToast("Thank you for your feedback!")}>{e}</button>
              ))}
            </div>
            <textarea
              placeholder="Tell us what you think or what you'd like to see..."
              style={S.feedbackInput}
            />
            <button style={S.submitBtn} onClick={() => showToast("Feedback sent! Thank you 🙏")}>
              Send Feedback
            </button>
          </div>
        </div>
        <div style={{ height: 16 }} />
      </div>
    </div>
  );
}

/* ─── MODALS ────────────────────────────────────────────────────────────────── */
function ModalShell({ onClose, title, children }) {
  return (
    <div style={S.modalOverlay} onClick={onClose}>
      <div style={S.modalSheet} onClick={(e) => e.stopPropagation()}>
        <div style={S.modalHandle} />
        <p style={S.modalTitle}>{title}</p>
        {children}
      </div>
    </div>
  );
}

function AddBizModal({ ctx }) {
  const { setModal, addBusiness } = ctx;
  const [name, setName] = useState("");
  const [category, setCategory] = useState("Crochet");
  const [color, setColor] = useState(COLORS[0]);
  const [emoji, setEmoji] = useState("🧶");

  const submit = () => {
    if (!name.trim()) return;
    addBusiness({ name: name.trim(), category, color, emoji });
    setModal(null);
  };

  return (
    <ModalShell onClose={() => setModal(null)} title="Add New Business">
      <div style={S.modalBody}>
        <p style={S.fieldLabel}>Business Name</p>
        <input style={S.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Crochet by Sabi" />

        <p style={S.fieldLabel}>Category</p>
        <select style={S.input} value={category} onChange={(e) => setCategory(e.target.value)}>
          {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
        </select>

        <p style={S.fieldLabel}>Pick a Color</p>
        <div style={S.colorRow}>
          {COLORS.map((c, i) => (
            <button key={c} style={{ ...S.colorDot, background: c, outline: color === c ? "3px solid #2C1810" : "none" }}
              onClick={() => setColor(c)} title={COLOR_NAMES[i]} />
          ))}
        </div>

        <p style={S.fieldLabel}>Pick an Emoji</p>
        <div style={S.emojiGrid}>
          {EMOJIS.map((e) => (
            <button key={e} style={{ ...S.emojiPick, background: emoji === e ? "#2C181018" : "transparent" }}
              onClick={() => setEmoji(e)}>{e}</button>
          ))}
        </div>

        <button style={S.primaryBtn} onClick={submit}>Create Business</button>
      </div>
    </ModalShell>
  );
}

function AddItemModal({ ctx }) {
  const { setModal, activeBizId, activeBiz, addInventoryItem } = ctx;
  const cur = activeBiz?.currency;
  const [name, setName] = useState("");
  const [qty, setQty] = useState("");
  const [cost, setCost] = useState("");
  const [price, setPrice] = useState("");

  // Typed values are in major units (what the user says out loud); everything
  // past this boundary is integer minor units.
  const costMinor = toMinor(cost, cur);
  const priceMinor = toMinor(price, cur);
  const preview = cost !== "" && price !== ""
    ? { profit: priceMinor - costMinor, margin: marginPercent(priceMinor, costMinor) }
    : null;

  const submit = () => {
    if (!name.trim()) return alert("Please enter an item name.");
    const q = num(qty, NaN);
    if (!(q > 0)) return alert("Quantity must be greater than 0.");
    if (!(num(cost, NaN) >= 0)) return alert("Cost cannot be negative.");
    if (!(num(price, NaN) > 0)) return alert("Selling price must be greater than 0.");
    addInventoryItem(activeBizId, {
      name: name.trim(),
      qty: Math.round(q),
      unitCost: costMinor,
      unitPrice: priceMinor,
    });
    setModal(null);
  };

  return (
    <ModalShell onClose={() => setModal(null)} title="Add Inventory Item">
      <div style={S.modalBody}>
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
            <p style={S.calcLabel}>Margin: <strong style={{ color: preview.margin >= 30 ? "#3A7D2C" : "#C0392B" }}>{preview.margin}%</strong></p>
          </div>
        )}

        <button style={S.primaryBtn} onClick={submit}>Add to Inventory</button>
      </div>
    </ModalShell>
  );
}

function RestockModal({ ctx }) {
  const { setModal, activeBiz, restockItemId, restockInventoryItem, setRestockItemId } = ctx;
  const cur = activeBiz?.currency;
  const item = activeBiz
    ? deriveInventory(activeBiz).find((i) => i.id === restockItemId && !i.deletedAt)
    : null;
  const [qty, setQty] = useState("");
  const [cost, setCost] = useState("");

  const close = () => { setRestockItemId(null); setModal(null); };

  const submit = () => {
    if (!item) return;
    const q = num(qty, NaN);
    if (!(q > 0)) return alert("Quantity must be greater than 0.");
    if (cost !== "" && !(num(cost, NaN) >= 0)) return alert("Cost cannot be negative.");
    // Blank keeps the running average unchanged.
    restockInventoryItem(activeBiz.id, item.id, Math.round(q), cost === "" ? null : toMinor(cost, cur));
    close();
  };

  return (
    <ModalShell onClose={close} title="Restock Item">
      <div style={S.modalBody}>
        {!item ? (
          <div style={S.emptyState}>
            <div style={S.emptyIcon}><AlertTriangle size={40} color="#8B6914" strokeWidth={1.5} /></div>
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

            <button style={S.primaryBtn} onClick={submit}>Restock Item</button>
          </>
        )}
      </div>
    </ModalShell>
  );
}

function AddSaleModal({ ctx }) {
  const { setModal, activeBiz, addSale } = ctx;
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

  const handleItemChange = (e) => {
    setItemId(e.target.value);
    const next = inventory.find((i) => i.id === e.target.value);
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

  const submit = () => {
    if (!(qtyNum > 0)) return alert("Quantity must be greater than 0.");
    if (!(num(actualPrice, NaN) >= 0)) return alert("Please enter a valid selling price.");

    if (tab === "inventory") {
      if (!selectedItem) return alert("Pick an item to sell.");
      // Overselling is allowed on purpose: the sale happened. The resulting
      // negative balance is flagged for reconciliation instead of blocked.
      addSale(activeBiz.id, {
        itemId: selectedItem.id,
        itemName: selectedItem.name,
        qty: qtyNum,
        unitPrice: priceMinor,
        unitCost: selectedItem.avgCost,
        askingPrice: selectedItem.unitPrice,
        note,
        isCustom: false,
      });
    } else {
      if (!manualName.trim()) return alert("Give this custom sale a name.");
      addSale(activeBiz.id, {
        itemId: null,
        itemName: manualName.trim(),
        qty: qtyNum,
        unitPrice: priceMinor,
        unitCost: manualCostMinor,
        askingPrice: priceMinor,
        note,
        isCustom: true,
      });
    }
    setModal(null);
  };

  const isInventoryEmpty = tab === "inventory" && inventory.length === 0;

  return (
    <ModalShell onClose={() => setModal(null)} title="Record Sale">
      <div style={S.modalBody}>
        <div style={{ display: "flex", gap: 8, marginBottom: 20, background: "var(--border-color)", padding: 4, borderRadius: 12 }}>
          <button
            style={{ flex: 1, padding: "8px", borderRadius: 8, border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer", background: tab === "inventory" ? "var(--bg-primary)" : "transparent", color: tab === "inventory" ? "var(--text-primary)" : "var(--text-secondary)" }}
            onClick={() => setTab("inventory")}
          >From Inventory</button>
          <button
            style={{ flex: 1, padding: "8px", borderRadius: 8, border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer", background: tab === "custom" ? "var(--bg-primary)" : "transparent", color: tab === "custom" ? "var(--text-primary)" : "var(--text-secondary)" }}
            onClick={() => setTab("custom")}
          >Custom Entry</button>
        </div>

        {tab === "inventory" ? (
          inventory.length === 0 ? (
            <div style={S.emptyState}>
              <div style={S.emptyIcon}><Package size={40} color="#2C1810" strokeWidth={1.5} /></div>
              <p style={S.emptyTitle}>No items in inventory</p>
              <p style={S.emptySub}>Switch to "Custom Entry" or add items first.</p>
            </div>
          ) : (
            <>
              <p style={S.fieldLabel}>Select Item</p>
              <select style={S.input} value={itemId} onChange={handleItemChange}>
                {inventory.map((i) => (
                  <option key={i.id} value={i.id}>{i.name} ({i.qty} in stock)</option>
                ))}
              </select>

              <p style={S.fieldLabel}>Quantity Sold</p>
              <input style={S.input} type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="1" />

              {selectedItem && qtyNum > selectedItem.qty && (
                <p style={{ fontSize: 11, color: "#E67E22", margin: "-4px 0 0", fontWeight: 600 }}>
                  Only {Math.max(selectedItem.qty, 0)} in stock. The sale will still be recorded and flagged.
                </p>
              )}

              <p style={S.fieldLabel}>Actual Selling Price ({cur})</p>
              <input
                style={{ ...S.input, borderColor: soldBelow ? "#E67E22" : soldAbove ? "#3A7D2C" : "var(--border-color)" }}
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
                <p style={S.calcLabel}>Net Profit: <strong style={{ color: preview.profit >= 0 ? "#3A7D2C" : "#C0392B" }}>{preview.profit >= 0 ? "+" : ""}{fmt(preview.profit, cur)}</strong></p>
              </div>
            )}

            <button style={S.primaryBtn} onClick={submit}>Record Sale</button>
          </>
        )}
      </div>
    </ModalShell>
  );
}

function PinSetupModal({ ctx }) {
  const { setModal, setHashedPin, setHashedRecoveryKey, setIsPinEnabled, showToast } = ctx;
  const [step, setStep] = useState(1); // 1: set, 2: confirm, 3: recovery
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [recoveryKey, setRecoveryKey] = useState("");

  const handleNext = async () => {
    if (step === 1) {
      if (pin.length !== 4) return alert("PIN must be 4 digits.");
      setStep(2);
    } else if (step === 2) {
      if (pin !== confirmPin) return alert("PINs do not match.");
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
            <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 24 }}>Choose a 4-digit code to protect your data.</p>
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
            <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 24 }}>Enter your PIN one more time.</p>
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
            <Award size={48} color="#D4AF37" style={{ marginBottom: 20 }} />
            <h3 style={{ margin: "0 0 8px" }}>Save Recovery Key</h3>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 24 }}>If you forget your PIN, you will need this key to unlock your data.</p>
            <div style={{ background: "#FDF9F3", border: "2px dashed #D4B896", borderRadius: 16, padding: "20px 30px", marginBottom: 24 }}>
              <span style={{ fontSize: 24, fontWeight: 800, color: "#2C1810", letterSpacing: 2, fontFamily: "monospace" }}>{recoveryKey}</span>
            </div>
            <p style={{ fontSize: 11, color: "#C0392B", fontWeight: 600, marginBottom: 24 }}>⚠️ Screenshot this or write it down. It cannot be recovered!</p>
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
          <div style={S.deleteIcon}><AlertTriangle size={36} color="#C0392B" strokeWidth={1.5} /></div>
          <p style={S.deleteTitle}>Delete "{activeBiz?.name}"?</p>
          <p style={S.deleteSub}>This will permanently remove this business and all its inventory and sales data. This cannot be undone.</p>
        </div>
        <button style={{ ...S.primaryBtn, background: "#C0392B" }} onClick={() => deleteBusiness(activeBiz?.id)}>
          Yes, Delete Business
        </button>
        <button style={S.ghostBtn} onClick={() => setModal(null)}>Cancel</button>
      </div>
    </ModalShell>
  );
}

function Toast({ msg, onDismiss }) {
  return (
    <div 
      style={{ position: "fixed", bottom: 100, left: 0, right: 0, display: "flex", justifyContent: "center", zIndex: 10000 }}
      onClick={onDismiss}
    >
      <div style={{ background: "rgba(44, 24, 16, 0.95)", color: "#FAF9F7", padding: "12px 24px", borderRadius: 30, fontSize: 13, fontWeight: 600, boxShadow: "0 10px 25px rgba(0,0,0,0.3)", animation: "toastIn 0.3s cubic-bezier(0.18, 0.89, 0.32, 1.28) forwards", cursor: "pointer", border: "1px solid rgba(255,255,255,0.1)" }}>
        {msg}
      </div>
    </div>
  );
}

/* ─── BOTTOM NAV ────────────────────────────────────────────────────────────── */
/* ─── BOTTOM NAV ────────────────────────────────────────────────────────────── */
function BottomNav({ ctx }) {
  const { screen, setScreen } = ctx;
  const tabs = [
    { id: "home", icon: <Home size={22} />, label: "Home" },
    { id: "analytics", icon: <div id="nav-analytics"><BarChart2 size={22} /></div>, label: "Analytics" },
    
    { id: "settings", icon: <Settings size={22} />, label: "Settings" },
  ];
  return (
    <div style={S.bottomNav}>
      {tabs.map((t) => (
        <button
          key={t.id}
          style={{ ...S.navItem, ...(screen === t.id ? S.navActive : {}) }}
          onClick={t.action || (() => setScreen(t.id))}
        >
          <span style={{ display: "flex", alignItems: "center", justifyContent: "center", ...(t.id === "add" ? S.addNavIcon : { color: screen === t.id ? "#2C1810" : "#9B7B5E" }) }}>{t.icon}</span>
          <span style={{ ...S.navLabel, ...(screen === t.id ? { color: "var(--text-primary)" } : {}) }}>{t.label}</span>
        </button>
      ))}
    </div>
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
    <div style={S.screen}>
      <div style={S.pageHeader}>
        <button style={S.backBtn} onClick={() => setScreen("settings")}><ArrowLeft size={24} /></button>
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
        <div style={S.tabInner}>
          {tab === "features" ? (
            <>
              <div style={{ ...S.summaryCard, textAlign: "center", padding: "40px 24px" }}>
                <div style={S.summaryOrb} />
                <div style={{ background: "rgba(255,255,255,0.1)", width: 80, height: 80, borderRadius: 24, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", position: "relative" }}>
                   <Store size={40} color="#FFF" />
                </div>
                <h2 style={{ ...S.userName, color: "#FFF", fontSize: 28 }}>BizTrack</h2>
                <p style={{ ...S.greeting, color: "rgba(255,255,255,0.7)", fontSize: 14, marginTop: 8 }}>Empowering local entrepreneurs and creators to scale with confidence.</p>
              </div>

              <p style={S.sectionLabel}>Core Features</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {features.map((f, i) => (
                  <div key={i} style={{ ...S.settingsCard, padding: 16, display: "flex", gap: 16 }}>
                    <div style={{ width: 44, height: 44, borderRadius: 12, background: "rgba(193,127,90,0.1)", color: "var(--accent-color)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      {f.icon}
                    </div>
                    <div>
                      <p style={{ ...S.settingsRowLabel, fontSize: 15 }}>{f.title}</p>
                      <p style={{ ...S.settingsRowSub, lineHeight: 1.5, marginTop: 4 }}>{f.desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ ...S.infoCard, background: "rgba(193,127,90,0.05)", borderLeft: "4px solid var(--accent-color)", marginTop: 12 }}>
                <p style={{ ...S.infoLabel, color: "var(--accent-color)" }}>Built with ❤️ for</p>
                <p style={S.infoVal}>Independent Creators</p>
                <p style={S.infoSub}>Whether you crochet, bake, or design, BizTrack is built to help you understand your numbers.</p>
              </div>
            </>
          ) : (
            <>
              <button 
                style={{ ...S.primaryBtn, marginBottom: 8, background: "var(--accent-color)", position: "relative", overflow: "hidden" }} 
                onClick={() => checkUpdates(true)}
              >
                {ctx.updateProgress > 0 && ctx.updateProgress < 100 ? (
                  <div style={{ position: "absolute", inset: 0, background: "rgba(255,255,255,0.2)", width: `${ctx.updateProgress}%`, transition: "width 0.2s ease" }} />
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
                        <span style={{ ...S.badge, background: idx === 0 ? "rgba(193,127,90,0.1)" : "var(--border-color)", color: idx === 0 ? "var(--accent-color)" : "var(--text-secondary)", fontSize: 12, borderRadius: 8 }}>{log.version}</span>
                        <span style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 600 }}>{log.date}</span>
                      </div>
                      <h3 style={{ fontSize: 18, color: "var(--text-primary)", margin: "0 0 12px" }}>{log.title}</h3>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {log.changes.map((change, i) => (
                          <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                            <CheckCircle2 size={14} color="var(--accent-color)" style={{ marginTop: 2, flexShrink: 0 }} />
                            <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0, lineHeight: 1.4 }}>{change}</p>
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
  const { businesses, replaceBusinesses, userName, userEmail, setUserName, setUserEmail, setOnboardingComplete, currency, setCurrency, lowStockThreshold, setLowStockThreshold } = ctx;
  const [step, setStep] = useState(0);
  const [showImport, setShowImport] = useState(false);
  
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;

  const initialName = userName !== "Business Owner" ? userName : "";
  const [name, setName] = useState(initialName);
  const [email, setEmail] = useState(userEmail || "");

  const hasStarted = businesses.length > 0 || initialName.length > 0;

  const next = () => {
    if (step === 1 && name.trim()) { setUserName(name.trim()); }
    if (step === 2 && email.trim()) { setUserEmail(email.trim()); }
    if (step === 3) { setOnboardingComplete(true); } 
    else { setStep(step + 1); }
  };

  const handleExport = () => {
    const payload = buildBackup({ businesses, userName, userEmail, currency, lowStockThreshold });
    if (saveBackupFile(payload)) {
      alert("Saved to a file. Open BizTrack on the other phone and choose Load from File.");
    } else {
      alert("Could not save the file on this device.");
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
  const handleImport = (raw) => {
    let parsed;
    try {
      // parseBackup accepts codes exported by older builds too, and migrates
      // them on the way in.
      parsed = parseBackup(typeof raw === "string" ? JSON.parse(raw) : raw, currency);
    } catch {
      return alert("That doesn't look like a BizTrack backup.");
    }
    if (!parsed) return alert("That backup is missing or has damaged business data, so nothing was changed.");

    replaceBusinesses(parsed.businesses);
    if (parsed.userName) setUserName(parsed.userName);
    if (parsed.userEmail) setUserEmail(parsed.userEmail);
    if (parsed.currency) setCurrency(parsed.currency);
    if (parsed.lowStockThreshold) setLowStockThreshold(parsed.lowStockThreshold);
    alert(`Restored ${parsed.businesses.length} business${parsed.businesses.length === 1 ? "" : "es"}.`);
    setShowImport(false);
  };

  return (
    <div style={{ ...S.shell, background: "#2C1810", color: "var(--bg-primary)", textAlign: "center" }}>
      <div style={{ ...S.phone, background: "#2C1810", justifyContent: "center", padding: 40 }}>
        {step === 0 && (
          <div style={{ animation: "fadeIn 0.8s ease" }}>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 32, position: "relative" }}>
               <div style={{ position: "absolute", width: 140, height: 140, background: "rgba(193, 127, 90, 0.15)", filter: "blur(30px)", borderRadius: "50%" }} />
               <img src="/avatar-1-coin.svg" style={{ width: 140, height: 140, position: "relative", zIndex: 1 }} />
            </div>
            <h1 style={{ ...S.userName, color: "var(--bg-primary)", fontSize: 32, marginBottom: 12 }}>Welcome to BizTrack</h1>
            <p style={{ ...S.greeting, color: "rgba(255,255,255,0.7)", fontSize: 16, marginBottom: 32 }}>Your all-in-one business growth companion.</p>
            
            {!isStandalone && (
              <div style={{ background: "rgba(255,255,255,0.05)", borderRadius: 20, padding: 20, border: "1px solid rgba(255,255,255,0.1)", marginBottom: 32 }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: "#D4B896", marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                  <Download size={16} /> Important: Install First
                </p>
                <p style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", lineHeight: 1.4, marginBottom: 16 }}>
                  To avoid data loss when switching to the app later, please <strong>Add to Home Screen</strong> now.
                </p>
                <InstallPrompt deferredPrompt={deferredPrompt} setDeferredPrompt={setDeferredPrompt} />
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <button style={{ ...S.primaryBtn, background: "var(--bg-primary)", color: "var(--text-primary)" }} onClick={next}>
                {hasStarted ? "Continue Setup" : "Get Started"}
              </button>

              <button 
                style={{ ...S.ghostBtn, border: "none", color: "rgba(255,255,255,0.4)", fontSize: 11, marginTop: 12 }}
                onClick={() => ctx.checkRescue(true)}
              >
                {ctx.isRescuing ? "Searching for data..." : "Looking for lost data? Tap to Rescue"}
              </button>

              <button 
                style={{ ...S.ghostBtn, border: "none", color: "rgba(255,255,255,0.2)", fontSize: 10 }}
                onClick={() => setShowImport(!showImport)}
              >
                Transfer from another device
              </button>

              {showImport && (
                <div style={{ display: "flex", gap: 8, animation: "fadeIn 0.3s ease" }}>
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
                        return alert(err.message);
                      }
                      if (raw) handleImport(raw);
                    }}
                  >Load from File</button>
                </div>
              )}

              {showImport && (
                <button
                  style={{ ...S.textBtn, color: "rgba(255,255,255,0.45)", fontSize: 11, marginTop: 10 }}
                  onClick={() => {
                    const code = prompt("Paste your backup code:");
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
          <div style={{ animation: "fadeIn 0.5s ease" }}>
            <h2 style={{ ...S.sectionLabel, color: "var(--bg-primary)", fontSize: 24, marginBottom: 24 }}>What's your name?</h2>
            <input 
              style={{ ...S.input, background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", color: "var(--bg-primary)", textAlign: "center", fontSize: 18 }}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Sabi"
              autoFocus
            />
            <button style={{ ...S.primaryBtn, background: "var(--bg-primary)", color: "var(--text-primary)", marginTop: 24, opacity: name.trim() ? 1 : 0.5 }} disabled={!name.trim()} onClick={next}>Continue</button>
          </div>
        )}
        {step === 2 && (
          <div style={{ animation: "fadeIn 0.5s ease" }}>
            <h2 style={{ ...S.sectionLabel, color: "var(--bg-primary)", fontSize: 24, marginBottom: 12 }}>Your Email?</h2>
            <p style={{ ...S.greeting, color: "rgba(255,255,255,0.7)", marginBottom: 24 }}>Optional: To help you manage your business data.</p>
            <input 
              style={{ ...S.input, background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", color: "var(--bg-primary)", textAlign: "center", fontSize: 18 }}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="hello@example.com"
              type="email"
              autoFocus
            />
            <button style={{ ...S.primaryBtn, background: "var(--bg-primary)", color: "var(--text-primary)", marginTop: 24 }} onClick={() => {
              if (email.trim() && !validateEmail(email)) {
                alert("Please enter a valid email address.");
                return;
              }
              next();
            }}>Continue</button>
          </div>
        )}
        {step === 3 && (
          <div style={{ animation: "fadeIn 0.5s ease" }}>
            <h2 style={{ ...S.sectionLabel, color: "var(--bg-primary)", fontSize: 24, marginBottom: 12 }}>All set, {name || initialName}!</h2>
            <p style={{ ...S.greeting, color: "rgba(255,255,255,0.7)", marginBottom: 32 }}>Let's start by adding your first business on the home screen.</p>
            <div style={{ background: "rgba(255,255,255,0.05)", borderRadius: 20, padding: 30, border: "1.5px dashed rgba(255,255,255,0.2)" }}>
               <Store size={48} color="rgba(255,255,255,0.3)" style={{ marginBottom: 12 }} />
               <p style={{ fontSize: 14, color: "rgba(255,255,255,0.5)" }}>Your dashboard is waiting...</p>
            </div>
            <button style={{ ...S.primaryBtn, background: "var(--bg-primary)", color: "var(--text-primary)", marginTop: 40 }} onClick={next}>Enter Dashboard</button>
          </div>
        )}
      </div>
      <p style={{ position: "absolute", bottom: 20, left: 0, right: 0, textAlign: "center", fontSize: 10, color: "rgba(255,255,255,0.4)", pointerEvents: "none" }}>BizTrack {VERSION} • Build {BUILD_DATE}</p>
      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}

/* ─── SECURITY ─────────────────────────────────────────────────────────────── */
function PinLock({ ctx, onUnlock }) {
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
      alert("No valid email address found in your profile. To protect your data, you must use your 8-digit Recovery Key to reset your passcode.");
      return;
    }
    setIsSending(true);
    const code = genEmailCode();
    const success = await sendResetEmail(userEmail, userName, code);
    setIsSending(false);
    
    if (success) {
      setSentCode(code);
      setRecoveryMode('email');
      showToast("Reset code sent to your email!");
    } else {
      alert("Failed to send email. Please check your internet connection.");
    }
  };

  const verifyEmailCode = () => {
    if (emailCode === sentCode || (EMAILJS_CONFIG.PUBLIC_KEY === "YOUR_PUBLIC_KEY" && emailCode === "000000")) {
      resetEverything();
    } else {
      alert("Invalid code. Please try again.");
    }
  };

  const submitRecoveryKey = async () => {
    const hash = await hashPin(recoveryInput.toUpperCase().replace(/\s/g, ""));
    if (hash === hashedRecoveryKey) {
      resetEverything();
    } else {
      alert("Invalid Recovery Key.");
    }
  };

  const resetEverything = () => {
    if (confirm("Reset passcode and unlock?")) {
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
        <div style={{ ...S.phone, padding: 40, alignItems: "center", justifyContent: "center" }}>
          <Shield size={48} color="var(--accent-color)" style={{ marginBottom: 20 }} />
          <h2 style={{ ...S.userName, marginBottom: 8 }}>PIN Recovery</h2>
          <p style={{ ...S.greeting, textAlign: "center", marginBottom: 32 }}>Enter the 8-character recovery key you saved earlier.</p>
          <input 
            style={{ ...S.input, textAlign: "center", letterSpacing: 2, fontSize: 18, textTransform: "uppercase" }}
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
        <div style={{ ...S.phone, padding: 40, alignItems: "center", justifyContent: "center" }}>
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
      <div style={{ ...S.phone, padding: 40, alignItems: "center", justifyContent: "center" }}>
        <div style={{ ...S.avatar, width: 64, height: 64, fontSize: 28, marginBottom: 16 }}>{userAvatar?.startsWith('/') ? <img src={userAvatar} style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover" }} /> : (userAvatar || (userName || "B")[0])}</div>
        <h2 style={{ ...S.userName, marginBottom: 8 }}>Welcome back</h2>
        <p style={{ ...S.greeting, marginBottom: 40 }}>{isLockedOut ? `Locked out for ${secondsLeft}s` : "Enter PIN to unlock"}</p>
        
        <div style={{ display: "flex", gap: 16, marginBottom: 40 }}>
          {[0,1,2,3].map(i => (
            <div key={i} style={{ width: 16, height: 16, borderRadius: "50%", background: input.length > i ? "var(--text-primary)" : "var(--border-color)", border: isLockedOut ? "1px solid #C0392B" : "none" }} />
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
                <p style={{ fontSize: 11, color: "#8B6914", margin: 0, fontWeight: 700, textAlign: "center" }}>⚠️ No recovery email configured</p>
                <p style={{ fontSize: 10, color: "var(--text-secondary)", margin: "4px 0 0", textAlign: "center" }}>Please use your Recovery Key or Data Rescue below.</p>
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
            style={{ ...S.textBtn, fontSize: 12, color: "#8B6914", fontWeight: 700, background: "rgba(139, 105, 20, 0.1)", padding: "10px 20px", borderRadius: 99 }} 
            onClick={() => {
              if (confirm("Emergency Data Rescue will search for backups from previous versions on this device. Continue?")) {
                ctx.checkRescue(true);
              }
            }}
          >
            {ctx.isRescuing ? "Scanning device..." : "Try Emergency Data Rescue"}
          </button>

          <button 
            style={{ ...S.textBtn, fontSize: 10, opacity: 0.4, marginTop: 12 }} 
            onClick={() => window.location.reload(true)}
          >
            App stuck? Force Refresh
          </button>
          <p style={{ fontSize: 9, opacity: 0.3, marginTop: 4 }}>BizTrack {VERSION}</p>
        </div>
      </div>
    </div>
  );
}

/* ─── FEATURE GUIDE ────────────────────────────────────────────────────────── */
function FeatureGuide({ ctx }) {
  const [step, setStep] = useState(0);
  const { setHasSeenGuide } = ctx;

  const steps = [
    { target: "home-summary", text: "Here is your total profit across all businesses.", pos: "bottom" },
    { target: "add-biz-btn", text: "Tap here to add a new business to your portfolio.", pos: "top" },
    { target: "nav-analytics", text: "See your growth trends and profit ranking here.", pos: "top" }
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
        boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
        pointerEvents: "auto",
        animation: "slideIn 0.3s ease"
      }}>
        <p style={{ fontSize: 13, color: "var(--text-primary)", fontWeight: 500, margin: "0 0 12px", lineHeight: 1.4 }}>{current.text}</p>
        <button style={{ ...S.primaryBtn, padding: "8px", fontSize: 12 }} onClick={next}>
          {step === steps.length - 1 ? "Finish Guide" : "Next Tip"}
        </button>
      </div>
      <style>{`
        @keyframes slideIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}



/* ─── ACCOUNT SCREEN ───────────────────────────────────────────────────────── */
function AccountScreen({ ctx }) {
  const { setScreen, setModal, userName, setUserName, businesses, userEmail, setUserEmail, showToast, userAvatar, setUserAvatar, isPinEnabled } = ctx;
  const joinDate = useStore(s => s.joinDate);
  const formattedDate = new Date(joinDate).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  
  const lifetime = calcPortfolioStats(businesses);
  
  return (
    <div style={S.screen}>
      <div style={S.pageHeader}>
        <button style={S.backBtn} onClick={() => setScreen("home")}>
          <ArrowLeft size={24} />
        </button>
        <h2 style={S.pageTitle}>Account</h2>
        <div style={{ width: 32 }} />
      </div>

      <div style={S.tabInner}>
        {/* PREMIUM PROFILE HEADER */}
        <div style={S.summaryCard}>
          <div style={S.summaryOrb} />
          <div style={{ display: "flex", alignItems: "center", gap: 16, position: "relative", zIndex: 1 }}>
            <div style={{ ...S.avatar, width: 64, height: 64, fontSize: 28, boxShadow: "0 8px 24px rgba(0,0,0,0.2)" }}>{userAvatar?.startsWith('/') ? <img src={userAvatar} style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover" }} /> : (userAvatar || (userName || "B")[0])}</div>
            <div>
              <p style={{ ...S.summaryLabel, margin: 0, opacity: 0.8 }}>Owner Profile</p>
              <h2 style={{ ...S.userName, color: "var(--bg-primary)", fontSize: 24, marginTop: 4 }}>{userName}</h2>
              <p style={{ ...S.greeting, color: "rgba(255,255,255,0.6)", marginTop: 2 }}>{userEmail || "No email linked"}</p>
            </div>
          </div>
        </div>

        {/* STATS GRID */}
        <div style={S.statsGrid}>
          <div style={S.statCard}>
            <p style={S.statLbl}>Lifetime Revenue</p>
            <p style={S.statVal}>{fmt(lifetime.revenue)}</p>
          </div>
          <div style={S.statCard}>
            <p style={S.statLbl}>Lifetime Profit</p>
            <p style={{ ...S.statVal, color: "#3A7D2C" }}>{fmt(lifetime.profit)}</p>
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
            {["/avatars/avatar1.png", "/avatars/avatar2.png", "/avatars/avatar3.png", "/avatars/avatar4.png", "/avatars/avatar5.png"].map(a => (
              <button 
                key={a}
                onClick={() => {
                  setUserAvatar(a);
                  showToast("Persona updated!");
                }}
                style={{ 
                  ...S.avatar, 
                  width: 72, 
                  height: 72, 
                  flexShrink: 0,
                  padding: 4,
                  overflow: "hidden",
                  border: userAvatar === a ? "3px solid #C17F5A" : "3px solid rgba(155, 123, 94, 0.1)",
                  background: userAvatar === a ? "rgba(193, 127, 90, 0.1)" : "var(--card-bg)",
                  boxShadow: userAvatar === a ? "0 8px 20px rgba(193,127,90,0.3)" : "0 2px 8px rgba(0,0,0,0.05)",
                  transition: "0.2s all ease-in-out",
                  cursor: "pointer",
                  borderRadius: "50%"
                }}
              >
                <img src={a} style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover" }} />
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
                       alert("Invalid email format. Please correct it.");
                     }
                   }}
                   placeholder="Enter your email"
                 />
               </div>
             </div>
          </div>
        </div>

        
        {/* DATA MANAGEMENT */}
        <div style={S.settingsSection}>
          <p style={S.settingsSectionTitle}>Data Management</p>
          <div style={S.settingsCard}>
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
               <Download size={20} color="#3A7D2C" />
               <div style={{ flex: 1 }}>
                 <p style={S.settingsRowLabel}>Save My Data to a File</p>
                 <p style={S.settingsRowSub}>Keep a copy, or move your books to another phone.</p>
               </div>
             </div>
             <div style={S.settingsDivider} />
             <div style={S.settingsDivider} />
             <div style={S.settingsRow} onClick={downloadSnapshot}>
               <Shield size={20} color="#5C7A8B" />
               <div style={{ flex: 1 }}>
                 <p style={S.settingsRowLabel}>Pre-Upgrade Backup</p>
                 <p style={S.settingsRowSub}>Download your data exactly as it was before the last update.</p>
               </div>
             </div>
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
                 return alert(err.message);
               }
               if (!raw) return; // cancelled; not an error, say nothing

               const parsed = parseBackup(raw, ctx.currency);
               if (!parsed) return alert("That backup is missing or has damaged business data, so nothing was changed.");

               const incoming = summarizeLocal(parsed.businesses);
               const current = summarizeLocal(businesses);

               if (!confirm(
                 "Restore this backup?" + "\n\n" +
                 `Coming in: ${incoming.businesses} businesses, ${incoming.items} items, ${incoming.sales} sales.` + "\n" +
                 `On this phone now: ${current.businesses} businesses, ${current.items} items, ${current.sales} sales.` + "\n\n" +
                 "Everything currently on this phone is replaced. If you need it, cancel and save it to a file first."
               )) return;

               ctx.replaceBusinesses(parsed.businesses);
               if (parsed.userName) ctx.setUserName(parsed.userName);
               if (parsed.userEmail) ctx.setUserEmail(parsed.userEmail);
               if (parsed.currency) ctx.setCurrency(parsed.currency);
               track("backup.restore_file", { count: incoming.businesses });
               showToast(`Restored ${incoming.businesses} business${incoming.businesses === 1 ? "" : "es"}.`);
             }}>
               <Upload size={20} color="#8B6914" />
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
            <div style={S.settingsRow} onClick={async () => {
              if (isPinEnabled) {
                if (confirm("Disable passcode lock? This will also remove your recovery key.")) {
                  ctx.setIsPinEnabled(false);
                  ctx.setHashedPin(null);
                  ctx.setHashedRecoveryKey(null);
                  showToast("PIN disabled");
                }
              } else {
                setModal("pin-setup");
              }
            }}>
              <Lock size={20} color="#9B7B5E" />
              <div style={{ flex: 1 }}>
                <p style={S.settingsRowLabel}>Passcode Lock</p>
                <p style={S.settingsRowSub}>{isPinEnabled ? "Enabled — Tap to disable" : "Disabled — Tap to enable"}</p>
              </div>
              <div style={{ width: 40, height: 20, background: isPinEnabled ? "#3A7D2C" : "#E0D6C8", borderRadius: 20, position: "relative", transition: "0.3s" }}>
                <div style={{ width: 16, height: 16, background: "var(--card-bg)", borderRadius: "50%", position: "absolute", top: 2, left: isPinEnabled ? 22 : 2, transition: "0.3s" }} />
              </div>
            </div>
          </div>
        </div>

        {/* PRIVACY */}
        {isBackendConfigured && (
          <div style={S.settingsSection}>
            <p style={S.settingsSectionTitle}>Privacy</p>
            <div style={S.settingsCard}>
              <div style={S.settingsRow} onClick={() => {
                const next = !ctx.analyticsConsent;
                ctx.chooseAnalytics(next);
                showToast(next ? "Thank you — usage data on." : "Usage data off. Queue cleared.");
              }}>
                <TrendingUp size={20} color="#9B7B5E" />
                <div style={{ flex: 1 }}>
                  <p style={S.settingsRowLabel}>Share usage data</p>
                  <p style={S.settingsRowSub}>
                    Which screens and features you use, and crashes. Never your business data.
                  </p>
                </div>
                <div style={{ width: 40, height: 20, background: ctx.analyticsConsent ? "#3A7D2C" : "#E0D6C8", borderRadius: 20, position: "relative", transition: "0.3s" }}>
                  <div style={{ width: 16, height: 16, background: "var(--card-bg)", borderRadius: "50%", position: "absolute", top: 2, left: ctx.analyticsConsent ? 22 : 2, transition: "0.3s" }} />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ACCOUNT DELETION — right to erasure, self-service. */}
        {isBackendConfigured && ctx.auth?.session && (
          <div style={S.settingsSection}>
            <p style={S.settingsSectionTitle}>Danger Zone</p>
            <div style={S.settingsCard}>
              <div style={S.settingsRow} onClick={async () => {
                // Two gates on purpose. The first is the one that matters: it
                // offers the export BEFORE anything is destroyed, because the
                // cloud copy may be the only backup of someone's books.
                if (!confirm(
                  "Delete your account?\n\n" +
                  "This erases your account and every record stored on our servers. It cannot be undone.\n\n" +
                  "Records on THIS device are NOT deleted — they stay until you clear the app.\n\n" +
                  "Export your data first if you have not already. Cancel now to do that."
                )) return;

                // Typed confirmation, not a second tap. A destructive action
                // reached by muscle memory is not a decision.
                const typed = prompt('Type DELETE to confirm. This cannot be undone.');
                if (typed !== "DELETE") return showToast("Not deleted.");

                showToast("Deleting your account…");
                const { error } = await deleteAccount();
                if (error) return showToast(error.message);
                showToast("Account deleted. Your device records are still here.");
                setScreen("home");
              }}>
                <Trash2 size={20} color="#C0392B" />
                <div style={{ flex: 1 }}>
                  <p style={{ ...S.settingsRowLabel, color: "#C0392B" }}>Delete Account</p>
                  <p style={S.settingsRowSub}>Erase your account and everything stored on our servers. Records on this device stay.</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* APP INFO */}
        <div style={S.settingsSection}>
          <p style={S.settingsSectionTitle}>App Information</p>
          <div style={S.settingsCard}>
             <div style={S.settingsRow}>
               <Award size={20} color="#C17F5A" />
               <div style={{ flex: 1 }}>
                 <p style={S.settingsRowLabel}>Membership</p>
                 <p style={S.settingsRowSub}>Joined {formattedDate}</p>
               </div>
               <span style={{ ...S.badge, background: "#E8F5E3", color: "#3A7D2C" }}>PRO LOCAL</span>
             </div>
          </div>
        </div>

        
        <button 
          style={{ ...S.primaryBtn, marginTop: 24 }}
          onClick={() => {
            ctx.setOnboardingComplete(false);
            showToast("Signed out successfully");
          }}
        >
          Sign Out
        </button>

        <button 
          style={{ ...S.ghostBtn, color: "#C0392B", borderColor: "#FDECEA", marginTop: 12, borderStyle: "dashed" }}
          onClick={() => {
            if (!confirm("🚨 FACTORY RESET: This will permanently delete all businesses, sales, and inventory data. This cannot be undone. Continue?")) return;
            // Last chance to walk away with a copy, including the pre-upgrade one.
            if (readSnapshot() && confirm("Download a copy of your data before erasing it?")) {
              downloadSnapshot();
            }
            if (!confirm("Type-free final check: erase everything on this device now?")) return;
            localStorage.clear();
            window.location.reload();
          }}
        >
          Wipe All Data & Reset App
        </button>

        
        <div style={{ height: 40 }} />
        <p style={{ textAlign: "center", fontSize: 10, color: "var(--text-secondary)", opacity: 0.5, marginBottom: 20 }}>BizTrack {VERSION} • Build {BUILD_DATE}</p>
      </div>
    </div>
  );
}


/* ─── STYLES ────────────────────────────────────────────────────────────────── */
const S = {
  shell: { minHeight: "100dvh", background: "var(--bg-primary)", display: "flex", justifyContent: "center", fontFamily: "'DM Sans','Nunito',sans-serif", padding: 0, margin: 0 },
  phone: { width: "100%", maxWidth: 600, height: "100dvh", background: "var(--bg-primary)", overflow: "hidden", display: "flex", flexDirection: "column", position: "relative", shadow: "none", borderRadius: 0 },
  statusBar: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 28px 4px", fontSize: 12, color: "var(--text-secondary)", fontWeight: 600, flexShrink: 0 },
  statusTime: { letterSpacing: 1 },
  statusIcons: { fontSize: 10, opacity: 0.7 },
  screenWrap: { flex: 1, overflow: "hidden", position: "relative" },
  screen: { position: "absolute", inset: 0, overflowY: "auto", paddingBottom: 80, scrollbarWidth: "none" },

  homeHeader: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "16px 24px 8px" },
  greeting: { fontSize: 13, color: "var(--text-secondary)", margin: 0, fontWeight: 500, letterSpacing: 0.3 },
  userName: { fontSize: 26, color: "var(--text-primary)", margin: "2px 0 0", fontWeight: 800, fontFamily: "'Playfair Display',Georgia,serif", letterSpacing: -0.5 },
  userNameInput: { fontSize: 26, color: "var(--text-primary)", margin: "2px 0 0", fontWeight: 800, fontFamily: "'Playfair Display',Georgia,serif", letterSpacing: -0.5, border: "none", background: "transparent", padding: 0, outline: "none", width: "100%", maxWidth: 280 },
  avatar: { width: 44, height: 44, borderRadius: "50%", background: "linear-gradient(135deg,#C17F5A,#8B6914)", color: "var(--bg-primary)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 18, boxShadow: "0 4px 16px rgba(193,127,90,0.4)", flexShrink: 0 },
  settingsInput: { width: "100%", border: "1px solid var(--border-color)", borderRadius: 12, padding: "10px 12px", fontSize: 14, color: "var(--text-primary)", background: "var(--card-bg)", outline: "none", marginTop: 4 },

  summaryCard: { margin: "8px 24px 16px", background: "linear-gradient(135deg,#2C1810,#5C3D2E)", borderRadius: 24, padding: "22px", position: "relative", overflow: "hidden", boxShadow: "0 12px 40px rgba(44,24,16,0.35)" },
  summaryOrb: { position: "absolute", top: -40, right: -40, width: 160, height: 160, borderRadius: "50%", background: "rgba(255,255,255,0.04)" },
  summaryLabel: { fontSize: 12, color: "rgba(255,255,255,0.85)", margin: "0 0 6px", letterSpacing: 0.8, textTransform: "uppercase", fontWeight: 600 },
  summaryAmount: { fontSize: 28, color: "#FFFFFF", margin: "0 0 18px", fontFamily: "'Playfair Display',Georgia,serif", fontWeight: 700, letterSpacing: -1 },
  summaryRow: { display: "flex", alignItems: "center", gap: 16 },
  summaryDivider: { width: 1, height: 28, background: "rgba(255,255,255,0.2)" },
  summarySubLabel: { fontSize: 11, color: "rgba(255,255,255,0.8)", margin: "0 0 3px", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600 },
  summarySubVal: { fontSize: 16, color: "#FFFFFF", margin: 0, fontWeight: 700 },

  alertBanner: { margin: "0 24px 14px", background: "#FFF8E1", borderRadius: 14, padding: "12px 16px", display: "flex", alignItems: "flex-start", gap: 10, border: "1px solid #F0C040" },
  alertIcon: { fontSize: 18, flexShrink: 0 },
  alertTitle: { fontSize: 13, fontWeight: 700, color: "#8B6914", margin: "0 0 3px" },
  alertSub: { fontSize: 12, color: "var(--text-secondary)", margin: 0 },

  sectionRow: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 24px 12px" },
  sectionLabel: { fontSize: 15, fontWeight: 700, color: "var(--text-primary)", margin: 0, fontFamily: "'Playfair Display',Georgia,serif" },
  textBtn: { fontSize: 13, color: "var(--accent-color)", fontWeight: 700, background: "none", border: "none", cursor: "pointer", padding: 0 },

  cardList: { display: "flex", flexDirection: "column", gap: 10, padding: "0 24px" },
  bizCard: { background: "var(--card-bg)", borderRadius: 18, padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", borderLeft: "4px solid", boxShadow: "0 2px 16px rgba(44,24,16,0.08)", cursor: "pointer" },
  bizCardLeft: { display: "flex", alignItems: "center", gap: 10 },
  bizEmoji: { width: 44, height: 44, borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 },
  bizName: { fontSize: 14, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 3px" },
  bizCat: { fontSize: 12, color: "var(--text-secondary)", margin: 0, fontWeight: 500 },
  bizCardRight: { alignItems: "flex-end", display: "flex", flexDirection: "column", gap: 6 },
  bizProfit: { fontSize: 14, fontWeight: 800, color: "var(--text-primary)", margin: 0 },
  badge: { fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 20 },

  emptyState: { padding: "40px 0", textAlign: "center" },
  emptyIcon: { fontSize: 40, margin: "0 0 12px" },
  emptyTitle: { fontSize: 16, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 6px" },
  emptySub: { fontSize: 13, color: "var(--text-secondary)", margin: 0 },

  // BIZ SCREEN
  bizHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 24px 10px", flexShrink: 0 },
  backBtn: { fontSize: 22, background: "none", border: "none", cursor: "pointer", color: "var(--text-primary)", padding: 0, fontWeight: 700 },
  iconBtn: { fontSize: 18, background: "none", border: "none", cursor: "pointer", padding: 0 },
  bizHeaderCenter: { display: "flex", alignItems: "center", gap: 8 },
  bizHeaderName: { fontSize: 15, fontWeight: 700, color: "var(--text-primary)", fontFamily: "'Playfair Display',Georgia,serif" },

  bizHero: { margin: "0 24px 16px", borderRadius: 24, padding: "20px", position: "relative", overflow: "hidden" },
  heroOrb: { position: "absolute", top: -30, right: -30, width: 120, height: 120, borderRadius: "50%", background: "rgba(255,255,255,0.12)" },
  heroRow: { display: "flex", justifyContent: "space-between", marginBottom: 16 },
  heroLabel: { fontSize: 10, color: "rgba(255,255,255,0.65)", margin: "0 0 4px", textTransform: "uppercase", letterSpacing: 0.7, fontWeight: 500 },
  heroVal: { fontSize: 16, color: "#FFFFFF", margin: 0, fontWeight: 800, letterSpacing: -0.5 },
  progBg: { height: 5, background: "rgba(255,255,255,0.2)", borderRadius: 99, overflow: "hidden", marginBottom: 7 },
  progFill: { height: "100%", background: "rgba(255,255,255,0.85)", borderRadius: 99 },
  heroSub: { fontSize: 11, color: "rgba(255,255,255,0.6)", margin: 0, fontWeight: 500 },

  tabs: { display: "flex", padding: "0 24px", gap: 8, marginBottom: 14, flexShrink: 0 },
  tab: { flex: 1, padding: "9px 0", borderRadius: 12, border: "none", background: "rgba(44,24,16,0.07)", color: "var(--text-secondary)", fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "'DM Sans',sans-serif" },
  tabActive: { background: "var(--text-primary)", color: "var(--bg-primary)" },
  tabContent: { flex: 1 },
  tabInner: { padding: "0 24px", display: "flex", flexDirection: "column", gap: 12 },

  infoCard: { background: "var(--card-bg)", borderRadius: 16, padding: "14px 16px", borderLeft: "4px solid #8B6914", boxShadow: "0 2px 12px rgba(44,24,16,0.06)" },
  infoLabel: { fontSize: 11, color: "var(--text-secondary)", margin: "0 0 5px", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 },
  infoVal: { fontSize: 17, color: "var(--text-primary)", margin: "0 0 4px", fontWeight: 800, fontFamily: "'Playfair Display',Georgia,serif" },
  infoSub: { fontSize: 12, color: "var(--text-secondary)", margin: "2px 0 0", fontWeight: 500 },

  statsGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 },
  statCard: { background: "var(--card-bg)", borderRadius: 16, padding: "14px", boxShadow: "0 2px 12px rgba(44,24,16,0.06)" },
  statLbl: { fontSize: 11, color: "var(--text-secondary)", margin: "0 0 6px", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4 },
  statVal: { fontSize: 20, fontWeight: 800, color: "var(--text-primary)", margin: 0 },

  dashedBtn: { background: "none", border: "2px dashed #D4B896", borderRadius: 14, padding: "13px", textAlign: "center", color: "var(--accent-color)", fontWeight: 700, fontSize: 14, cursor: "pointer", width: "100%", fontFamily: "'DM Sans',sans-serif" },

  invRow: { background: "var(--card-bg)", borderRadius: 16, padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "flex-start", boxShadow: "0 2px 12px rgba(44,24,16,0.06)" },
  invNameRow: { display: "flex", alignItems: "center", gap: 8, marginBottom: 5 },
  invName: { fontSize: 14, fontWeight: 700, color: "var(--text-primary)", margin: 0 },
  invSub: { fontSize: 12, color: "var(--text-secondary)", margin: "2px 0 0", fontWeight: 500 },
  invProfit: { fontSize: 14, fontWeight: 800, color: "#3A7D2C", margin: 0 },
  lowBadge: { fontSize: 10, fontWeight: 700, background: "#FDECEA", color: "#C0392B", padding: "2px 7px", borderRadius: 99 },
  marginBadge: { fontSize: 11, color: "#3A7D2C", fontWeight: 600, background: "#E8F5E3", padding: "2px 8px", borderRadius: 99 },
  deleteBtn: { fontSize: 12, color: "#C0392B", background: "none", border: "none", cursor: "pointer", padding: "2px 6px", fontWeight: 700 },

  saleRow: { background: "var(--card-bg)", borderRadius: 16, padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", boxShadow: "0 2px 12px rgba(44,24,16,0.06)" },
  saleName: { fontSize: 14, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 4px" },
  saleSub: { fontSize: 12, color: "var(--text-secondary)", margin: 0, fontWeight: 500 },
  saleRev: { fontSize: 14, fontWeight: 800, color: "var(--text-primary)", margin: "0 0 3px" },
  salePft: { fontSize: 12, color: "#3A7D2C", fontWeight: 600 },
  restockBtn: { background: "#F5F0EA", color: "#8B6914", border: "none", padding: "6px 12px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer", marginTop: 8 },

  // ANALYTICS
  analyticsRow: { background: "var(--card-bg)", borderRadius: 16, padding: "14px 16px", display: "flex", alignItems: "center", boxShadow: "0 2px 12px rgba(44,24,16,0.06)" },
  analyticsLeft: { display: "flex", alignItems: "center", gap: 8, width: 130 },
  rankNum: { fontSize: 13, fontWeight: 800, color: "var(--text-secondary)", width: 24 },
  analyticsProfit: { fontSize: 13, fontWeight: 800, color: "var(--text-primary)", margin: 0, whiteSpace: "nowrap" },
  barBg: { height: 8, background: "var(--border-color)", borderRadius: 99, overflow: "hidden" },
  barFill: { height: "100%", borderRadius: 99, transition: "width 0.8s ease" },

  // SETTINGS
  pageHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 24px 16px" },
  pageTitle: { fontSize: 18, fontWeight: 800, color: "var(--text-primary)", margin: 0, fontFamily: "'Playfair Display',Georgia,serif" },

  settingsSection: { marginBottom: 4 },
  settingsSectionTitle: { fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: 0.8, margin: "0 0 8px", paddingLeft: 2 },
  settingsCard: { background: "var(--card-bg)", borderRadius: 18, overflow: "hidden", boxShadow: "0 2px 12px rgba(44,24,16,0.06)" },
  settingsRow: { display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", cursor: "pointer" },
  settingsIcon: { fontSize: 20, width: 32, textAlign: "center" },
  settingsRowLabel: { fontSize: 14, fontWeight: 600, color: "var(--text-primary)", margin: "0 0 2px" },
  settingsRowVal: { fontSize: 13, color: "var(--text-secondary)", margin: 0, fontWeight: 500 },
  settingsRowSub: { fontSize: 12, color: "var(--text-secondary)", margin: 0 },
  settingsDivider: { height: 1, background: "var(--border-color)", margin: "0 16px" },
  chevron: { fontSize: 20, color: "var(--text-secondary)", fontWeight: 300 },
  select: { fontSize: 13, fontWeight: 600, color: "var(--text-primary)", background: "#F5F0EA", border: "none", borderRadius: 8, padding: "6px 10px", cursor: "pointer", fontFamily: "'DM Sans',sans-serif" },

  feedbackCard: { background: "var(--card-bg)", borderRadius: 18, padding: "20px", boxShadow: "0 2px 12px rgba(44,24,16,0.06)" },
  feedbackTitle: { fontSize: 16, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 4px", fontFamily: "'Playfair Display',Georgia,serif" },
  feedbackSub: { fontSize: 13, color: "var(--text-secondary)", margin: "0 0 16px" },
  emojiRow: { display: "flex", justifyContent: "space-between", marginBottom: 16 },
  emojiBtn: { fontSize: 28, background: "none", border: "none", cursor: "pointer", padding: "4px 8px", borderRadius: 12 },
  feedbackInput: { width: "100%", minHeight: 80, borderRadius: 12, border: "1.5px solid var(--border-color)", padding: "10px 12px", fontSize: 13, fontFamily: "'DM Sans',sans-serif", color: "var(--text-primary)", background: "var(--bg-primary)", resize: "none", boxSizing: "border-box", marginBottom: 12, outline: "none" },
  submitBtn: { width: "100%", background: "var(--text-primary)", color: "var(--bg-primary)", border: "none", borderRadius: 14, padding: "14px", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans',sans-serif" },

  // MODALS
  modalOverlay: { position: "absolute", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "flex-end", zIndex: 100 },
  modalSheet: { background: "var(--bg-primary)", borderRadius: "24px 24px 0 0", width: "100%", maxHeight: "90%", overflowY: "auto", paddingBottom: 40 },
  modalHandle: { width: 40, height: 4, background: "#D4B896", borderRadius: 99, margin: "14px auto 4px" },
  modalTitle: { fontSize: 18, fontWeight: 800, color: "var(--text-primary)", margin: "8px 24px 16px", fontFamily: "'Playfair Display',Georgia,serif" },
  modalBody: { padding: "0 24px", display: "flex", flexDirection: "column", gap: 12 },

  fieldLabel: { fontSize: 13, fontWeight: 700, color: "var(--text-secondary)", margin: "4px 0 4px", letterSpacing: 0.2 },
  input: { width: "100%", height: 48, borderRadius: 14, border: "1.5px solid var(--border-color)", padding: "0 14px", fontSize: 14, fontFamily: "'DM Sans',sans-serif", color: "var(--text-primary)", background: "var(--card-bg)", boxSizing: "border-box", outline: "none", appearance: "auto" },

  colorRow: { display: "flex", gap: 14, flexWrap: "wrap" },
  colorDot: { width: 44, height: 44, borderRadius: "50%", border: "none", cursor: "pointer", outlineOffset: 3 },
  emojiGrid: { display: "flex", flexWrap: "wrap", gap: 4 },
  emojiPick: { fontSize: 24, border: "none", cursor: "pointer", padding: "6px", borderRadius: 10, width: 44, height: 44 },

  calcPreview: { background: "#F0FAF0", borderRadius: 14, padding: "12px 16px", border: "1.5px solid #B8E0B0" },
  calcLabel: { fontSize: 13, color: "var(--text-primary)", margin: "2px 0", fontWeight: 500 },

  primaryBtn: { width: "100%", background: "var(--text-primary)", color: "var(--bg-primary)", border: "none", borderRadius: 14, padding: "15px", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans',sans-serif", marginTop: 4 },
  ghostBtn: { width: "100%", background: "transparent", color: "var(--text-secondary)", border: "1.5px solid #D4B896", borderRadius: 14, padding: "14px", fontSize: 15, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans',sans-serif" },

  deleteWarning: { background: "#FDECEA", borderRadius: 16, padding: "20px", textAlign: "center" },
  deleteIcon: { fontSize: 36, margin: "0 0 10px" },
  deleteTitle: { fontSize: 16, fontWeight: 800, color: "#C0392B", margin: "0 0 8px", fontFamily: "'Playfair Display',Georgia,serif" },
  deleteSub: { fontSize: 13, color: "#7B3B35", margin: 0, lineHeight: 1.5 },

  // BOTTOM NAV
  bottomNav: { position: "absolute", bottom: 0, left: 0, right: 0, height: 78, background: "var(--card-bg)", borderTop: "1px solid var(--border-color)", display: "flex", alignItems: "center", justifyContent: "space-around", padding: "0 8px 8px", boxShadow: "0 -8px 32px rgba(44,24,16,0.08)" },
  navItem: { display: "flex", flexDirection: "column", alignItems: "center", gap: 3, background: "none", border: "none", cursor: "pointer", padding: "8px 16px", borderRadius: 16 },
  navActive: { background: "rgba(193,127,90,0.12)" },
  navLabel: { fontSize: 10, color: "var(--text-secondary)", fontWeight: 600, letterSpacing: 0.3 },
  addNavIcon: { color: "var(--accent-color)", fontWeight: 900 },

  toast: { position: "absolute", bottom: 96, left: "50%", transform: "translateX(-50%)", background: "var(--text-primary)", color: "var(--bg-primary)", padding: "12px 24px", borderRadius: 99, fontSize: 14, fontWeight: 600, whiteSpace: "nowrap", boxShadow: "0 8px 32px rgba(0,0,0,0.3)", zIndex: 200 },
  numKey: { width: 64, height: 64, borderRadius: "50%", border: "1.5px solid var(--border-color)", background: "var(--card-bg)", fontSize: 24, fontWeight: 700, color: "var(--text-primary)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", outline: "none" },

  // TIMELINE
  timeline: { display: "flex", flexDirection: "column", gap: 24, paddingLeft: 12, marginTop: 10 },
  updateItem: { display: "flex", gap: 20, position: "relative" },
  timelineLine: { position: "absolute", left: 6, top: 0, bottom: -24, width: 2, background: "var(--border-color)", zIndex: 0 },
  timelineDot: { width: 14, height: 14, borderRadius: "50%", border: "3px solid var(--bg-primary)", position: "relative", zIndex: 1, marginTop: 18, marginLeft: -0.5 },
};
