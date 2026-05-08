import { useState, useEffect, useRef } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { Home, BarChart2, PlusCircle, Settings, Store, Package, Coins, AlertTriangle, ArrowLeft, Trash2, Award, DollarSign, Upload, Cloud, Smartphone, ChevronRight, Download, Share, PlusSquare, X, Lock, Moon, Sun, Shield, TrendingUp, Info, List, History, Sparkles, CheckCircle2, RefreshCw } from "lucide-react";
import { useStore } from "./store/useStore";
import { useRegisterSW } from "virtual:pwa-register/react";
/* ─── INITIAL DATA ─────────────────────────────────────────────────────────── */
const COLORS = ["#C17F5A","#8B6914","#7A9B76","#B85C5C","#5C7A8B","#9B5C8B","#5C8B6E","#8B7A5C"];
const COLOR_NAMES = ["Terracotta","Gold","Sage","Rose","Slate","Plum","Mint","Sand"];
const CATEGORIES = ["Crochet","Jewelry","Beauty","Food","Fashion","Thrift","Accessories","Other"];

const INIT_BUSINESSES = [];

const EMOJIS = ["🧶","📿","🌿","👗","💍","🎀","🛍️","🧴","🍱","👜","🌸","✨","🪡","🧁","💄"];
const VERSION = "v1.4.5";
const BUILD_DATE = "2026.05.08";

const UPDATE_LOG = [
  { version: "v1.4.5", date: "May 8, 2026", title: "About & Updates", changes: ["Added dedicated About section with feature list.", "Integrated Update Log for better transparency.", "Standardized versioning across the app."] },
  { version: "v1.4.3", date: "May 8, 2026", title: "Onboarding & Personas", changes: ["Refined onboarding flow for new users.", "Added premium Persona picker in Account settings.", "Improved local data encryption stability."] },
  { version: "v1.4.1", date: "May 8, 2026", title: "UI Polish", changes: ["Decoupled toast notifications from modals.", "Generalized sale entry labels for craft businesses.", "Fixed layout issues on narrow screens."] },
  { version: "v1.4.0", date: "May 7, 2026", title: "Performance & Security", changes: ["Hardened security logic for PIN lock.", "Optimized PWA installation prompts.", "Audit and fix for critical runtime crashes."] },
  { version: "v1.3.0", date: "Apr 28, 2026", title: "Dark Mode & Charts", changes: ["Full Dark Mode support implemented.", "Enhanced Analytics with interactive Recharts.", "Improved profit margin visualizations."] },
  { version: "v1.2.0", date: "Apr 15, 2026", title: "Security First", changes: ["Added 4-digit PIN protection.", "Implemented SHA-256 hashed recovery key system."] },
  { version: "v1.1.0", date: "Mar 30, 2026", title: "Data Portability", changes: ["Added CSV export for sales and inventory data.", "Improved currency formatting for multiple regions."] },
  { version: "v1.0.0", date: "Mar 19, 2026", title: "Genesis", changes: ["Initial release with multi-business tracking.", "Inventory and basic sales management."] },
];

/* ─── HELPERS ──────────────────────────────────────────────────────────────── */
const fmt = (n) => {
  const activeCurrency = useStore.getState().currency || "XAF";
  return new Intl.NumberFormat("en-US", {
    style: 'currency',
    currency: activeCurrency,
    maximumFractionDigits: 0,
    minimumFractionDigits: 0
  }).format(Math.round(n));
};

const calcBizStats = (biz) => {
  const revenue = biz.sales.reduce((s, sale) => s + sale.revenue, 0);
  const cogs = biz.sales.reduce((s, sale) => s + sale.cost, 0);
  const profit = revenue - cogs;
  const margin = revenue > 0 ? ((profit / revenue) * 100).toFixed(0) : 0;
  return { revenue, cogs, profit, margin };
};
const getStatus = (margin) => {
  if (margin >= 30) return "profitable";
  if (margin >= 10) return "break-even";
  return "losing";
};
const STATUS_STYLE = {
  profitable: { bg: "#E8F5E3", text: "#3A7D2C", label: "Profitable" },
  "break-even": { bg: "#FFF8E1", text: "#8B6914", label: "Break Even" },
  losing: { bg: "#FDECEA", text: "#C0392B", label: "Losing" },
};
const dateLabel = (d) => {
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (d === today) return "Today";
  if (d === yesterday) return "Yesterday";
  return d;
};
const uid = () => Date.now().toString(36) + Math.random().toString(36).substr(2);

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
  if (EMAILJS_CONFIG.PUBLIC_KEY === "YOUR_PUBLIC_KEY" || !EMAILJS_CONFIG.PUBLIC_KEY) {
    console.warn("EmailJS not configured. Simulating email send...");
    alert("SIMULATION: Reset code 000000 sent to " + email);
    return true; 
  }
  
  try {
    const res = await window.emailjs.send(
      EMAILJS_CONFIG.SERVICE_ID,
      EMAILJS_CONFIG.TEMPLATE_ID,
      {
        to_email: email,
        to_name: name,
        reset_code: code,
      },
      EMAILJS_CONFIG.PUBLIC_KEY // Pass key directly for maximum reliability
    );
    
    if (res.status === 200) {
      alert("Verification email sent! Please check your inbox (and Spam folder).");
      return true;
    }
    return false;
  } catch (err) {
    console.error("EmailJS Error:", err);
    alert(`Email failed: ${err.text || err.message || "Unknown error"}`);
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
            <button onClick={handleInstallClick} style={{ background: "#2C1810", color: "#FFF", border: "none", padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
              Install App
            </button>
          </>
        )}
      </div>
    </div>
  );
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

  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [updateProgress, setUpdateProgress] = useState(0);
  const [isUpdating, setIsUpdating] = useState(false);
  
  useEffect(() => {
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      console.log("Install prompt captured!");
    };
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
          
          await reg.update();
          
          if (manual) {
            setUpdateProgress(100);
            setTimeout(() => {
              setUpdateProgress(0);
              if (!reg.waiting && !reg.installing) {
                showToast("App is up to date!");
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
    // Immediate check
    checkUpdates();

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
    };
  }, []);

  const businesses = useStore(s => s.businesses);
  const setBusinesses = useStore(s => s.setBusinesses);

  // Safety Catch for Corrupted State
  if (!businesses || !Array.isArray(businesses)) {
    console.error("State Corruption Detected! Attempting recovery...");
    return <div style={{ background: "#2C1810", height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "white" }}>Loading...</div>;
  }

  const currency = useStore(s => s.currency);
  const setCurrency = useStore(s => s.setCurrency);
  const lowStockThreshold = useStore(s => s.lowStockThreshold);
  const setLowStockThreshold = useStore(s => s.setLowStockThreshold);

  const [screen, setScreen] = useState("home");
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
    setBusinesses([...businesses, { ...data, id: uid(), inventory: [], sales: [] }]);
    showToast("Business added!");
  };

  const deleteBusiness = (id) => {
    setBusinesses(businesses.filter((b) => b.id !== id));
    setScreen("home");
    showToast("Business deleted.");
  };

  const addInventoryItem = (bizId, item) => {
    setBusinesses(businesses.map((b) =>
      b.id === bizId ? { ...b, inventory: [...b.inventory, { ...item, id: uid(), sold: 0 }] } : b
    ));
    showToast("Item added to inventory!");
  };

  const restockInventoryItem = (bizId, itemId, addQty, newCost) => {
    setBusinesses(businesses.map((b) =>
      b.id === bizId ? {
        ...b,
        inventory: b.inventory.map((i) =>
          i.id === itemId ? {
            ...i,
            qty: i.qty + addQty,
            cost: newCost !== null ? newCost : i.cost, // update cost if supplier price changed
          } : i
        )
      } : b
    ));
    showToast("Stock topped up!");
  };

  const deleteInventoryItem = (bizId, itemId) => {
    setBusinesses(businesses.map((b) =>
      b.id === bizId ? { ...b, inventory: b.inventory.filter((i) => i.id !== itemId) } : b
    ));
    showToast("Item removed.");
  };

  const addSale = (bizId, sale) => {
    const biz = businesses.find(b => b.id === bizId);
    if (!biz) return;

    let newSale;
    let newInventory = biz.inventory;

    if (sale.isCustom) {
      newSale = {
        id: uid(),
        itemName: sale.manualName,
        qty: Number(sale.qty) || 1,
        askingPrice: Number(sale.actualPrice),
        actualPrice: Number(sale.actualPrice),
        revenue: Number(sale.actualPrice) * (Number(sale.qty) || 1),
        cost: Number(sale.manualCost) * (Number(sale.qty) || 1),
        discount: 0,
        date: new Date().toISOString().slice(0, 10),
        note: sale.note,
        isCustom: true
      };
    } else {
      const item = biz.inventory.find(i => i.id === sale.itemId);
      if (!item || item.qty < sale.qty) {
        showToast(`Not enough stock for ${item?.name || "item"}`);
        return;
      }
      newSale = {
        id: uid(),
        itemName: item.name,
        qty: sale.qty,
        askingPrice: item.price,
        actualPrice: sale.actualPrice,
        revenue: sale.actualPrice * sale.qty,
        cost: item.cost * sale.qty,
        discount: item.price !== sale.actualPrice ? (item.price - sale.actualPrice) * sale.qty : 0,
        date: new Date().toISOString().slice(0, 10),
        note: sale.note,
      };
      newInventory = biz.inventory.map((i) =>
        i.id === sale.itemId ? { ...i, qty: i.qty - sale.qty, sold: i.sold + sale.qty } : i
      );
    }

    setBusinesses(businesses.map((b) => {
      if (b.id !== bizId) return b;
      return { ...b, sales: [newSale, ...b.sales], inventory: newInventory };
    }));
    showToast("Sale recorded!");
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

  const ctx = { businesses, setBusinesses, screen, setScreen, activeBiz, activeBizId, openBiz, bizTab, setBizTab, modal, setModal, showToast, addBusiness, deleteBusiness, addInventoryItem, restockInventoryItem, restockItemId, setRestockItemId, deleteInventoryItem, addSale, currency, setCurrency, isDarkMode, setIsDarkMode, lowStockThreshold, setLowStockThreshold, userName, setUserName, onboardingComplete, setOnboardingComplete, hasSeenGuide, setHasSeenGuide, isPinEnabled, hashedPin, setHashedPin, hashedRecoveryKey, setHashedRecoveryKey, loginAttempts, setLoginAttempts, lockoutUntil, setLockoutUntil, userEmail, setUserEmail, userAvatar, setUserAvatar, setIsPinEnabled, checkUpdates, updateProgress };

    const [isUnlocked, setIsUnlocked] = useState(false);

  if (!onboardingComplete) return <Onboarding ctx={ctx} deferredPrompt={deferredPrompt} setDeferredPrompt={setDeferredPrompt} />;
  if (isPinEnabled && !isUnlocked) return <PinLock ctx={ctx} onUnlock={() => setIsUnlocked(true)} />;

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
                <h2 style={S.modalTitle}>{isUpdating ? "Installing Update..." : "Update Available ✨"}</h2>
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
  const { businesses, openBiz, setModal, lowStockThreshold, userName, setScreen, userAvatar } = ctx;
  const totalRevenue = businesses.reduce((s, b) => s + calcBizStats(b).revenue, 0);
  const totalProfit = businesses.reduce((s, b) => s + calcBizStats(b).profit, 0);
  const allLowStock = businesses.flatMap((b) =>
    b.inventory.filter((i) => i.qty <= lowStockThreshold).map((i) => ({ ...i, bizName: b.name, bizColor: b.color }))
  );
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <div style={S.screen}>
      <div style={S.homeHeader}>
        <div>
          <p style={S.greeting}>{greeting}, {userName}</p>
          <h1 style={S.userName}>Your Businesses ✨</h1>
        </div>
        <div style={{ ...S.avatar, cursor: "pointer" }} onClick={() => setScreen("account")}>{userAvatar?.startsWith('/') ? <img src={userAvatar} style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover" }} /> : (userAvatar || (userName || "B")[0])}</div>
      </div>

      {/* SUMMARY CARD */}
      <div id="home-summary" style={S.summaryCard}>
        <div style={S.summaryOrb} />
        <p style={S.summaryLabel}>Total Profit This Month</p>
        <h2 style={S.summaryAmount}>{fmt(totalProfit)}</h2>
        <div style={S.summaryRow}>
          <div>
            <p style={S.summarySubLabel}>Revenue</p>
            <p style={S.summarySubVal}>{fmt(totalRevenue)}</p>
          </div>
          <div style={S.summaryDivider} />
          <div>
            <p style={S.summarySubLabel}>Businesses</p>
            <p style={S.summarySubVal}>{businesses.length} active</p>
          </div>
          <div style={S.summaryDivider} />
          <div>
            <p style={S.summarySubLabel}>Margin</p>
            <p style={S.summarySubVal}>{totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100).toFixed(0) : 0}%</p>
          </div>
        </div>
      </div>

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
            <div style={S.emptyIcon}><Store size={40} color="#2C1810" strokeWidth={1.5} /></div>
            <p style={S.emptyTitle}>No businesses yet</p>
            <p style={S.emptySub}>Tap "+ Add New" to get started</p>
          </div>
        )}
        {businesses.map((biz) => {
          const stats = calcBizStats(biz);
          const status = getStatus(Number(stats.margin));
          const ss = STATUS_STYLE[status];
          return (
            <div key={biz.id} style={{ ...S.bizCard, borderLeftColor: biz.color }} onClick={() => openBiz(biz.id)}>
              <div style={S.bizCardLeft}>
                <div style={{ ...S.bizEmoji, background: biz.color + "22" }}>{biz.emoji}</div>
                <div>
                  <p style={S.bizName}>{biz.name}</p>
                  <p style={S.bizCat}>{biz.category} · {biz.inventory.length} items</p>
                </div>
              </div>
              <div style={S.bizCardRight}>
                <p style={S.bizProfit}>{fmt(stats.profit)}</p>
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

  return (
    <div style={S.screen}>
      <div style={S.bizHeader}>
        <button style={S.backBtn} onClick={() => setScreen("home")}><ArrowLeft size={22} /></button>
        <div style={S.bizHeaderCenter}>
          <span style={{ fontSize: 18 }}>{activeBiz.emoji}</span>
          <span style={S.bizHeaderName}>{activeBiz.name}</span>
        </div>
        <button style={S.iconBtn} onClick={() => setModal("delete-biz")}><Trash2 size={20} color="#2C1810" /></button>
      </div>

      {/* HERO */}
      <div style={{ ...S.bizHero, background: activeBiz.color }}>
        <div style={S.heroOrb} />
        <div style={S.heroRow}>
          <div>
            <p style={S.heroLabel}>Revenue</p>
            <p style={S.heroVal}>{fmt(stats.revenue)}</p>
          </div>
          <div>
            <p style={S.heroLabel}>Profit</p>
            <p style={S.heroVal}>{fmt(stats.profit)}</p>
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
        {bizTab === "overview" && <OverviewTab biz={activeBiz} stats={stats} lowStockThreshold={lowStockThreshold} setModal={setModal} />}
        {bizTab === "inventory" && <InventoryTab biz={activeBiz} setModal={setModal} deleteInventoryItem={deleteInventoryItem} setRestockItemId={setRestockItemId} />}
        {bizTab === "sales" && <SalesTab biz={activeBiz} setModal={setModal} />}
      </div>
    </div>
  );
}

function OverviewTab({ biz, stats, lowStockThreshold, setModal }) {
  const best = [...biz.inventory].sort((a, b) => b.sold - a.sold)[0];
  const lowStock = biz.inventory.filter((i) => i.qty <= lowStockThreshold);
  const recentSales = biz.sales.slice(0, 3);
  return (
    <div style={S.tabInner}>
      {best && (
        <div style={S.infoCard}>
          <p style={{...S.infoLabel, display:"flex", alignItems:"center", gap:6}}><Award size={14} color="#8B6914"/> Best Seller</p>
          <p style={S.infoVal}>{best.name}</p>
          <p style={S.infoSub}>{best.sold} units sold · {fmt(best.price)} each · {(((best.price - best.cost) / best.price) * 100).toFixed(0)}% margin</p>
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
          <p style={S.statVal}>{biz.sales.length}</p>
        </div>
        <div style={S.statCard}>
          <p style={S.statLbl}>Units Sold</p>
          <p style={S.statVal}>{biz.inventory.reduce((s, i) => s + i.sold, 0)}</p>
        </div>
        <div style={S.statCard}>
          <p style={S.statLbl}>Revenue</p>
          <p style={{ ...S.statVal, fontSize: 13 }}>{fmt(stats.revenue)}</p>
        </div>
        <div style={S.statCard}>
          <p style={S.statLbl}>COGS</p>
          <p style={{ ...S.statVal, fontSize: 13 }}>{fmt(stats.cogs)}</p>
        </div>
      </div>
      {recentSales.length > 0 && (
        <>
          <p style={S.sectionLabel}>Recent Sales</p>
          {recentSales.map((s) => (
            <div key={s.id} style={S.saleRow}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <p style={S.saleName}>{s.itemName}</p>
                  {s.isCustom && <span style={{ fontSize: 9, fontWeight: 800, color: "#8B6914", background: "#F5F0EA", padding: "1px 5px", borderRadius: 4, textTransform: "uppercase" }}>Custom ✨</span>}
                </div>
                <p style={S.saleSub}>{s.qty} {s.qty > 1 ? "units" : "unit"} · {dateLabel(s.date)}</p>
              </div>
              <div style={{ textAlign: "right" }}>
                <p style={S.saleRev}>{fmt(s.revenue)}</p>
                <p style={S.salePft}>+{fmt(s.revenue - s.cost)}</p>
              </div>
            </div>
          ))}
        </>
      )}
      <div style={{ height: 8 }} />
    </div>
  );
}

function InventoryTab({ biz, setModal, deleteInventoryItem, setRestockItemId }) {
  return (
    <div style={S.tabInner}>
      <button style={S.dashedBtn} onClick={() => setModal("addItem")}>+ Add New Item</button>
      {biz.inventory.length === 0 && (
        <div style={S.emptyState}>
          <div style={S.emptyIcon}><Package size={40} color="#2C1810" strokeWidth={1.5} /></div>
          <p style={S.emptyTitle}>No items yet</p>
          <p style={S.emptySub}>Add your first product above</p>
        </div>
      )}
      {biz.inventory.map((item) => {
        const margin = (((item.price - item.cost) / item.price) * 100).toFixed(0);
        const profit = item.price - item.cost;
        return (
          <div key={item.id} style={S.invRow}>
            <div style={{ flex: 1 }}>
              <div style={S.invNameRow}>
                <p style={S.invName}>{item.name}</p>
                {item.qty <= 3 && <span style={S.lowBadge}>Low</span>}
              </div>
              <p style={S.invSub}>Cost: {fmt(item.cost)} · Asking: {fmt(item.price)}</p>
              <p style={S.invSub}>{item.qty} in stock · {item.sold} sold</p>
              {/* RESTOCK BUTTON */}
              <button
                style={S.restockBtn}
                onClick={() => { setRestockItemId(item.id); setModal("restock"); }}
              >+ Restock</button>
            </div>
            <div style={{ alignItems: "flex-end", display: "flex", flexDirection: "column", gap: 6 }}>
              <p style={S.invProfit}>+{fmt(profit)}/unit</p>
              <span style={S.marginBadge}>{margin}%</span>
              <button style={S.deleteBtn} onClick={() => deleteInventoryItem(biz.id, item.id)}>✕</button>
            </div>
          </div>
        );
      })}
      <div style={{ height: 8 }} />
    </div>
  );
}

function SalesTab({ biz, setModal }) {
  const totalRev = biz.sales.reduce((s, x) => s + x.revenue, 0);
  const totalPft = biz.sales.reduce((s, x) => s + (x.revenue - x.cost), 0);
  return (
    <div style={S.tabInner}>
      <button style={S.dashedBtn} onClick={() => setModal("addSale")}>+ Record New Sale</button>
      {biz.sales.length > 0 && (
        <div style={{ ...S.infoCard, background: "#F0FAF0" }}>
          <p style={S.infoLabel}>All Time</p>
          <p style={S.infoSub}>Revenue: {fmt(totalRev)} · Profit: {fmt(totalPft)}</p>
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
            <p style={S.saleSub}>{sale.qty} {sale.qty > 1 ? "units" : "unit"} · {dateLabel(sale.date)}{sale.note ? ` · ${sale.note}` : ""}</p>
          </div>
          <div style={{ textAlign: "right" }}>
            <p style={S.saleRev}>{fmt(sale.revenue)}</p>
            <p style={S.salePft}>+{fmt(sale.revenue - sale.cost)}</p>
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
  const totalRev = sorted.reduce((s, b) => s + b.stats.revenue, 0);
  const totalPft = sorted.reduce((s, b) => s + b.stats.profit, 0);
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
          <h2 style={S.summaryAmount}>{fmt(totalRev)}</h2>
          <div style={S.summaryRow}>
            <div>
              <p style={S.summarySubLabel}>Profit</p>
              <p style={S.summarySubVal}>{fmt(totalPft)}</p>
            </div>
            <div style={S.summaryDivider} />
            <div>
              <p style={S.summarySubLabel}>Avg Margin</p>
              <p style={S.summarySubVal}>{totalRev > 0 ? ((totalPft / totalRev) * 100).toFixed(0) : 0}%</p>
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
        {businesses.flatMap((b) => b.inventory.map((i) => ({ ...i, bizName: b.name, bizColor: b.color, margin: (((i.price - i.cost) / i.price) * 100).toFixed(0) }))).sort((a, b) => b.sold - a.sold).slice(0, 5).map((item, i) => (
          <div key={i} style={S.invRow}>
            <div style={{ flex: 1 }}>
              <p style={S.invName}>{item.name}</p>
              <p style={S.invSub}>{item.bizName} · {item.sold} sold · {item.margin}% margin</p>
            </div>
            <p style={S.invProfit}>{fmt(item.price * item.sold)}</p>
          </div>
        ))}
        <div style={{ height: 16 }} />
      </div>
    </div>
  );
}

/* ─── SETTINGS SCREEN ───────────────────────────────────────────────────────── */
function SettingsScreen({ ctx }) {
  const { setScreen, currency, setCurrency, lowStockThreshold, setLowStockThreshold, showToast, userName, setUserName, userAvatar, isDarkMode, setIsDarkMode } = ctx;
  const currencies = ["XAF","NGN","GHS","KES","USD","EUR"];

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
              const rows = [["Business", "Item", "Qty Sold", "Revenue", "Cost", "Profit", "Date", "Note"]];
              businesses.forEach(b => {
                b.sales.forEach(s => {
                  rows.push([b.name, s.itemName, s.qty, s.revenue, s.cost, s.revenue - s.cost, s.date, s.note || ""]);
                });
              });
              const csvContent = "data:text/csv;charset=utf-8," + rows.map(e => e.join(",")).join("\n");
              const encodedUri = encodeURI(csvContent);
              const link = document.createElement("a");
              link.setAttribute("href", encodedUri);
              link.setAttribute("download", `biztrack_export_${new Date().toISOString().slice(0,10)}.csv`);
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
              showToast("Exported to CSV!");
            }}>
              <Upload size={20} color="#9B7B5E" />
              <div style={{ flex: 1 }}>
                <p style={S.settingsRowLabel}>Export as CSV</p>
                <p style={S.settingsRowSub}>Download all your data</p>
              </div>
              <ChevronRight size={20} color="#9B7B5E" />
            </div>
            <div style={S.settingsDivider} />
            <div style={S.settingsRow} onClick={() => showToast("Cloud sync coming in v2!")}>
              <Cloud size={20} color="#9B7B5E" />
              <div style={{ flex: 1 }}>
                <p style={S.settingsRowLabel}>Cloud Backup</p>
                <p style={S.settingsRowSub}>Sync across devices (v2)</p>
              </div>
              <span style={{ ...S.settingsRowSub, color: "var(--accent-color)", fontWeight:700 }}>Soon</span>
            </div>
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
  const [email, setEmail] = useState("");
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
  const { setModal, activeBizId, addInventoryItem } = ctx;
  const [name, setName] = useState("");
  const [qty, setQty] = useState("");
  const [cost, setCost] = useState("");
  const [price, setPrice] = useState("");

  const margin = cost && price ? (((Number(price) - Number(cost)) / Number(price)) * 100).toFixed(0) : null;
  const profit = cost && price ? Number(price) - Number(cost) : null;

  const submit = () => {
    if (!name.trim() || !qty || !cost || !price) return;
    addInventoryItem(activeBizId, { name: name.trim(), qty: Number(qty), cost: Number(cost), price: Number(price) });
    setModal(null);
  };

  return (
    <ModalShell onClose={() => setModal(null)} title="Add Inventory Item">
      <div style={S.modalBody}>
        <p style={S.fieldLabel}>Item Name</p>
        <input style={S.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Bucket Hat" />

        <p style={S.fieldLabel}>Quantity Purchased</p>
        <input style={S.input} type="number" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="e.g. 20" />

        <div style={{ display: "flex", gap: 12 }}>
          <div style={{ flex: 1 }}>
            <p style={S.fieldLabel}>Cost per Unit (XAF)</p>
            <input style={S.input} type="number" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="e.g. 1500" />
          </div>
          <div style={{ flex: 1 }}>
            <p style={S.fieldLabel}>Selling Price (XAF)</p>
            <input style={S.input} type="number" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="e.g. 4500" />
          </div>
        </div>

        {margin !== null && (
          <div style={S.calcPreview}>
            <p style={S.calcLabel}>Profit per unit: <strong>{fmt(profit)}</strong></p>
            <p style={S.calcLabel}>Margin: <strong style={{ color: Number(margin) >= 30 ? "#3A7D2C" : "#C0392B" }}>{margin}%</strong></p>
          </div>
        )}

        <button style={S.primaryBtn} onClick={submit}>Add to Inventory</button>
      </div>
    </ModalShell>
  );
}

function RestockModal({ ctx }) {
  const { setModal, activeBiz, restockItemId, restockInventoryItem, setRestockItemId } = ctx;
  const item = activeBiz?.inventory.find((i) => i.id === restockItemId);
  const [qty, setQty] = useState("");
  const [cost, setCost] = useState(item ? item.cost : "");

  const submit = () => {
    if (!item || !qty) return;
    restockInventoryItem(activeBiz.id, item.id, Number(qty), cost ? Number(cost) : null);
    setRestockItemId(null);
    setModal(null);
  };

  return (
    <ModalShell onClose={() => { setRestockItemId(null); setModal(null); }} title="Restock Item">
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
            <input style={S.input} type="number" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="e.g. 10" />

            <p style={S.fieldLabel}>Updated Cost per Unit (optional)</p>
            <input style={S.input} type="number" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="Leave blank to keep current cost" />

            <button style={S.primaryBtn} onClick={submit}>Restock Item</button>
          </>
        )}
      </div>
    </ModalShell>
  );
}

function AddSaleModal({ ctx }) {
  const { setModal, activeBiz, addSale } = ctx;
  const [tab, setTab] = useState("inventory"); // "inventory" | "custom"
  const [itemId, setItemId] = useState(activeBiz?.inventory[0]?.id || "");
  const [qty, setQty] = useState("1");
  const [actualPrice, setActualPrice] = useState("");
  const [note, setNote] = useState("");
  
  // Custom sale fields
  const [manualName, setManualName] = useState("");
  const [materialCost, setMaterialCost] = useState("");
  const [laborCost, setLaborCost] = useState("");

  const selectedItem = activeBiz?.inventory.find((i) => i.id === Number(itemId));

  const handleItemChange = (e) => {
    setItemId(e.target.value);
    const item = activeBiz?.inventory.find((i) => i.id === Number(e.target.value));
    if (item) setActualPrice(String(item.price));
  };

  useEffect(() => {
    if (tab === "inventory" && selectedItem && !actualPrice) {
      setActualPrice(String(selectedItem.price));
    }
  }, [tab, selectedItem]);

  const soldBelow = tab === "inventory" && selectedItem && actualPrice && Number(actualPrice) < selectedItem.price;
  const soldAbove = tab === "inventory" && selectedItem && actualPrice && Number(actualPrice) > selectedItem.price;

  const totalManualCost = Number(materialCost || 0) + Number(laborCost || 0);

  const preview = tab === "inventory" 
    ? (selectedItem && qty && actualPrice ? {
        revenue: Number(actualPrice) * Number(qty),
        profit: (Number(actualPrice) - selectedItem.cost) * Number(qty),
        discount: soldBelow ? (selectedItem.price - Number(actualPrice)) * Number(qty) : 0,
      } : null)
    : (manualName && actualPrice ? {
        revenue: Number(actualPrice) * Number(qty || 1),
        profit: (Number(actualPrice) - totalManualCost) * Number(qty || 1),
        discount: 0
      } : null);

  const submit = () => {
    if (tab === "inventory") {
      if (!itemId || !qty || !actualPrice) return;
      addSale(activeBiz.id, { itemId: Number(itemId), qty: Number(qty), actualPrice: Number(actualPrice), note, isCustom: false });
    } else {
      if (!manualName || !actualPrice) return;
      addSale(activeBiz.id, { 
        isCustom: true, 
        manualName, 
        manualCost: totalManualCost, 
        actualPrice: Number(actualPrice), 
        qty: Number(qty) || 1, 
        note 
      });
    }
    setModal(null);
  };
  const isInventoryEmpty = tab === "inventory" && activeBiz?.inventory.length === 0;

  return (
    <ModalShell onClose={() => setModal(null)} title="Record Sale">
      <div style={S.modalBody}>
        {/* TAB SWITCHER */}
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
          activeBiz?.inventory.length === 0 ? (
            <div style={S.emptyState}>
              <div style={S.emptyIcon}><Package size={40} color="#2C1810" strokeWidth={1.5} /></div>
              <p style={S.emptyTitle}>No items in inventory</p>
              <p style={S.emptySub}>Switch to "Custom Entry" or add items first.</p>
            </div>
          ) : (
            <>
              <p style={S.fieldLabel}>Select Item</p>
              <select style={S.input} value={itemId} onChange={handleItemChange}>
                {activeBiz.inventory.map((i) => (
                  <option key={i.id} value={i.id}>{i.name} ({i.qty} in stock)</option>
                ))}
              </select>
              
              <p style={S.fieldLabel}>Quantity Sold</p>
              <input style={S.input} type="number" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="1" />
              
              <p style={S.fieldLabel}>Actual Selling Price (XAF)</p>
              <input
                style={{ ...S.input, borderColor: soldBelow ? "#E67E22" : soldAbove ? "#3A7D2C" : "#E0D6C8" }}
                type="number"
                value={actualPrice}
                onChange={(e) => setActualPrice(e.target.value)}
                placeholder="Price paid by customer"
              />
              
              {preview && (
                <div style={S.calcPreview}>
                  <p style={S.calcLabel}>Revenue: <strong>{fmt(preview.revenue)}</strong></p>
                  <p style={S.calcLabel}>Profit: <strong style={{ color: preview.profit >= 0 ? "#3A7D2C" : "#C0392B" }}>{preview.profit >= 0 ? "+" : ""}{fmt(preview.profit)}</strong></p>
                </div>
              )}
            </>
          )
        ) : (
          <>
            <p style={S.fieldLabel}>Custom Item Name</p>
            <input style={S.input} value={manualName} onChange={(e) => setManualName(e.target.value)} placeholder="e.g. Custom Crochet Beanie" />
            
            <p style={S.fieldLabel}>Price Paid by Customer (XAF)</p>
            <input style={S.input} type="number" value={actualPrice} onChange={(e) => setActualPrice(e.target.value)} placeholder="0" />
            
            <div style={{ display: "flex", gap: 12 }}>
              <div style={{ flex: 1 }}>
                <p style={S.fieldLabel}>Material / Base Cost</p>
                <input style={S.input} type="number" value={materialCost} onChange={(e) => setMaterialCost(e.target.value)} placeholder="0" />
              </div>
              <div style={{ flex: 1 }}>
                <p style={S.fieldLabel}>Labor Cost</p>
                <input style={S.input} type="number" value={laborCost} onChange={(e) => setLaborCost(e.target.value)} placeholder="0" />
              </div>
            </div>
            
            {totalManualCost > 0 && (
               <p style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: -8, textAlign: "right" }}>
                 Total cost: {fmt(totalManualCost)}
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
                <p style={S.calcLabel}>Total Revenue: <strong>{fmt(preview.revenue)}</strong></p>
                <p style={S.calcLabel}>Net Profit: <strong style={{ color: preview.profit >= 0 ? "#3A7D2C" : "#C0392B" }}>{preview.profit >= 0 ? "+" : ""}{fmt(preview.profit)}</strong></p>
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
      <style>{`
        @keyframes toastIn {
          from { opacity: 0; transform: translateY(20px) scale(0.9); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .spin { animation: spin 1s linear infinite; }
      `}</style>
    </div>
  );
}

/* ─── BOTTOM NAV ────────────────────────────────────────────────────────────── */
/* ─── BOTTOM NAV ────────────────────────────────────────────────────────────── */
function BottomNav({ ctx }) {
  const { screen, setScreen, setModal } = ctx;
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
    { icon: <Lock size={20} />, title: "Secure & Private", desc: "Your data stays on your device. Protected by industrial-grade PIN encryption." },
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
  const { businesses, setBusinesses, userName, userEmail, setUserName, setUserEmail, setOnboardingComplete, currency, setCurrency, lowStockThreshold, setLowStockThreshold } = ctx;
  const [step, setStep] = useState(0);
  const [showImport, setShowImport] = useState(false);
  const [importData, setImportData] = useState("");
  
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
    const data = { businesses, userName, userEmail, currency, lowStockThreshold };
    navigator.clipboard.writeText(JSON.stringify(data));
    alert("Data copied to clipboard! Now open the Installed App and paste it there.");
  };

  const handleImport = () => {
    try {
      const data = JSON.parse(importData);
      if (data.businesses) setBusinesses(data.businesses);
      if (data.userName) setUserName(data.userName);
      if (data.userEmail) setUserEmail(data.userEmail);
      if (data.currency) setCurrency(data.currency);
      if (data.lowStockThreshold) setLowStockThreshold(data.lowStockThreshold);
      alert("Data imported successfully!");
      setShowImport(false);
    } catch (e) {
      alert("Invalid backup code.");
    }
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
                onClick={() => setShowImport(!showImport)}
              >
                Already have data? Transfer or Restore
              </button>

              {showImport && (
                <div style={{ display: "flex", gap: 8, animation: "fadeIn 0.3s ease" }}>
                  <button 
                    style={{ ...S.ghostBtn, flex: 1, fontSize: 12, padding: "10px", borderColor: "rgba(255,255,255,0.2)", color: "rgba(255,255,255,0.6)" }} 
                    onClick={handleExport}
                  >Export Code</button>
                  <button 
                    style={{ ...S.ghostBtn, flex: 1, fontSize: 12, padding: "10px", borderColor: "rgba(255,255,255,0.2)", color: "rgba(255,255,255,0.6)" }} 
                    onClick={() => {
                      const code = prompt("Paste your backup code:");
                      if (code) { setImportData(code); handleImport(); }
                    }}
                  >Paste Code</button>
                </div>
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
    if (!userEmail) {
      alert("No email address found in your profile. Please use your Recovery Key.");
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
            <div key={i} style={{ width: 16, height: 16, borderRadius: "50%", background: input.length > i ? "#2C1810" : "#E0D6C8", border: isLockedOut ? "1px solid #C0392B" : "none" }} />
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
          <button 
            style={{ ...S.textBtn, color: "var(--accent-color)", padding: 10 }} 
            onClick={handleEmailReset}
            disabled={isSending}
          >
            {isSending ? "Sending code..." : "Forgot PIN? Reset via Email"}
          </button>
          <button 
            style={{ ...S.textBtn, fontSize: 11, opacity: 0.6 }} 
            onClick={() => setRecoveryMode('key')}
          >
            Or use Recovery Key
          </button>
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
  const { setScreen, userName, setUserName, businesses, userEmail, setUserEmail, showToast, userAvatar, setUserAvatar, isPinEnabled } = ctx;
  const joinDate = useStore(s => s.joinDate);
  const formattedDate = new Date(joinDate).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  
  const totalRevenue = businesses.reduce((acc, b) => acc + b.sales.reduce((s, sale) => s + sale.revenue, 0), 0);
  const totalProfit = businesses.reduce((acc, b) => acc + b.sales.reduce((s, sale) => s + (sale.revenue - sale.cost), 0), 0);
  
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
            <p style={S.statVal}>{fmt(totalRevenue)}</p>
          </div>
          <div style={S.statCard}>
            <p style={S.statLbl}>Lifetime Profit</p>
            <p style={{ ...S.statVal, color: "#3A7D2C" }}>{fmt(totalProfit)}</p>
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
             <div style={S.settingsRow} onClick={() => {
               const data = { businesses, userName, userEmail: ctx.userEmail, currency: ctx.currency, lowStockThreshold: ctx.lowStockThreshold };
               navigator.clipboard.writeText(JSON.stringify(data));
               showToast("Data copied to clipboard!");
             }}>
               <Download size={20} color="#3A7D2C" />
               <div style={{ flex: 1 }}>
                 <p style={S.settingsRowLabel}>Backup Data</p>
                 <p style={S.settingsRowSub}>Copy your data to move to another device.</p>
               </div>
             </div>
             <div style={S.settingsDivider} />
             <div style={S.settingsRow} onClick={() => {
               const code = prompt("Paste your backup code here:");
               if (!code) return;
               try {
                 const data = JSON.parse(code);
                 if (data.businesses) ctx.setBusinesses(data.businesses);
                 if (data.userName) ctx.setUserName(data.userName);
                 if (data.userEmail) ctx.setUserEmail(data.userEmail);
                 showToast("Data restored!");
               } catch (e) {
                 alert("Invalid backup code.");
               }
             }}>
               <Upload size={20} color="#8B6914" />
               <div style={{ flex: 1 }}>
                 <p style={S.settingsRowLabel}>Restore Data</p>
                 <p style={S.settingsRowSub}>Import data from a backup code.</p>
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
            if (confirm("🚨 FACTORY RESET: This will permanently delete all businesses, sales, and inventory data. This cannot be undone. Continue?")) {
              localStorage.clear();
              window.location.reload();
            }
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
  summaryAmount: { fontSize: 28, color: "var(--bg-primary)", margin: "0 0 18px", fontFamily: "'Playfair Display',Georgia,serif", fontWeight: 700, letterSpacing: -1 },
  summaryRow: { display: "flex", alignItems: "center", gap: 16 },
  summaryDivider: { width: 1, height: 28, background: "rgba(255,255,255,0.2)" },
  summarySubLabel: { fontSize: 11, color: "rgba(255,255,255,0.8)", margin: "0 0 3px", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600 },
  summarySubVal: { fontSize: 16, color: "var(--bg-primary)", margin: 0, fontWeight: 700 },

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
  tabActive: { background: "#2C1810", color: "var(--bg-primary)" },
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
  submitBtn: { width: "100%", background: "#2C1810", color: "var(--bg-primary)", border: "none", borderRadius: 14, padding: "14px", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans',sans-serif" },

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

  primaryBtn: { width: "100%", background: "#2C1810", color: "var(--bg-primary)", border: "none", borderRadius: 14, padding: "15px", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans',sans-serif", marginTop: 4 },
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

  toast: { position: "absolute", bottom: 96, left: "50%", transform: "translateX(-50%)", background: "#2C1810", color: "var(--bg-primary)", padding: "12px 24px", borderRadius: 99, fontSize: 14, fontWeight: 600, whiteSpace: "nowrap", boxShadow: "0 8px 32px rgba(0,0,0,0.3)", zIndex: 200 },
  numKey: { width: 64, height: 64, borderRadius: "50%", border: "1.5px solid var(--border-color)", background: "var(--card-bg)", fontSize: 24, fontWeight: 700, color: "var(--text-primary)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", outline: "none" },

  // TIMELINE
  timeline: { display: "flex", flexDirection: "column", gap: 24, paddingLeft: 12, marginTop: 10 },
  updateItem: { display: "flex", gap: 20, position: "relative" },
  timelineLine: { position: "absolute", left: 6, top: 0, bottom: -24, width: 2, background: "var(--border-color)", zIndex: 0 },
  timelineDot: { width: 14, height: 14, borderRadius: "50%", border: "3px solid var(--bg-primary)", position: "relative", zIndex: 1, marginTop: 18, marginLeft: -0.5 },
};
