import { useState } from "react";

/* ─── INITIAL DATA ─────────────────────────────────────────────────────────── */
const COLORS = ["#C17F5A","#8B6914","#7A9B76","#B85C5C","#5C7A8B","#9B5C8B","#5C8B6E","#8B7A5C"];
const COLOR_NAMES = ["Terracotta","Gold","Sage","Rose","Slate","Plum","Mint","Sand"];
const CATEGORIES = ["Crochet","Jewelry","Beauty","Food","Fashion","Thrift","Accessories","Other"];

const INIT_BUSINESSES = [
  {
    id: 1, name: "Crochet by Sabi", category: "Crochet", color: "#C17F5A", emoji: "🧶",
    inventory: [
      { id: 1, name: "Bucket Hat", qty: 8, cost: 1500, price: 4500, sold: 14 },
      { id: 2, name: "Crop Top", qty: 3, cost: 2500, price: 7000, sold: 9 },
      { id: 3, name: "Tote Bag", qty: 11, cost: 1200, price: 3500, sold: 6 },
    ],
    sales: [
      { id: 1, itemName: "Bucket Hat", qty: 2, revenue: 9000, cost: 3000, date: "2024-05-06" },
      { id: 2, itemName: "Crop Top", qty: 1, revenue: 7000, cost: 2500, date: "2024-05-05" },
      { id: 3, itemName: "Tote Bag", qty: 3, revenue: 10500, cost: 3600, date: "2024-05-03" },
    ],
  },
  {
    id: 2, name: "Adé Jewelry", category: "Jewelry", color: "#8B6914", emoji: "📿",
    inventory: [
      { id: 1, name: "Cowrie Necklace", qty: 15, cost: 800, price: 3500, sold: 22 },
      { id: 2, name: "Gold Waist Chain", qty: 6, cost: 2000, price: 6500, sold: 11 },
      { id: 3, name: "Ear Cuffs Set", qty: 2, cost: 500, price: 2000, sold: 18 },
    ],
    sales: [
      { id: 1, itemName: "Cowrie Necklace", qty: 3, revenue: 10500, cost: 2400, date: "2024-05-06" },
      { id: 2, itemName: "Gold Waist Chain", qty: 1, revenue: 6500, cost: 2000, date: "2024-05-04" },
    ],
  },
  {
    id: 3, name: "Bloom Skincare", category: "Beauty", color: "#7A9B76", emoji: "🌿",
    inventory: [
      { id: 1, name: "Shea Body Butter", qty: 20, cost: 800, price: 2500, sold: 14 },
      { id: 2, name: "Rosehip Oil", qty: 7, cost: 1500, price: 4000, sold: 8 },
    ],
    sales: [
      { id: 1, itemName: "Shea Body Butter", qty: 5, revenue: 12500, cost: 4000, date: "2024-05-06" },
    ],
  },
];

const EMOJIS = ["🧶","📿","🌿","👗","💍","🎀","🛍️","🧴","🍱","👜","🌸","✨","🪡","🧁","💄"];

/* ─── HELPERS ──────────────────────────────────────────────────────────────── */
const fmt = (n) => new Intl.NumberFormat("fr-CM").format(Math.round(n)) + " XAF";
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
let nextId = 100;
const uid = () => ++nextId;

/* ─── ROOT ─────────────────────────────────────────────────────────────────── */
export default function BizTrack() {
  const [businesses, setBusinesses] = useState(INIT_BUSINESSES);
  const [screen, setScreen] = useState("home");
  const [activeBizId, setActiveBizId] = useState(null);
  const [bizTab, setBizTab] = useState("overview");
  const [modal, setModal] = useState(null); // null | "addBiz" | "addItem" | "restock" | "addSale" | "editBiz" | "deleteBiz" | "toast"
  const [restockItemId, setRestockItemId] = useState(null);
  const [toast, setToast] = useState("");
  const [currency, setCurrency] = useState("XAF");
  const [theme] = useState("light");
  const [lowStockThreshold, setLowStockThreshold] = useState(3);

  const activeBiz = businesses.find((b) => b.id === activeBizId) || null;

  const showToast = (msg) => {
    setToast(msg);
    setModal("toast");
    setTimeout(() => setModal(null), 2000);
  };

  const openBiz = (id) => { setActiveBizId(id); setBizTab("overview"); setScreen("business"); };

  const addBusiness = (data) => {
    setBusinesses((prev) => [...prev, { ...data, id: uid(), inventory: [], sales: [] }]);
    showToast("Business added!");
  };

  const deleteBusiness = (id) => {
    setBusinesses((prev) => prev.filter((b) => b.id !== id));
    setScreen("home");
    showToast("Business deleted.");
  };

  const addInventoryItem = (bizId, item) => {
    setBusinesses((prev) => prev.map((b) =>
      b.id === bizId ? { ...b, inventory: [...b.inventory, { ...item, id: uid(), sold: 0 }] } : b
    ));
    showToast("Item added to inventory!");
  };

  const restockInventoryItem = (bizId, itemId, addQty, newCost) => {
    setBusinesses((prev) => prev.map((b) =>
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
    setBusinesses((prev) => prev.map((b) =>
      b.id === bizId ? { ...b, inventory: b.inventory.filter((i) => i.id !== itemId) } : b
    ));
    showToast("Item removed.");
  };

  const addSale = (bizId, sale) => {
    setBusinesses((prev) => prev.map((b) => {
      if (b.id !== bizId) return b;
      const item = b.inventory.find((i) => i.id === sale.itemId);
      if (!item) return b;
      const actualPrice = sale.actualPrice; // real price she sold it for
      const newSale = {
        id: uid(),
        itemName: item.name,
        qty: sale.qty,
        askingPrice: item.price,         // what she intended to sell for
        actualPrice: actualPrice,         // what she actually sold for
        revenue: actualPrice * sale.qty,  // based on actual price
        cost: item.cost * sale.qty,
        discount: item.price !== actualPrice ? (item.price - actualPrice) * sale.qty : 0,
        date: new Date().toISOString().slice(0, 10),
        note: sale.note,
      };
      const newInventory = b.inventory.map((i) =>
        i.id === sale.itemId ? { ...i, qty: Math.max(0, i.qty - sale.qty), sold: i.sold + sale.qty } : i
      );
      return { ...b, sales: [newSale, ...b.sales], inventory: newInventory };
    }));
    showToast("Sale recorded!");
  };

  const ctx = { businesses, setBusinesses, screen, setScreen, activeBiz, activeBizId, openBiz, bizTab, setBizTab, modal, setModal, showToast, addBusiness, deleteBusiness, addInventoryItem, restockInventoryItem, restockItemId, setRestockItemId, deleteInventoryItem, addSale, currency, setCurrency, theme, lowStockThreshold, setLowStockThreshold };

  return (
    <div style={S.shell}>
      <div style={S.phone}>
        <StatusBar />
        <div style={S.screenWrap}>
          {screen === "home" && <HomeScreen ctx={ctx} />}
          {screen === "business" && activeBiz && <BusinessScreen ctx={ctx} />}
          {screen === "settings" && <SettingsScreen ctx={ctx} />}
          {screen === "analytics" && <AnalyticsScreen ctx={ctx} />}
        </div>
        <BottomNav ctx={ctx} />

        {/* MODALS */}
        {modal === "addBiz" && <AddBizModal ctx={ctx} />}
        {modal === "addItem" && <AddItemModal ctx={ctx} />}
        {modal === "restock" && <RestockModal ctx={ctx} />}
        {modal === "addSale" && <AddSaleModal ctx={ctx} />}
        {modal === "deleteBiz" && <DeleteBizModal ctx={ctx} />}
        {modal === "toast" && <Toast msg={toast} />}
      </div>
    </div>
  );
}

/* ─── STATUS BAR ────────────────────────────────────────────────────────────── */
function StatusBar() {
  const now = new Date();
  const time = now.toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit", hour12: false });
  return (
    <div style={S.statusBar}>
      <span style={S.statusTime}>{time}</span>
      <span style={S.statusIcons}>▲▲▲ 🔋</span>
    </div>
  );
}

/* ─── HOME SCREEN ───────────────────────────────────────────────────────────── */
function HomeScreen({ ctx }) {
  const { businesses, openBiz, setModal, lowStockThreshold } = ctx;
  const totalRevenue = businesses.reduce((s, b) => s + calcBizStats(b).revenue, 0);
  const totalProfit = businesses.reduce((s, b) => s + calcBizStats(b).profit, 0);
  const allLowStock = businesses.flatMap((b) =>
    b.inventory.filter((i) => i.qty <= lowStockThreshold).map((i) => ({ ...i, bizName: b.name, bizColor: b.color }))
  );

  return (
    <div style={S.screen}>
      <div style={S.homeHeader}>
        <div>
          <p style={S.greeting}>Good morning,</p>
          <h1 style={S.userName}>Your Businesses ✨</h1>
        </div>
        <div style={S.avatar}>B</div>
      </div>

      {/* SUMMARY CARD */}
      <div style={S.summaryCard}>
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
          <span style={S.alertIcon}>⚠️</span>
          <div>
            <p style={S.alertTitle}>Low Stock on {allLowStock.length} item{allLowStock.length > 1 ? "s" : ""}</p>
            <p style={S.alertSub}>{allLowStock.map((i) => i.name).join(", ")}</p>
          </div>
        </div>
      )}

      {/* BUSINESSES */}
      <div style={S.sectionRow}>
        <p style={S.sectionLabel}>My Businesses</p>
        <button style={S.textBtn} onClick={() => setModal("addBiz")}>+ Add New</button>
      </div>

      <div style={S.cardList}>
        {businesses.length === 0 && (
          <div style={S.emptyState}>
            <p style={S.emptyIcon}>🏪</p>
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
      <div style={{ height: 16 }} />
    </div>
  );
}

/* ─── BUSINESS SCREEN ───────────────────────────────────────────────────────── */
function BusinessScreen({ ctx }) {
  const { activeBiz, bizTab, setBizTab, setScreen, setModal, deleteInventoryItem, lowStockThreshold } = ctx;
  const stats = calcBizStats(activeBiz);

  return (
    <div style={S.screen}>
      <div style={S.bizHeader}>
        <button style={S.backBtn} onClick={() => setScreen("home")}>←</button>
        <div style={S.bizHeaderCenter}>
          <span style={{ fontSize: 18 }}>{activeBiz.emoji}</span>
          <span style={S.bizHeaderName}>{activeBiz.name}</span>
        </div>
        <button style={S.iconBtn} onClick={() => setModal("deleteBiz")}>🗑</button>
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
          <p style={S.infoLabel}>🏆 Best Seller</p>
          <p style={S.infoVal}>{best.name}</p>
          <p style={S.infoSub}>{best.sold} units sold · {fmt(best.price)} each · {(((best.price - best.cost) / best.price) * 100).toFixed(0)}% margin</p>
        </div>
      )}
      {lowStock.length > 0 && (
        <div style={{ ...S.infoCard, borderLeftColor: "#E67E22" }}>
          <p style={S.infoLabel}>⚠️ Low Stock</p>
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
                <p style={S.saleName}>{s.itemName}</p>
                <p style={S.saleSub}>{s.qty} units · {dateLabel(s.date)}</p>
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
          <p style={S.emptyIcon}>📦</p>
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
          <p style={S.emptyIcon}>💰</p>
          <p style={S.emptyTitle}>No sales yet</p>
          <p style={S.emptySub}>Record your first sale above</p>
        </div>
      )}
      {biz.sales.map((sale) => (
        <div key={sale.id} style={S.saleRow}>
          <div>
            <p style={S.saleName}>{sale.itemName}</p>
            <p style={S.saleSub}>{sale.qty} units · {dateLabel(sale.date)}{sale.note ? ` · ${sale.note}` : ""}</p>
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

  return (
    <div style={S.screen}>
      <div style={S.pageHeader}>
        <button style={S.backBtn} onClick={() => setScreen("home")}>←</button>
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
  const { setScreen, currency, setCurrency, lowStockThreshold, setLowStockThreshold, showToast } = ctx;
  const currencies = ["XAF","NGN","GHS","KES","USD","EUR"];

  return (
    <div style={S.screen}>
      <div style={S.pageHeader}>
        <button style={S.backBtn} onClick={() => setScreen("home")}>←</button>
        <h2 style={S.pageTitle}>Settings</h2>
        <div style={{ width: 32 }} />
      </div>

      <div style={S.tabInner}>
        {/* PROFILE */}
        <div style={S.settingsSection}>
          <p style={S.settingsSectionTitle}>Profile</p>
          <div style={S.settingsCard}>
            <div style={S.settingsRow}>
              <div style={{ ...S.avatar, width: 48, height: 48, fontSize: 20 }}>B</div>
              <div style={{ flex: 1 }}>
                <p style={S.settingsRowLabel}>Your Name</p>
                <p style={S.settingsRowVal}>Business Owner</p>
              </div>
              <span style={S.chevron}>›</span>
            </div>
          </div>
        </div>

        {/* PREFERENCES */}
        <div style={S.settingsSection}>
          <p style={S.settingsSectionTitle}>Preferences</p>
          <div style={S.settingsCard}>
            <div style={S.settingsRow}>
              <span style={S.settingsIcon}>💱</span>
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
              <span style={S.settingsIcon}>⚠️</span>
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
            <div style={S.settingsRow} onClick={() => showToast("Export coming in v2!")}>
              <span style={S.settingsIcon}>📤</span>
              <div style={{ flex: 1 }}>
                <p style={S.settingsRowLabel}>Export as CSV</p>
                <p style={S.settingsRowSub}>Download all your data</p>
              </div>
              <span style={S.chevron}>›</span>
            </div>
            <div style={S.settingsDivider} />
            <div style={S.settingsRow} onClick={() => showToast("Cloud sync coming in v2!")}>
              <span style={S.settingsIcon}>☁️</span>
              <div style={{ flex: 1 }}>
                <p style={S.settingsRowLabel}>Cloud Backup</p>
                <p style={S.settingsRowSub}>Sync across devices (v2)</p>
              </div>
              <span style={{ ...S.chevron, color: "#C17F5A" }}>Soon</span>
            </div>
          </div>
        </div>

        {/* ABOUT */}
        <div style={S.settingsSection}>
          <p style={S.settingsSectionTitle}>About</p>
          <div style={S.settingsCard}>
            <div style={S.settingsRow}>
              <span style={S.settingsIcon}>📱</span>
              <div style={{ flex: 1 }}>
                <p style={S.settingsRowLabel}>BizTrack</p>
                <p style={S.settingsRowSub}>Version 1.0.0 · Built with ❤️</p>
              </div>
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

function AddSaleModal({ ctx }) {
  const { setModal, activeBiz, addSale } = ctx;
  const [itemId, setItemId] = useState(activeBiz?.inventory[0]?.id || "");
  const [qty, setQty] = useState("");
  const [actualPrice, setActualPrice] = useState("");
  const [note, setNote] = useState("");

  const selectedItem = activeBiz?.inventory.find((i) => i.id === Number(itemId));

  // when item changes, pre-fill actual price with the asking price
  const handleItemChange = (e) => {
    setItemId(e.target.value);
    const item = activeBiz?.inventory.find((i) => i.id === Number(e.target.value));
    if (item) setActualPrice(String(item.price));
  };

  // pre-fill on first render
  useState(() => {
    if (selectedItem) setActualPrice(String(selectedItem.price));
  });

  const soldBelow = selectedItem && actualPrice && Number(actualPrice) < selectedItem.price;
  const soldAbove = selectedItem && actualPrice && Number(actualPrice) > selectedItem.price;

  const preview = selectedItem && qty && actualPrice ? {
    revenue: Number(actualPrice) * Number(qty),
    profit: (Number(actualPrice) - selectedItem.cost) * Number(qty),
    discount: soldBelow ? (selectedItem.price - Number(actualPrice)) * Number(qty) : 0,
  } : null;

  const submit = () => {
    if (!itemId || !qty || !actualPrice) return;
    addSale(activeBiz.id, { itemId: Number(itemId), qty: Number(qty), actualPrice: Number(actualPrice), note });
    setModal(null);
  };

  return (
    <ModalShell onClose={() => setModal(null)} title="Record Sale">
      <div style={S.modalBody}>
        {activeBiz?.inventory.length === 0 ? (
          <div style={S.emptyState}>
            <p style={S.emptyIcon}>📦</p>
            <p style={S.emptyTitle}>No items in inventory</p>
            <p style={S.emptySub}>Add inventory items first before recording a sale</p>
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
            <input style={S.input} type="number" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="e.g. 2" />

            <div>
              <p style={S.fieldLabel}>Actual Selling Price (XAF)</p>
              <p style={{ fontSize: 11, color: "#9B7B5E", margin: "-4px 0 6px", fontWeight: 500 }}>
                Asking price: {selectedItem ? fmt(selectedItem.price) : "—"} · Change if you sold for less or more
              </p>
              <input
                style={{ ...S.input, borderColor: soldBelow ? "#E67E22" : soldAbove ? "#3A7D2C" : "#E0D6C8" }}
                type="number"
                value={actualPrice}
                onChange={(e) => setActualPrice(e.target.value)}
                placeholder="e.g. 4500"
              />
              {soldBelow && <p style={{ fontSize: 12, color: "#E67E22", margin: "4px 0 0", fontWeight: 600 }}>⬇ Sold below asking price</p>}
              {soldAbove && <p style={{ fontSize: 12, color: "#3A7D2C", margin: "4px 0 0", fontWeight: 600 }}>⬆ Sold above asking price</p>}
            </div>

            <p style={S.fieldLabel}>Note (optional)</p>
            <input style={S.input} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Sold to Amina" />

            {preview && (
              <div style={S.calcPreview}>
                <p style={S.calcLabel}>Revenue: <strong>{fmt(preview.revenue)}</strong></p>
                <p style={S.calcLabel}>Profit: <strong style={{ color: preview.profit >= 0 ? "#3A7D2C" : "#C0392B" }}>{preview.profit >= 0 ? "+" : ""}{fmt(preview.profit)}</strong></p>
                {preview.discount > 0 && <p style={S.calcLabel}>Discount given: <strong style={{ color: "#E67E22" }}>{fmt(preview.discount)}</strong></p>}
              </div>
            )}

            <button style={S.primaryBtn} onClick={submit}>Record Sale</button>
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
          <p style={S.deleteIcon}>⚠️</p>
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

function Toast({ msg }) {
  return (
    <div style={S.toast}>{msg}</div>
  );
}

/* ─── BOTTOM NAV ────────────────────────────────────────────────────────────── */
function BottomNav({ ctx }) {
  const { screen, setScreen, setModal } = ctx;
  const tabs = [
    { id: "home", icon: "⌂", label: "Home" },
    { id: "analytics", icon: "📊", label: "Analytics" },
    { id: "add", icon: "＋", label: "Add", action: () => setModal("addBiz") },
    { id: "settings", icon: "◎", label: "Settings" },
  ];
  return (
    <div style={S.bottomNav}>
      {tabs.map((t) => (
        <button
          key={t.id}
          style={{ ...S.navItem, ...(screen === t.id ? S.navActive : {}) }}
          onClick={t.action || (() => setScreen(t.id))}
        >
          <span style={{ fontSize: t.id === "add" ? 22 : 18, ...(t.id === "add" ? S.addNavIcon : {}) }}>{t.icon}</span>
          <span style={{ ...S.navLabel, ...(screen === t.id ? { color: "#2C1810" } : {}) }}>{t.label}</span>
        </button>
      ))}
    </div>
  );
}

/* ─── STYLES ────────────────────────────────────────────────────────────────── */
const S = {
  shell: { minHeight: "100vh", background: "linear-gradient(135deg,#2C1810,#5C3D2E,#8B6914)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans','Nunito',sans-serif", padding: "24px 0" },
  phone: { width: 390, height: 844, background: "#FAF8F4", borderRadius: 48, overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 40px 120px rgba(0,0,0,0.5),0 0 0 12px #1a0f0a", position: "relative" },
  statusBar: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 28px 4px", fontSize: 12, color: "#5C3D2E", fontWeight: 600, flexShrink: 0 },
  statusTime: { letterSpacing: 1 },
  statusIcons: { fontSize: 10, opacity: 0.7 },
  screenWrap: { flex: 1, overflow: "hidden", position: "relative" },
  screen: { position: "absolute", inset: 0, overflowY: "auto", paddingBottom: 80, scrollbarWidth: "none" },

  homeHeader: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "16px 24px 8px" },
  greeting: { fontSize: 13, color: "#9B7B5E", margin: 0, fontWeight: 500, letterSpacing: 0.3 },
  userName: { fontSize: 26, color: "#2C1810", margin: "2px 0 0", fontWeight: 800, fontFamily: "'Playfair Display',Georgia,serif", letterSpacing: -0.5 },
  avatar: { width: 44, height: 44, borderRadius: "50%", background: "linear-gradient(135deg,#C17F5A,#8B6914)", color: "#FAF8F4", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 18, boxShadow: "0 4px 16px rgba(193,127,90,0.4)", flexShrink: 0 },

  summaryCard: { margin: "8px 24px 16px", background: "linear-gradient(135deg,#2C1810,#5C3D2E)", borderRadius: 24, padding: "22px", position: "relative", overflow: "hidden", boxShadow: "0 12px 40px rgba(44,24,16,0.35)" },
  summaryOrb: { position: "absolute", top: -40, right: -40, width: 160, height: 160, borderRadius: "50%", background: "rgba(255,255,255,0.04)" },
  summaryLabel: { fontSize: 11, color: "rgba(255,255,255,0.6)", margin: "0 0 6px", letterSpacing: 0.8, textTransform: "uppercase", fontWeight: 500 },
  summaryAmount: { fontSize: 28, color: "#FAF8F4", margin: "0 0 18px", fontFamily: "'Playfair Display',Georgia,serif", fontWeight: 700, letterSpacing: -1 },
  summaryRow: { display: "flex", alignItems: "center", gap: 16 },
  summaryDivider: { width: 1, height: 28, background: "rgba(255,255,255,0.2)" },
  summarySubLabel: { fontSize: 10, color: "rgba(255,255,255,0.5)", margin: "0 0 3px", textTransform: "uppercase", letterSpacing: 0.5 },
  summarySubVal: { fontSize: 14, color: "#FAF8F4", margin: 0, fontWeight: 600 },

  alertBanner: { margin: "0 24px 14px", background: "#FFF8E1", borderRadius: 14, padding: "12px 16px", display: "flex", alignItems: "flex-start", gap: 10, border: "1px solid #F0C040" },
  alertIcon: { fontSize: 18, flexShrink: 0 },
  alertTitle: { fontSize: 13, fontWeight: 700, color: "#8B6914", margin: "0 0 3px" },
  alertSub: { fontSize: 12, color: "#9B7B5E", margin: 0 },

  sectionRow: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 24px 12px" },
  sectionLabel: { fontSize: 15, fontWeight: 700, color: "#2C1810", margin: 0, fontFamily: "'Playfair Display',Georgia,serif" },
  textBtn: { fontSize: 13, color: "#C17F5A", fontWeight: 700, background: "none", border: "none", cursor: "pointer", padding: 0 },

  cardList: { display: "flex", flexDirection: "column", gap: 10, padding: "0 24px" },
  bizCard: { background: "#FFFFFF", borderRadius: 18, padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", borderLeft: "4px solid", boxShadow: "0 2px 16px rgba(44,24,16,0.08)", cursor: "pointer" },
  bizCardLeft: { display: "flex", alignItems: "center", gap: 10 },
  bizEmoji: { width: 44, height: 44, borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 },
  bizName: { fontSize: 14, fontWeight: 700, color: "#2C1810", margin: "0 0 3px" },
  bizCat: { fontSize: 12, color: "#9B7B5E", margin: 0, fontWeight: 500 },
  bizCardRight: { alignItems: "flex-end", display: "flex", flexDirection: "column", gap: 6 },
  bizProfit: { fontSize: 14, fontWeight: 800, color: "#2C1810", margin: 0 },
  badge: { fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 20 },

  emptyState: { padding: "40px 0", textAlign: "center" },
  emptyIcon: { fontSize: 40, margin: "0 0 12px" },
  emptyTitle: { fontSize: 16, fontWeight: 700, color: "#2C1810", margin: "0 0 6px" },
  emptySub: { fontSize: 13, color: "#9B7B5E", margin: 0 },

  // BIZ SCREEN
  bizHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 24px 10px", flexShrink: 0 },
  backBtn: { fontSize: 22, background: "none", border: "none", cursor: "pointer", color: "#2C1810", padding: 0, fontWeight: 700 },
  iconBtn: { fontSize: 18, background: "none", border: "none", cursor: "pointer", padding: 0 },
  bizHeaderCenter: { display: "flex", alignItems: "center", gap: 8 },
  bizHeaderName: { fontSize: 15, fontWeight: 700, color: "#2C1810", fontFamily: "'Playfair Display',Georgia,serif" },

  bizHero: { margin: "0 24px 16px", borderRadius: 24, padding: "20px", position: "relative", overflow: "hidden" },
  heroOrb: { position: "absolute", top: -30, right: -30, width: 120, height: 120, borderRadius: "50%", background: "rgba(255,255,255,0.12)" },
  heroRow: { display: "flex", justifyContent: "space-between", marginBottom: 16 },
  heroLabel: { fontSize: 10, color: "rgba(255,255,255,0.65)", margin: "0 0 4px", textTransform: "uppercase", letterSpacing: 0.7, fontWeight: 500 },
  heroVal: { fontSize: 16, color: "#FFFFFF", margin: 0, fontWeight: 800, letterSpacing: -0.5 },
  progBg: { height: 5, background: "rgba(255,255,255,0.2)", borderRadius: 99, overflow: "hidden", marginBottom: 7 },
  progFill: { height: "100%", background: "rgba(255,255,255,0.85)", borderRadius: 99 },
  heroSub: { fontSize: 11, color: "rgba(255,255,255,0.6)", margin: 0, fontWeight: 500 },

  tabs: { display: "flex", padding: "0 24px", gap: 8, marginBottom: 14, flexShrink: 0 },
  tab: { flex: 1, padding: "9px 0", borderRadius: 12, border: "none", background: "rgba(44,24,16,0.07)", color: "#9B7B5E", fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "'DM Sans',sans-serif" },
  tabActive: { background: "#2C1810", color: "#FAF8F4" },
  tabContent: { flex: 1 },
  tabInner: { padding: "0 24px", display: "flex", flexDirection: "column", gap: 12 },

  infoCard: { background: "#FFFFFF", borderRadius: 16, padding: "14px 16px", borderLeft: "4px solid #8B6914", boxShadow: "0 2px 12px rgba(44,24,16,0.06)" },
  infoLabel: { fontSize: 11, color: "#9B7B5E", margin: "0 0 5px", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 },
  infoVal: { fontSize: 17, color: "#2C1810", margin: "0 0 4px", fontWeight: 800, fontFamily: "'Playfair Display',Georgia,serif" },
  infoSub: { fontSize: 12, color: "#9B7B5E", margin: "2px 0 0", fontWeight: 500 },

  statsGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 },
  statCard: { background: "#FFFFFF", borderRadius: 16, padding: "14px", boxShadow: "0 2px 12px rgba(44,24,16,0.06)" },
  statLbl: { fontSize: 11, color: "#9B7B5E", margin: "0 0 6px", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4 },
  statVal: { fontSize: 20, fontWeight: 800, color: "#2C1810", margin: 0 },

  dashedBtn: { background: "none", border: "2px dashed #D4B896", borderRadius: 14, padding: "13px", textAlign: "center", color: "#C17F5A", fontWeight: 700, fontSize: 14, cursor: "pointer", width: "100%", fontFamily: "'DM Sans',sans-serif" },

  invRow: { background: "#FFFFFF", borderRadius: 16, padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "flex-start", boxShadow: "0 2px 12px rgba(44,24,16,0.06)" },
  invNameRow: { display: "flex", alignItems: "center", gap: 8, marginBottom: 5 },
  invName: { fontSize: 14, fontWeight: 700, color: "#2C1810", margin: 0 },
  invSub: { fontSize: 12, color: "#9B7B5E", margin: "2px 0 0", fontWeight: 500 },
  invProfit: { fontSize: 14, fontWeight: 800, color: "#3A7D2C", margin: 0 },
  lowBadge: { fontSize: 10, fontWeight: 700, background: "#FDECEA", color: "#C0392B", padding: "2px 7px", borderRadius: 99 },
  marginBadge: { fontSize: 11, color: "#3A7D2C", fontWeight: 600, background: "#E8F5E3", padding: "2px 8px", borderRadius: 99 },
  deleteBtn: { fontSize: 12, color: "#C0392B", background: "none", border: "none", cursor: "pointer", padding: "2px 6px", fontWeight: 700 },

  saleRow: { background: "#FFFFFF", borderRadius: 16, padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", boxShadow: "0 2px 12px rgba(44,24,16,0.06)" },
  saleName: { fontSize: 14, fontWeight: 700, color: "#2C1810", margin: "0 0 4px" },
  saleSub: { fontSize: 12, color: "#9B7B5E", margin: 0, fontWeight: 500 },
  saleRev: { fontSize: 14, fontWeight: 800, color: "#2C1810", margin: "0 0 3px" },
  salePft: { fontSize: 12, color: "#3A7D2C", fontWeight: 600 },

  // ANALYTICS
  analyticsRow: { background: "#FFFFFF", borderRadius: 16, padding: "14px 16px", display: "flex", alignItems: "center", boxShadow: "0 2px 12px rgba(44,24,16,0.06)" },
  analyticsLeft: { display: "flex", alignItems: "center", gap: 8, width: 130 },
  rankNum: { fontSize: 13, fontWeight: 800, color: "#9B7B5E", width: 24 },
  analyticsProfit: { fontSize: 13, fontWeight: 800, color: "#2C1810", margin: 0, whiteSpace: "nowrap" },
  barBg: { height: 8, background: "#F0EBE3", borderRadius: 99, overflow: "hidden" },
  barFill: { height: "100%", borderRadius: 99, transition: "width 0.8s ease" },

  // SETTINGS
  pageHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 24px 16px" },
  pageTitle: { fontSize: 18, fontWeight: 800, color: "#2C1810", margin: 0, fontFamily: "'Playfair Display',Georgia,serif" },

  settingsSection: { marginBottom: 4 },
  settingsSectionTitle: { fontSize: 12, fontWeight: 700, color: "#9B7B5E", textTransform: "uppercase", letterSpacing: 0.8, margin: "0 0 8px", paddingLeft: 2 },
  settingsCard: { background: "#FFFFFF", borderRadius: 18, overflow: "hidden", boxShadow: "0 2px 12px rgba(44,24,16,0.06)" },
  settingsRow: { display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", cursor: "pointer" },
  settingsIcon: { fontSize: 20, width: 32, textAlign: "center" },
  settingsRowLabel: { fontSize: 14, fontWeight: 600, color: "#2C1810", margin: "0 0 2px" },
  settingsRowVal: { fontSize: 13, color: "#9B7B5E", margin: 0, fontWeight: 500 },
  settingsRowSub: { fontSize: 12, color: "#9B7B5E", margin: 0 },
  settingsDivider: { height: 1, background: "#F0EBE3", margin: "0 16px" },
  chevron: { fontSize: 20, color: "#9B7B5E", fontWeight: 300 },
  select: { fontSize: 13, fontWeight: 600, color: "#2C1810", background: "#F5F0EA", border: "none", borderRadius: 8, padding: "6px 10px", cursor: "pointer", fontFamily: "'DM Sans',sans-serif" },

  feedbackCard: { background: "#FFFFFF", borderRadius: 18, padding: "20px", boxShadow: "0 2px 12px rgba(44,24,16,0.06)" },
  feedbackTitle: { fontSize: 16, fontWeight: 700, color: "#2C1810", margin: "0 0 4px", fontFamily: "'Playfair Display',Georgia,serif" },
  feedbackSub: { fontSize: 13, color: "#9B7B5E", margin: "0 0 16px" },
  emojiRow: { display: "flex", justifyContent: "space-between", marginBottom: 16 },
  emojiBtn: { fontSize: 28, background: "none", border: "none", cursor: "pointer", padding: "4px 8px", borderRadius: 12 },
  feedbackInput: { width: "100%", minHeight: 80, borderRadius: 12, border: "1.5px solid #E0D6C8", padding: "10px 12px", fontSize: 13, fontFamily: "'DM Sans',sans-serif", color: "#2C1810", background: "#FAF8F4", resize: "none", boxSizing: "border-box", marginBottom: 12, outline: "none" },
  submitBtn: { width: "100%", background: "#2C1810", color: "#FAF8F4", border: "none", borderRadius: 14, padding: "14px", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans',sans-serif" },

  // MODALS
  modalOverlay: { position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "flex-end", zIndex: 100 },
  modalSheet: { background: "#FAF8F4", borderRadius: "24px 24px 0 0", width: "100%", maxHeight: "90%", overflowY: "auto", paddingBottom: 20 },
  modalHandle: { width: 40, height: 4, background: "#D4B896", borderRadius: 99, margin: "14px auto 4px" },
  modalTitle: { fontSize: 18, fontWeight: 800, color: "#2C1810", margin: "8px 24px 16px", fontFamily: "'Playfair Display',Georgia,serif" },
  modalBody: { padding: "0 24px", display: "flex", flexDirection: "column", gap: 12 },

  fieldLabel: { fontSize: 13, fontWeight: 700, color: "#5C3D2E", margin: "4px 0 4px", letterSpacing: 0.2 },
  input: { width: "100%", height: 48, borderRadius: 14, border: "1.5px solid #E0D6C8", padding: "0 14px", fontSize: 14, fontFamily: "'DM Sans',sans-serif", color: "#2C1810", background: "#FFFFFF", boxSizing: "border-box", outline: "none", appearance: "auto" },

  colorRow: { display: "flex", gap: 10, flexWrap: "wrap" },
  colorDot: { width: 36, height: 36, borderRadius: "50%", border: "none", cursor: "pointer", outlineOffset: 3 },
  emojiGrid: { display: "flex", flexWrap: "wrap", gap: 4 },
  emojiPick: { fontSize: 24, border: "none", cursor: "pointer", padding: "6px", borderRadius: 10, width: 44, height: 44 },

  calcPreview: { background: "#F0FAF0", borderRadius: 14, padding: "12px 16px", border: "1.5px solid #B8E0B0" },
  calcLabel: { fontSize: 13, color: "#2C1810", margin: "2px 0", fontWeight: 500 },

  primaryBtn: { width: "100%", background: "#2C1810", color: "#FAF8F4", border: "none", borderRadius: 14, padding: "15px", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans',sans-serif", marginTop: 4 },
  ghostBtn: { width: "100%", background: "transparent", color: "#9B7B5E", border: "1.5px solid #D4B896", borderRadius: 14, padding: "14px", fontSize: 15, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans',sans-serif" },

  deleteWarning: { background: "#FDECEA", borderRadius: 16, padding: "20px", textAlign: "center" },
  deleteIcon: { fontSize: 36, margin: "0 0 10px" },
  deleteTitle: { fontSize: 16, fontWeight: 800, color: "#C0392B", margin: "0 0 8px", fontFamily: "'Playfair Display',Georgia,serif" },
  deleteSub: { fontSize: 13, color: "#7B3B35", margin: 0, lineHeight: 1.5 },

  // BOTTOM NAV
  bottomNav: { position: "absolute", bottom: 0, left: 0, right: 0, height: 78, background: "#FFFFFF", borderTop: "1px solid rgba(44,24,16,0.08)", display: "flex", alignItems: "center", justifyContent: "space-around", padding: "0 8px 8px", boxShadow: "0 -8px 32px rgba(44,24,16,0.08)" },
  navItem: { display: "flex", flexDirection: "column", alignItems: "center", gap: 3, background: "none", border: "none", cursor: "pointer", padding: "8px 16px", borderRadius: 16 },
  navActive: { background: "rgba(193,127,90,0.12)" },
  navLabel: { fontSize: 10, color: "#9B7B5E", fontWeight: 600, letterSpacing: 0.3 },
  addNavIcon: { color: "#C17F5A", fontWeight: 900 },

  toast: { position: "absolute", bottom: 96, left: "50%", transform: "translateX(-50%)", background: "#2C1810", color: "#FAF8F4", padding: "12px 24px", borderRadius: 99, fontSize: 14, fontWeight: 600, whiteSpace: "nowrap", boxShadow: "0 8px 32px rgba(0,0,0,0.3)", zIndex: 200 },
};
