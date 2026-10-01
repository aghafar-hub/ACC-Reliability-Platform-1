import { useCallback, useEffect, useMemo, useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useTheme } from "../ThemeContext";
import * as api from "../api";
import { newId } from "../parsers";
import OilProductDetail from "./OilProductDetail";

const CONTAINER_TYPES = ["Drum", "Pail", "Bulk Tank", "IBC"];
const UNITS = ["L", "Drum"];
const STATUS_OPTIONS = ["Active", "Discontinued"];
// Same short labels as NewRoutine.jsx's CONTRACTOR_OPTIONS — oil stock is
// owned by the contractor, not a shared ACC warehouse (confirmed by the
// user), so every product needs one. For a Contractor Engineer this is
// overridden server-side to their own org regardless of what's picked
// here (see backend/oil-lubrication/src/Code.js's addOilProduct handler)
// — only an ACC/Admin user's choice here actually takes effect.
const CONTRACTOR_OPTIONS = ["RHI", "ASEC"];

// Distinct (Lubricant_Type, Lubricant_Brand, Contractor) combinations
// already in use across the Equipment Registry — lets Add Product offer a
// pick-from-list instead of free text. This is the actual fix for "an
// engineer types the same oil with different spacing and the app treats
// it as a different product": picking from here guarantees the exact
// string already on real LP rows, so it always matches for auto-
// deduction/forecast (which key on lubricant+brand+contractor). Sorted by
// contractor then type so the two contractors' lists aren't interleaved.
function knownOilsFromRegistry(equipmentRegistry) {
  const seen = new Map(); // "contractor|type|brand" -> {lubricant, lubricantBrand, contractor}
  (equipmentRegistry || []).forEach((reg) => {
    const lubricant = (reg.lubricant || "").trim();
    const contractor = (reg.contractor || "").trim();
    if (!lubricant || !contractor) return;
    const lubricantBrand = (reg.lubricantBrand || "").trim();
    const key = `${contractor}|${lubricant.toLowerCase()}|${lubricantBrand.toLowerCase()}`;
    if (!seen.has(key)) seen.set(key, { lubricant, lubricantBrand, contractor });
  });
  return Array.from(seen.values()).sort((a, b) => a.contractor.localeCompare(b.contractor) || a.lubricant.localeCompare(b.lubricant));
}

function AddProductForm({ webhookUrl, equipmentRegistry, pushToast, onCreated, onCancel }) {
  const { s, T } = useTheme();
  const knownOils = useMemo(() => knownOilsFromRegistry(equipmentRegistry), [equipmentRegistry]);
  const [oilMode, setOilMode] = useState(knownOils.length > 0 ? "registry" : "custom");
  const [selectedOilKey, setSelectedOilKey] = useState("");
  const [form, setForm] = useState({
    lubricantType: "",
    lubricantBrand: "",
    containerType: CONTAINER_TYPES[0],
    containerSizeL: "",
    unit: UNITS[0],
    recorderLevel: "",
    storageLocation: "",
    supplier: "",
    unitCost: "",
    status: "Active",
    notes: "",
    contractor: CONTRACTOR_OPTIONS[0],
    equivalentToType: "",
    equivalentToBrand: "",
  });
  const [saving, setSaving] = useState(false);
  // Patch 8: "this product is a substitute for an oil the market no longer
  // carries" — a simple pairing (this product replaces ONE original spec,
  // not a group of several interchangeable brands), declarable here by any
  // Contractor Engineer for their own contractor's stock, no ACC approval
  // needed (confirmed directly by the user). Only offered against the SAME
  // contractor's own registry oils — equivalence never crosses contractor
  // lines, same as the stock itself never does.
  const [equivalentEnabled, setEquivalentEnabled] = useState(false);
  const [selectedEquivalentKey, setSelectedEquivalentKey] = useState("");
  const knownOilsForContractor = useMemo(
    () => knownOils.filter((o) => o.contractor === form.contractor),
    [knownOils, form.contractor]
  );

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function oilKeyFor(o) {
    return `${o.contractor}|${o.lubricant}|${o.lubricantBrand}`;
  }

  function handleSelectKnownOil(key) {
    setSelectedOilKey(key);
    const picked = knownOils.find((o) => oilKeyFor(o) === key);
    if (!picked) return;
    setForm((f) => ({ ...f, lubricantType: picked.lubricant, lubricantBrand: picked.lubricantBrand, contractor: picked.contractor }));
  }

  function handleSelectEquivalent(key) {
    setSelectedEquivalentKey(key);
    const picked = knownOilsForContractor.find((o) => oilKeyFor(o) === key);
    setForm((f) => ({ ...f, equivalentToType: picked?.lubricant || "", equivalentToBrand: picked?.lubricantBrand || "" }));
  }

  async function handleCreate() {
    if (!form.lubricantType.trim()) {
      pushToast(oilMode === "registry" ? "Select an oil from the list first." : "Lubricant type is required.", "error");
      return;
    }
    if (equivalentEnabled && !form.equivalentToType.trim()) {
      pushToast("Select which oil this product replaces, or uncheck the equivalent-oil option.", "error");
      return;
    }
    setSaving(true);
    try {
      const productId = newId("OIL");
      const payload = { productId, ...form };
      if (!equivalentEnabled) {
        payload.equivalentToType = "";
        payload.equivalentToBrand = "";
      }
      const saved = await api.addOilProduct(webhookUrl, payload);
      pushToast("Product added. Remember to copy the Current_Stock / Last_Movement_Date formulas down into its row.", "success");
      onCreated(saved.productId);
    } catch (err) {
      pushToast(err.message, "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <p style={{ ...s.sectionTitle, margin: 0 }}>Add Oil Product</p>
        <button style={s.btn} onClick={onCancel} disabled={saving}>
          <i className="ti ti-x" aria-hidden="true" /> Cancel
        </button>
      </div>
      <div style={{ ...s.card, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        {knownOils.length > 0 && (
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={s.label}>Oil</label>
            <div style={{ display: "flex", gap: 10, marginBottom: 6 }}>
              <label style={{ fontSize: 12.5, display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
                <input type="radio" checked={oilMode === "registry"} onChange={() => setOilMode("registry")} /> Pick from registry
              </label>
              <label style={{ fontSize: 12.5, display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
                <input type="radio" checked={oilMode === "custom"} onChange={() => setOilMode("custom")} /> Not in registry yet
              </label>
            </div>
            {oilMode === "registry" && (
              <select style={s.select} value={selectedOilKey} onChange={(e) => handleSelectKnownOil(e.target.value)}>
                <option value="">Select an oil already used on equipment…</option>
                {knownOils.map((o) => (
                  <option key={oilKeyFor(o)} value={oilKeyFor(o)}>
                    {o.lubricant}
                    {o.lubricantBrand ? ` (${o.lubricantBrand})` : ""} — {o.contractor}
                  </option>
                ))}
              </select>
            )}
            <p style={{ fontSize: 11.5, color: T.textSecondary, margin: "6px 0 0" }}>
              Picking from the registry guarantees the exact spelling already used on equipment, so it always matches for auto-deduction
              and the forecast — typing it yourself (even a small spacing difference) can silently create a second, unmatched product.
            </p>
          </div>
        )}
        {(oilMode === "custom" || knownOils.length === 0) && (
          <>
            <div>
              <label style={s.label}>Lubricant Type</label>
              <input style={s.input} type="text" placeholder="e.g. Mobil SHC 630" value={form.lubricantType} onChange={(e) => set("lubricantType", e.target.value)} />
            </div>
            <div>
              <label style={s.label}>Lubricant Brand</label>
              <input style={s.input} type="text" placeholder="e.g. Mobil" value={form.lubricantBrand} onChange={(e) => set("lubricantBrand", e.target.value)} />
            </div>
          </>
        )}
        <div style={{ gridColumn: "1 / -1" }}>
          <label style={{ fontSize: 12.5, display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
            <input type="checkbox" checked={equivalentEnabled} onChange={(e) => setEquivalentEnabled(e.target.checked)} />
            This replaces a different spec'd oil (market doesn't carry the original anymore)
          </label>
          {equivalentEnabled && (
            <div style={{ marginTop: 6 }}>
              {knownOilsForContractor.length > 0 ? (
                <select style={s.select} value={selectedEquivalentKey} onChange={(e) => handleSelectEquivalent(e.target.value)}>
                  <option value="">Select the original oil this product replaces…</option>
                  {knownOilsForContractor.map((o) => (
                    <option key={oilKeyFor(o)} value={oilKeyFor(o)}>
                      {o.lubricant}
                      {o.lubricantBrand ? ` (${o.lubricantBrand})` : ""}
                    </option>
                  ))}
                </select>
              ) : (
                <div style={{ display: "flex", gap: 10 }}>
                  <input
                    style={s.input}
                    type="text"
                    placeholder="Original Lubricant Type"
                    value={form.equivalentToType}
                    onChange={(e) => set("equivalentToType", e.target.value)}
                  />
                  <input
                    style={s.input}
                    type="text"
                    placeholder="Original Brand"
                    value={form.equivalentToBrand}
                    onChange={(e) => set("equivalentToBrand", e.target.value)}
                  />
                </div>
              )}
              <p style={{ fontSize: 11.5, color: T.textSecondary, margin: "6px 0 0" }}>
                Auto-deduction and the forecast will use this product for that original oil's equipment whenever there's no exact match
                in {form.contractor || "this contractor"}'s own stock.
              </p>
            </div>
          )}
        </div>
        <div>
          <label style={s.label}>Container Type</label>
          <select style={s.select} value={form.containerType} onChange={(e) => set("containerType", e.target.value)}>
            {CONTAINER_TYPES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label style={s.label}>Container Size (L)</label>
          <input style={s.input} type="number" value={form.containerSizeL} onChange={(e) => set("containerSizeL", e.target.value)} />
        </div>
        <div>
          <label style={s.label}>Unit</label>
          <select style={s.select} value={form.unit} onChange={(e) => set("unit", e.target.value)}>
            {UNITS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label style={s.label}>Reorder Level</label>
          <input style={s.input} type="number" value={form.recorderLevel} onChange={(e) => set("recorderLevel", e.target.value)} />
        </div>
        <div>
          <label style={s.label}>Storage Location</label>
          <input style={s.input} type="text" value={form.storageLocation} onChange={(e) => set("storageLocation", e.target.value)} />
        </div>
        <div>
          <label style={s.label}>Supplier</label>
          <input style={s.input} type="text" value={form.supplier} onChange={(e) => set("supplier", e.target.value)} />
        </div>
        <div>
          <label style={s.label}>Unit Cost</label>
          <input style={s.input} type="text" placeholder="Optional" value={form.unitCost} onChange={(e) => set("unitCost", e.target.value)} />
        </div>
        <div>
          <label style={s.label}>Status</label>
          <select style={s.select} value={form.status} onChange={(e) => set("status", e.target.value)}>
            {STATUS_OPTIONS.map((st) => (
              <option key={st} value={st}>
                {st}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label style={s.label}>Contractor</label>
          <select style={s.select} value={form.contractor} onChange={(e) => set("contractor", e.target.value)}>
            {CONTRACTOR_OPTIONS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <label style={s.label}>Notes</label>
          <input style={s.input} type="text" value={form.notes} onChange={(e) => set("notes", e.target.value)} />
        </div>
      </div>
      <p style={{ fontSize: 12, color: T.textSecondary, marginBottom: 14 }}>
        Current Stock and Last Movement Date are computed by a formula on the sheet itself, from every receipt/issue logged for this
        product — they'll show blank here until that formula is copied down into the new row.
      </p>
      <button style={s.btnPrimary} onClick={handleCreate} disabled={saving}>
        {saving ? "Adding…" : "Add Product"}
      </button>
    </div>
  );
}

// "YYYY-MM" -> "Aug 2026", for chart axes and table headers.
function monthLabel(key) {
  if (!key) return "";
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, (m || 1) - 1, 1);
  return d.toLocaleDateString(undefined, { month: "short", year: "2-digit" });
}

const TABS = [
  { key: "overview", label: "Overview", icon: "ti-layout-dashboard" },
  { key: "stock", label: "Stock List", icon: "ti-list" },
  { key: "consumption", label: "Consumption", icon: "ti-chart-bar" },
  { key: "forecast", label: "Forecast", icon: "ti-chart-line" },
  { key: "movements", label: "Movements", icon: "ti-exchange" },
];

function TabBar({ T, s, activeTab, setActiveTab }) {
  return (
    <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap", borderBottom: `1px solid ${T.border}`, paddingBottom: 14 }}>
      {TABS.map((t) => (
        <button
          key={t.key}
          style={{
            ...s.btn,
            background: activeTab === t.key ? T.accent : "transparent",
            color: activeTab === t.key ? T.accentText : T.textSecondary,
            borderColor: activeTab === t.key ? T.accent : T.border,
          }}
          onClick={() => setActiveTab(t.key)}
        >
          <i className={`ti ${t.icon}`} aria-hidden="true" /> {t.label}
        </button>
      ))}
    </div>
  );
}

function ChartTooltip({ T, active, payload, label, unit = "L" }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: T.cardBg || T.bg, border: `1px solid ${T.border}`, borderRadius: 6, padding: "6px 10px", fontSize: 12 }}>
      <div style={{ color: T.textSecondary, marginBottom: 2 }}>{label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} style={{ color: T.textPrimary, fontWeight: 700 }}>
          {p.value} {unit}
        </div>
      ))}
    </div>
  );
}

// ─── Overview tab (Patch 24) ─────────────────────────────────────────────
//
// KPI summary + a 6-month consumption trend + a low-stock quick list —
// pulls from getOilInventoryConsumption and getOilInventoryForecast on its
// own (products come in as a prop, already loaded by the parent for the
// Stock List tab) rather than re-fetching what's already in hand.
function OverviewTab({ webhookUrl, products, onOpenProduct }) {
  const { T, s } = useTheme();
  const [consumption, setConsumption] = useState(null);
  const [forecast, setForecast] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([api.getOilInventoryConsumption(webhookUrl, 6), api.getOilInventoryForecast(webhookUrl, 3)])
      .then(([c, f]) => {
        if (cancelled) return;
        setConsumption(c);
        setForecast(f);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [webhookUrl]);

  const lowStock = products.filter((p) => p.currentStock != null && p.recorderLevel != null && p.currentStock <= p.recorderLevel);
  const thisMonthTotal = consumption?.totalsByMonth?.length ? consumption.totalsByMonth[consumption.totalsByMonth.length - 1] : 0;
  const openShortfalls = (forecast?.forecast || []).filter((r) => r.shortfall != null && r.shortfall > 0).length;
  const chartData = (consumption?.months || []).map((m, i) => ({ month: monthLabel(m), total: consumption.totalsByMonth[i] }));

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 12, marginBottom: 20 }}>
        {[
          { label: "Total Products", value: products.length, color: "accent", icon: "ti-box" },
          { label: "Low Stock", value: lowStock.length, color: lowStock.length ? "danger" : "success", icon: "ti-alert-triangle" },
          { label: "This Month's Consumption", value: `${thisMonthTotal} L`, color: "textPrimary", icon: "ti-chart-bar" },
          { label: "Open Shortfalls (3mo)", value: openShortfalls, color: openShortfalls ? "warning" : "success", icon: "ti-alert-circle" },
        ].map((m) => (
          <div key={m.label} style={{ ...s.metricCard, display: "flex", alignItems: "center", gap: 12 }}>
            <span
              style={{
                width: 36,
                height: 36,
                borderRadius: "50%",
                background: T[m.color] + "22",
                color: T[m.color],
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 16,
                flexShrink: 0,
              }}
            >
              <i className={`ti ${m.icon}`} aria-hidden="true" />
            </span>
            <div>
              <div style={{ fontSize: 20, fontWeight: 800, color: T[m.color] }}>{m.value}</div>
              <div style={{ fontSize: 10, color: T.textSecondary }}>{m.label}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ ...s.card, marginBottom: 20 }}>
        <p style={{ fontWeight: 700, margin: "0 0 10px" }}>Consumption Trend (6 months)</p>
        {loading ? (
          <p style={{ color: T.textSecondary, margin: 0 }}>Loading…</p>
        ) : chartData.every((d) => !d.total) ? (
          <p style={{ color: T.textSecondary, margin: 0 }}>No logged Issue movements in this window yet.</p>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="invConsumptionFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={T.accent} stopOpacity={0.35} />
                  <stop offset="95%" stopColor={T.accent} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={T.border} vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: T.textSecondary }} axisLine={{ stroke: T.border }} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: T.textSecondary }} axisLine={false} tickLine={false} width={34} />
              <Tooltip content={<ChartTooltip T={T} />} />
              <Area type="monotone" dataKey="total" stroke={T.accent} strokeWidth={2} fill="url(#invConsumptionFill)" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      <p style={{ fontWeight: 700, margin: "0 0 10px" }}>Low Stock</p>
      {lowStock.length === 0 ? (
        <div style={s.card}>
          <p style={{ color: T.textSecondary, margin: 0 }}>Nothing below its reorder level right now.</p>
        </div>
      ) : (
        <div style={{ ...s.card, padding: 0, overflowX: "auto", overflowY: "hidden" }}>
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>Type / Brand</th>
                <th style={s.th}>Stock</th>
                <th style={s.th}>Reorder Level</th>
                <th style={s.th}>Contractor</th>
              </tr>
            </thead>
            <tbody>
              {lowStock.map((p) => (
                <tr key={p.productId} style={{ cursor: "pointer" }} onClick={() => onOpenProduct(p.productId)}>
                  <td style={s.td}>
                    <div style={{ fontWeight: 700 }}>{p.lubricantType}</div>
                    <div style={{ fontSize: 11.5, color: T.textSecondary }}>{p.lubricantBrand}</div>
                  </td>
                  <td style={s.td}>
                    <span style={{ color: T.danger, fontWeight: 700 }}>
                      {p.currentStock} {p.unit}
                    </span>
                  </td>
                  <td style={s.td}>{p.recorderLevel} {p.unit}</td>
                  <td style={s.td}>{p.contractor}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Stock List tab (the original flat product list + search) ───────────
function StockListTab({ products, loading, error, onAdd, onOpenProduct }) {
  const { T, s } = useTheme();
  const [search, setSearch] = useState("");
  const q = search.trim().toLowerCase();
  const visible = products.filter((p) => {
    if (!q) return true;
    return [p.productId, p.lubricantType, p.lubricantBrand, p.storageLocation, p.supplier].filter(Boolean).some((f) => f.toLowerCase().includes(q));
  });

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 16 }}>
        <input
          style={{ ...s.input, maxWidth: 420 }}
          type="search"
          placeholder="Search by type, brand, location, or supplier…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button style={s.btnPrimary} onClick={onAdd}>
          <i className="ti ti-plus" aria-hidden="true" /> Add Product
        </button>
      </div>

      {loading ? (
        <p style={{ color: T.textSecondary }}>Loading inventory…</p>
      ) : error ? (
        <p style={{ color: T.danger }}>{error}</p>
      ) : visible.length === 0 ? (
        <div style={s.card}>
          <p style={{ color: T.textSecondary, margin: 0 }}>No products match the search.</p>
        </div>
      ) : (
        <div style={{ ...s.card, padding: 0, overflowX: "auto", overflowY: "hidden" }}>
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>Type / Brand</th>
                <th style={s.th}>Stock</th>
                <th style={s.th}>Reorder Level</th>
                <th style={s.th}>Location</th>
                <th style={s.th}>Status</th>
                <th style={s.th}>Last Movement</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((p) => {
                const low = p.currentStock != null && p.recorderLevel != null && p.currentStock <= p.recorderLevel;
                return (
                  <tr key={p.productId} style={{ cursor: "pointer" }} onClick={() => onOpenProduct(p.productId)}>
                    <td style={s.td}>
                      <div style={{ fontWeight: 700 }}>{p.lubricantType}</div>
                      <div style={{ fontSize: 11.5, color: T.textSecondary }}>{p.lubricantBrand}</div>
                    </td>
                    <td style={s.td}>
                      <span style={low ? { color: T.danger, fontWeight: 700 } : undefined}>
                        {p.currentStock != null ? `${p.currentStock} ${p.unit || ""}` : "—"}
                      </span>
                      {low && (
                        <span style={{ ...s.badge("Overdue"), marginLeft: 6 }}>
                          <i className="ti ti-alert-triangle" aria-hidden="true" /> Low
                        </span>
                      )}
                    </td>
                    <td style={s.td}>{p.recorderLevel != null ? `${p.recorderLevel} ${p.unit || ""}` : "—"}</td>
                    <td style={s.td}>{p.storageLocation || "—"}</td>
                    <td style={s.td}>
                      <span style={s.badge(p.status)}>{p.status}</span>
                    </td>
                    <td style={s.td}>{p.lastMovementDate || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Consumption tab (Patch 24, backed by Patch 21's aggregation) ────────
const CONSUMPTION_MONTHS_OPTIONS = [3, 6, 12];

function ConsumptionTab({ webhookUrl, onOpenProduct }) {
  const { T, s } = useTheme();
  const [months, setMonths] = useState(6);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .getOilInventoryConsumption(webhookUrl, months)
      .then((res) => { if (!cancelled) setData(res); })
      .catch((err) => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [webhookUrl, months]);

  const chartData = (data?.months || []).map((m, i) => ({ month: monthLabel(m), total: data.totalsByMonth[i] }));
  const byProduct = (data?.byProduct || []).slice().sort((a, b) => b.total - a.total);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <label style={s.label}>Window</label>
        <select style={{ ...s.select, width: 160 }} value={months} onChange={(e) => setMonths(Number(e.target.value))}>
          {CONSUMPTION_MONTHS_OPTIONS.map((m) => (
            <option key={m} value={m}>
              Last {m} months
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <p style={{ color: T.textSecondary }}>Loading consumption…</p>
      ) : error ? (
        <p style={{ color: T.danger }}>{error}</p>
      ) : (
        <>
          <div style={{ ...s.card, marginBottom: 20 }}>
            <p style={{ fontWeight: 700, margin: "0 0 10px" }}>Total Consumption by Month</p>
            {chartData.every((d) => !d.total) ? (
              <p style={{ color: T.textSecondary, margin: 0 }}>No logged Issue movements in this window.</p>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke={T.border} vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: T.textSecondary }} axisLine={{ stroke: T.border }} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: T.textSecondary }} axisLine={false} tickLine={false} width={34} />
                  <Tooltip content={<ChartTooltip T={T} />} cursor={{ fill: T.accent + "15" }} />
                  <Bar dataKey="total" fill={T.accent} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          <p style={{ fontWeight: 700, margin: "0 0 10px" }}>By Product</p>
          {byProduct.length === 0 ? (
            <div style={s.card}>
              <p style={{ color: T.textSecondary, margin: 0 }}>No products have logged consumption in this window.</p>
            </div>
          ) : (
            <div style={{ ...s.card, padding: 0, overflowX: "auto", overflowY: "hidden" }}>
              <table style={s.table}>
                <thead>
                  <tr>
                    <th style={s.th}>Type / Brand</th>
                    <th style={s.th}>Contractor</th>
                    <th style={s.th}>Total</th>
                    <th style={s.th}>Avg / Month</th>
                  </tr>
                </thead>
                <tbody>
                  {byProduct.map((p) => (
                    <tr key={p.productId} style={{ cursor: "pointer" }} onClick={() => onOpenProduct(p.productId)}>
                      <td style={s.td}>
                        <div style={{ fontWeight: 700 }}>{p.lubricant}</div>
                        <div style={{ fontSize: 11.5, color: T.textSecondary }}>{p.lubricantBrand}</div>
                      </td>
                      <td style={s.td}>{p.contractor}</td>
                      <td style={s.td}>{p.total} L</td>
                      <td style={s.td}>{p.averageMonthly} L</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Forecast tab ─────────────────────────────────────────────────────────
//
// Projected consumption vs. current stock over the next N months — see
// backend/oil-lubrication/src/OilInventory.js's getOilInventoryForecast
// for how this is computed (registry interval projection for scheduled
// equipment, a historical-average rate for condition-based equipment —
// Patch 22). A Contractor Engineer only ever sees their own contractor's
// lines (enforced server-side); ACC/Admin sees every contractor's, one row
// per oil per contractor.
const FORECAST_MONTHS_OPTIONS = [1, 3, 6];

function ForecastTab({ webhookUrl }) {
  const { T, s } = useTheme();
  const [months, setMonths] = useState(3);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .getOilInventoryForecast(webhookUrl, months)
      .then((res) => { if (!cancelled) setData(res); })
      .catch((err) => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [webhookUrl, months]);

  const rows = data?.forecast || [];
  const insufficientHistory = data?.insufficientHistory || [];

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <label style={s.label}>Forecast window</label>
        <select style={{ ...s.select, width: 140 }} value={months} onChange={(e) => setMonths(Number(e.target.value))}>
          {FORECAST_MONTHS_OPTIONS.map((m) => (
            <option key={m} value={m}>
              Next {m} {m === 1 ? "month" : "months"}
            </option>
          ))}
        </select>
        {data?.windowEnd && (
          <span style={{ fontSize: 12, color: T.textSecondary }}>through {data.windowEnd}</span>
        )}
      </div>

      {loading ? (
        <p style={{ color: T.textSecondary }}>Loading forecast…</p>
      ) : error ? (
        <p style={{ color: T.danger }}>{error}</p>
      ) : (
        <>
          {rows.length === 0 ? (
            <div style={s.card}>
              <p style={{ color: T.textSecondary, margin: 0 }}>
                Nothing projected as due in this window — either no lubrication points are due, or none have an oil-change history or open
                routine to project from yet.
              </p>
            </div>
          ) : (
            <div style={{ ...s.card, padding: 0, overflowX: "auto", overflowY: "hidden" }}>
              <table style={s.table}>
                <thead>
                  <tr>
                    <th style={s.th}>Oil</th>
                    <th style={s.th}>Contractor</th>
                    <th style={s.th}>LPs Contributing</th>
                    <th style={s.th}>Projected Need</th>
                    <th style={s.th}>Current Stock</th>
                    <th style={s.th}>Shortfall</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const short = r.shortfall != null && r.shortfall > 0;
                    return (
                      <tr key={`${r.contractor}|${r.lubricant}|${r.lubricantBrand}`}>
                        <td style={s.td}>
                          <div style={{ fontWeight: 700 }}>{r.lubricant}</div>
                          <div style={{ fontSize: 11.5, color: T.textSecondary }}>{r.lubricantBrand}</div>
                        </td>
                        <td style={s.td}>{r.contractor}</td>
                        <td style={s.td}>{r.lpCount}</td>
                        <td style={s.td}>{r.quantityNeeded} L</td>
                        <td style={s.td}>{r.currentStock != null ? `${r.currentStock} L` : "No matching product"}</td>
                        <td style={s.td}>
                          {r.shortfall == null ? (
                            "—"
                          ) : short ? (
                            <span style={{ ...s.badge("Overdue") }}>
                              <i className="ti ti-alert-triangle" aria-hidden="true" /> {r.shortfall} L short
                            </span>
                          ) : (
                            <span style={{ color: T.success }}>Covered</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {insufficientHistory.length > 0 && (
            <div style={{ ...s.card, marginTop: 16, borderLeft: `3px solid ${T.warning}` }}>
              <p style={{ fontWeight: 700, margin: "0 0 6px", color: T.warning }}>
                <i className="ti ti-info-circle" aria-hidden="true" /> {insufficientHistory.length} condition-based equipment not projected
              </p>
              <p style={{ fontSize: 12, color: T.textSecondary, margin: "0 0 10px" }}>
                These are changed by oil analysis/actions rather than a fixed schedule, and have no logged Oil Change history yet to
                estimate a rate from — they're excluded from the forecast above rather than shown as needing nothing.
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {insufficientHistory.map((e) => (
                  <span key={e.code} style={{ fontSize: 11.5, color: T.textSecondary, border: `1px solid ${T.border}`, borderRadius: 4, padding: "3px 8px" }}>
                    {e.code} — {e.lubricant}
                    {e.lubricantBrand ? ` (${e.lubricantBrand})` : ""}
                    {e.area ? ` · ${e.area}` : ""}
                  </span>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Movements tab (Patch 23's unified all-products ledger) ──────────────
const MOVEMENT_TYPE_FILTERS = ["All", "Receipt", "Issue", "Adjustment"];
const MOVEMENTS_DISPLAY_CAP = 200;

function MovementsTab({ webhookUrl, products, onOpenProduct }) {
  const { T, s } = useTheme();
  const [movements, setMovements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [typeFilter, setTypeFilter] = useState("All");
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .getAllOilInventoryMovements(webhookUrl)
      .then((res) => { if (!cancelled) setMovements(res); })
      .catch((err) => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [webhookUrl]);

  const productById = useMemo(() => {
    const map = new Map();
    products.forEach((p) => map.set(p.productId, p));
    return map;
  }, [products]);

  const q = search.trim().toLowerCase();
  const visible = movements.filter((m) => {
    if (typeFilter !== "All" && m.movementType !== typeFilter) return false;
    if (!q) return true;
    const product = productById.get(m.productId);
    return [m.productId, m.linkedLpId, m.doneBy, m.reference, m.contractor, product?.lubricantType, product?.lubricantBrand]
      .filter(Boolean)
      .some((f) => f.toLowerCase().includes(q));
  });
  const shown = visible.slice(0, MOVEMENTS_DISPLAY_CAP);

  return (
    <div>
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        {MOVEMENT_TYPE_FILTERS.map((t) => (
          <button
            key={t}
            style={{
              ...s.btn,
              fontSize: 12,
              background: typeFilter === t ? T.accent : "transparent",
              color: typeFilter === t ? T.accentText : T.textSecondary,
              borderColor: typeFilter === t ? T.accent : T.border,
            }}
            onClick={() => setTypeFilter(t)}
          >
            {t}
          </button>
        ))}
        <input
          style={{ ...s.input, flex: 1, minWidth: 200 }}
          type="search"
          placeholder="Search by oil, LP, done by, reference…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <p style={{ color: T.textSecondary }}>Loading movements…</p>
      ) : error ? (
        <p style={{ color: T.danger }}>{error}</p>
      ) : visible.length === 0 ? (
        <div style={s.card}>
          <p style={{ color: T.textSecondary, margin: 0 }}>No movements match the filter.</p>
        </div>
      ) : (
        <>
          <div style={{ ...s.card, padding: 0, overflowX: "auto", overflowY: "hidden" }}>
            <table style={s.table}>
              <thead>
                <tr>
                  <th style={s.th}>Date</th>
                  <th style={s.th}>Product</th>
                  <th style={s.th}>Type</th>
                  <th style={s.th}>Quantity</th>
                  <th style={s.th}>Issued To</th>
                  <th style={s.th}>Contractor</th>
                  <th style={s.th}>Done By</th>
                  <th style={s.th}>Reference</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((m) => {
                  const product = productById.get(m.productId);
                  return (
                    <tr key={m.movementId} style={{ cursor: product ? "pointer" : "default" }} onClick={() => product && onOpenProduct(m.productId)}>
                      <td style={s.td}>{m.movementDate || "—"}</td>
                      <td style={s.td}>
                        {product ? (
                          <>
                            <div style={{ fontWeight: 700 }}>{product.lubricantType}</div>
                            <div style={{ fontSize: 11.5, color: T.textSecondary }}>{product.lubricantBrand}</div>
                          </>
                        ) : (
                          m.productId
                        )}
                      </td>
                      <td style={s.td}>{m.movementType}</td>
                      <td style={s.td}>{m.quantity}</td>
                      <td style={s.td}>{m.linkedLpId || "—"}</td>
                      <td style={s.td}>{m.contractor || "—"}</td>
                      <td style={s.td}>{m.doneBy || "—"}</td>
                      <td style={s.td}>{m.reference || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {visible.length > MOVEMENTS_DISPLAY_CAP && (
            <p style={{ fontSize: 11.5, color: T.textSecondary, marginTop: 10 }}>
              Showing the first {MOVEMENTS_DISPLAY_CAP} of {visible.length} matching movements — narrow the filter or search to see more.
            </p>
          )}
        </>
      )}
    </div>
  );
}

export default function OilInventory({ webhookUrl, equipmentRegistry, pushToast }) {
  const { T, s } = useTheme();
  const [view, setView] = useState("tabs"); // "tabs" | "add" | "detail"
  const [activeTab, setActiveTab] = useState("overview");
  const [selectedProductId, setSelectedProductId] = useState(null);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    if (!webhookUrl) return;
    setLoading(true);
    setError(null);
    try {
      const rows = await api.getOilInventory(webhookUrl);
      setProducts(rows);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [webhookUrl]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (!webhookUrl) {
    return <p style={{ color: T.textSecondary }}>Add your Apps Script webhook URL in Settings first.</p>;
  }

  function openProduct(productId) {
    setSelectedProductId(productId);
    setView("detail");
  }

  if (view === "add") {
    return (
      <AddProductForm
        webhookUrl={webhookUrl}
        equipmentRegistry={equipmentRegistry}
        pushToast={pushToast}
        onCreated={(productId) => {
          setSelectedProductId(productId);
          setView("detail");
          refresh();
        }}
        onCancel={() => setView("tabs")}
      />
    );
  }

  if (view === "detail" && selectedProductId) {
    return (
      <OilProductDetail
        webhookUrl={webhookUrl}
        productId={selectedProductId}
        equipmentRegistry={equipmentRegistry}
        pushToast={pushToast}
        onBack={() => {
          setView("tabs");
          setSelectedProductId(null);
          refresh();
        }}
      />
    );
  }

  return (
    <div>
      <p style={{ ...s.sectionTitle, margin: "0 0 16px" }}>Oil Inventory</p>
      <TabBar T={T} s={s} activeTab={activeTab} setActiveTab={setActiveTab} />
      {activeTab === "overview" && <OverviewTab webhookUrl={webhookUrl} products={products} onOpenProduct={openProduct} />}
      {activeTab === "stock" && (
        <StockListTab products={products} loading={loading} error={error} onAdd={() => setView("add")} onOpenProduct={openProduct} />
      )}
      {activeTab === "consumption" && <ConsumptionTab webhookUrl={webhookUrl} onOpenProduct={openProduct} />}
      {activeTab === "forecast" && <ForecastTab webhookUrl={webhookUrl} />}
      {activeTab === "movements" && <MovementsTab webhookUrl={webhookUrl} products={products} onOpenProduct={openProduct} />}
    </div>
  );
}
