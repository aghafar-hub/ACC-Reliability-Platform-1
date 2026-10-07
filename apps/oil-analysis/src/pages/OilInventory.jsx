import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useTheme } from "../ThemeContext";
import { useSessionContractor, useIsAccEngineer, useIsRouteEngineerFor } from "../SessionContext";
import * as api from "../api";
import { formatDate, newId } from "../parsers";
import useIsMobile from "../hooks/useIsMobile";
import { SERIES_DARK, SERIES_LIGHT, isDarkSurface } from "../pointHistory";
import {
  SHORTAGE_PERIODS,
  daysLeft,
  fmtNum,
  fmtQty,
  fmtSigned,
  isCurrentMonth,
  isLow,
  lowStockSorted,
  periodLabel,
  shortfallBars,
  signedQty,
  toCsv,
} from "../inventoryLogic";
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
  // Phase 8: only the contractor's own engineer approves an equivalent.
  const canApproveEquivalent = useIsRouteEngineerFor(form.contractor || "");
  const [selectedEquivalentKey, setSelectedEquivalentKey] = useState("");
  const knownOilsForContractor = useMemo(() => knownOils.filter((o) => o.contractor === form.contractor), [knownOils, form.contractor]);

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
      if (!equivalentEnabled || !canApproveEquivalent) {
        payload.equivalentToType = "";
        payload.equivalentToBrand = "";
      }
      const saved = await api.addOilProduct(webhookUrl, payload);
      pushToast("Product added.", "success");
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
              Picking from the registry guarantees the exact spelling already used on equipment, so it always matches for auto-deduction and
              the forecast — typing it yourself (even a small spacing difference) can silently create a second, unmatched product.
            </p>
          </div>
        )}
        {(oilMode === "custom" || knownOils.length === 0) && (
          <>
            <div>
              <label style={s.label}>Lubricant Type</label>
              <input
                style={s.input}
                type="text"
                placeholder="e.g. Mobil SHC 630"
                value={form.lubricantType}
                onChange={(e) => set("lubricantType", e.target.value)}
              />
            </div>
            <div>
              <label style={s.label}>Lubricant Brand</label>
              <input
                style={s.input}
                type="text"
                placeholder="e.g. Mobil"
                value={form.lubricantBrand}
                onChange={(e) => set("lubricantBrand", e.target.value)}
              />
            </div>
          </>
        )}
        {canApproveEquivalent && (
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={{ fontSize: 12.5, display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
              <input type="checkbox" checked={equivalentEnabled} onChange={(e) => setEquivalentEnabled(e.target.checked)} />
              Approve as an equivalent for another oil (used when that oil is short; the ACC engineers and managers are told)
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
                  Routes use this product for that oil's points when the main oil is short, and the forecast counts it as cover.
                </p>
              </div>
            )}
          </div>
        )}
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
          <label style={s.label}>Low-stock Level (alert at or below)</label>
          <input
            style={s.input}
            type="number"
            min="0"
            aria-label="Low-stock level"
            value={form.recorderLevel}
            onChange={(e) => set("recorderLevel", e.target.value)}
          />
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
          <input
            style={s.input}
            type="text"
            placeholder="Optional"
            value={form.unitCost}
            onChange={(e) => set("unitCost", e.target.value)}
          />
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
        Current Stock and Last Movement Date are calculated on the sheet from every receipt/issue logged for this product — the new row gets
        those formulas automatically.
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
  const items = payload.filter((p) => p.value != null);
  if (!items.length) return null;
  return (
    <div style={{ background: T.cardBg || T.bg, border: `1px solid ${T.border}`, borderRadius: 6, padding: "6px 10px", fontSize: 12 }}>
      <div style={{ color: T.textSecondary, marginBottom: 2 }}>{label}</div>
      {items.map((p) => (
        <div key={p.dataKey} style={{ color: T.textPrimary, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
          {p.color && <span style={{ width: 8, height: 8, borderRadius: 2, background: p.color, flexShrink: 0 }} />}
          {p.name ? `${p.name}: ` : ""}
          {fmtQty(p.value, unit)}
        </div>
      ))}
    </div>
  );
}

function PeriodSelect({ s, value, onChange, label = "Shortage check" }) {
  return (
    <select
      style={{ ...s.select, width: 160, fontSize: 12 }}
      value={value}
      aria-label={label}
      onChange={(e) => onChange(Number(e.target.value))}
    >
      {SHORTAGE_PERIODS.map((p) => (
        <option key={p.days} value={p.days}>
          {p.label}
        </option>
      ))}
    </select>
  );
}

// Recomputes a contractor-filtered monthly trend from byProduct's own
// per-product `monthly` arrays (already returned by
// getOilInventoryConsumption) — client-side, since each product row
// carries its own contractor.
function monthlyTotalsFor(byProduct, monthKeys, contractor) {
  const rows = contractor && contractor !== "All" ? byProduct.filter((p) => p.contractor === contractor) : byProduct;
  return monthKeys.map((_, idx) => Math.round(rows.reduce((sum, p) => sum + (p.monthly[idx] || 0), 0) * 100) / 100);
}

// ─── Shortfall chart (Overview + Forecast) ──────────────────────────────
// Upright columns per oil: its stock (green when it covers the need, red
// when it won't) next to the projected need (blue), with the oil's
// low-stock level as a dashed line across both. With no contractor picked
// the same oil's RHI and ASEC figures are one column (see
// inventoryLogic.js's shortfallBars); the tooltip shows the split.
function ShortfallLegend({ T }) {
  const item = (swatch, text) => (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, color: T.textSecondary }}>
      {swatch}
      {text}
    </span>
  );
  const box = (color) => <span style={{ width: 10, height: 10, borderRadius: 2, background: color, display: "inline-block" }} />;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px", marginBottom: 8 }} data-testid="shortfall-legend">
      {item(box(T.success), "Stock — covers the need")}
      {item(box(T.danger), "Stock — short")}
      {item(box(T.accent), "Projected need")}
      {item(<span style={{ width: 18, borderTop: `2px dashed ${T.textPrimary}`, display: "inline-block" }} />, "Low-stock level")}
    </div>
  );
}

function ShortfallTooltip({ T, active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const line = (k, v, color) => (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 14 }}>
      <span style={{ color: T.textSecondary }}>{k}</span>
      <span style={{ fontWeight: 700, color: color || T.textPrimary }}>{v}</span>
    </div>
  );
  return (
    <div
      style={{
        background: T.cardBg || T.bg,
        border: `1px solid ${T.border}`,
        borderRadius: 6,
        padding: "8px 10px",
        fontSize: 12,
        minWidth: 190,
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 4 }}>{d.label}</div>
      {line("Projected need", fmtQty(d.need))}
      {line("In stock", d.hasStock ? fmtQty(d.stock) : "No stock product")}
      {line(d.short ? "Short by" : "Covered", d.short ? fmtQty(d.shortBy) : "✓", d.short ? T.danger : T.success)}
      {d.level != null && line("Low-stock level", fmtQty(d.level))}
      {d.parts.length > 1 && (
        <div style={{ borderTop: `1px solid ${T.border}`, marginTop: 6, paddingTop: 6 }}>
          {d.parts.map((p) => (
            <div key={p.contractor} style={{ color: T.textSecondary }}>
              <strong style={{ color: T.textPrimary }}>{p.contractor}</strong>: need {fmtQty(p.need)}, stock{" "}
              {p.stock == null ? "none" : fmtQty(p.stock)}
              {p.shortBy > 0 ? <span style={{ color: T.danger, fontWeight: 700 }}> — short {fmtQty(p.shortBy)}</span> : ""}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ForecastChart({ T, rows, merge }) {
  const bars = useMemo(() => shortfallBars(rows, { merge }), [rows, merge]);
  if (bars.length === 0) return <p style={{ color: T.textSecondary, margin: 0 }}>No oil is needed in this period.</p>;
  // fills the card; scrolls sideways only when there are many oils
  const minWidth = Math.max(320, bars.length * 92);
  const half = Math.min(40, 92 * 0.4);
  return (
    <div data-testid="shortfall-chart">
      <ShortfallLegend T={T} />
      <div style={{ overflowX: "auto" }}>
        <div style={{ minWidth }}>
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={bars} margin={{ top: 10, right: 10, bottom: 55, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={T.border} vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: T.textSecondary }}
                tickFormatter={(v) => (v.length > 32 ? `${v.slice(0, 31)}…` : v)}
                axisLine={{ stroke: T.border }}
                tickLine={false}
                angle={-30}
                textAnchor="end"
                interval={0}
                height={60}
              />
              <YAxis tick={{ fontSize: 11, fill: T.textSecondary }} axisLine={false} tickLine={false} width={44} tickFormatter={fmtNum} />
              <Tooltip content={<ShortfallTooltip T={T} />} cursor={{ fill: T.accent + "15" }} />
              <Bar maxBarSize={40} dataKey="stock" name="Stock" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                {bars.map((d, i) => (
                  <Cell key={i} fill={d.short ? T.danger : T.success} />
                ))}
              </Bar>
              <Bar maxBarSize={40} dataKey="need" name="Projected need" fill={T.accent} radius={[4, 4, 0, 0]} isAnimationActive={false} />
              <Line
                dataKey="level"
                name="Low-stock level"
                stroke={T.textPrimary}
                strokeWidth={0}
                isAnimationActive={false}
                activeDot={false}
                dot={(p) =>
                  p.value == null || p.cx == null || p.cy == null ? (
                    <g key={p.index} />
                  ) : (
                    <line
                      key={p.index}
                      x1={p.cx - half}
                      x2={p.cx + half}
                      y1={p.cy}
                      y2={p.cy}
                      stroke={T.textPrimary}
                      strokeWidth={2}
                      strokeDasharray="5 3"
                    />
                  )
                }
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

// ─── Overview tab ───────────────────────────────────────────────────────
function OverviewTab({ webhookUrl, products, contractorFilter, period, setPeriod, onOpenProduct, onNavigateTab, onOpenStock }) {
  const { T, s } = useTheme();
  const [consumption, setConsumption] = useState(null);
  const [forecast, setForecast] = useState(null);
  const [loadingC, setLoadingC] = useState(true);
  const [loadingF, setLoadingF] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoadingC(true);
    api
      .getOilInventoryConsumption(webhookUrl, 6)
      .then((c) => {
        if (!cancelled) setConsumption(c);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoadingC(false);
      });
    return () => {
      cancelled = true;
    };
  }, [webhookUrl]);

  useEffect(() => {
    let cancelled = false;
    setLoadingF(true);
    api
      .getOilInventoryForecast(webhookUrl, { days: period })
      .then((f) => {
        if (!cancelled) setForecast(f);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoadingF(false);
      });
    return () => {
      cancelled = true;
    };
  }, [webhookUrl, period]);

  const lowStock = lowStockSorted(products);
  const noLevel = products.filter((p) => p.status !== "Discontinued" && p.recorderLevel == null).length;
  const forecastRows = (forecast?.forecast || []).filter((r) => contractorFilter === "All" || r.contractor === contractorFilter);
  const levelById = Object.fromEntries(products.map((p) => [p.productId, p.recorderLevel]));
  const chartRows = forecastRows.map((r) => ({
    ...r,
    level: r.productId && levelById[r.productId] != null ? levelById[r.productId] : null,
  }));
  const bars = shortfallBars(chartRows, { merge: contractorFilter === "All" });
  const shortCount = bars.filter((b) => b.short).length;

  const monthKeys = consumption?.months || [];
  const monthlyTotals = consumption ? monthlyTotalsFor(consumption.byProduct, monthKeys, contractorFilter) : [];
  const lastIdx = monthKeys.length - 1;
  const partial = lastIdx >= 0 && isCurrentMonth(monthKeys[lastIdx]);
  const thisMonthTotal = partial ? monthlyTotals[lastIdx] : 0;
  const complete = partial ? monthlyTotals.slice(0, -1) : monthlyTotals;
  const avgMonth = complete.length ? complete.reduce((a, b) => a + b, 0) / complete.length : null;
  // complete months solid; the month we're in dashed (its total is only so far)
  const chartData = monthKeys.map((m, i) => ({
    month: monthLabel(m) + (partial && i === lastIdx ? " (so far)" : ""),
    total: partial && i === lastIdx ? null : monthlyTotals[i],
    soFar: partial && i >= lastIdx - 1 ? monthlyTotals[i] : null,
  }));

  const kpis = [
    { label: "Total Products", value: products.length, color: "accent", icon: "ti-box" },
    {
      label: "Low Stock",
      value: lowStock.length,
      color: lowStock.length ? "danger" : "success",
      icon: "ti-alert-triangle",
      onClick: () => onOpenStock("low"),
    },
    {
      label: "This month so far",
      value: fmtQty(thisMonthTotal),
      sub: avgMonth != null ? `avg ${fmtQty(avgMonth)} / month` : "",
      color: "textPrimary",
      icon: "ti-chart-bar",
      onClick: () => onNavigateTab("consumption"),
    },
    {
      label: `Shortfalls (${periodLabel(period)})`,
      value: loadingF ? "…" : shortCount,
      color: shortCount ? "warning" : "success",
      icon: "ti-alert-circle",
      onClick: () => onNavigateTab("forecast"),
    },
  ];

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 12, marginBottom: 20 }}>
        {kpis.map((m) => {
          const Tag = m.onClick ? "button" : "div";
          return (
            <Tag
              key={m.label}
              type={m.onClick ? "button" : undefined}
              onClick={m.onClick}
              data-testid={`inv-kpi-${m.icon}`}
              style={{
                ...s.metricCard,
                display: "flex",
                alignItems: "center",
                gap: 12,
                width: "100%",
                textAlign: "left",
                font: "inherit",
                cursor: m.onClick ? "pointer" : "default",
              }}
            >
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
                <div style={{ fontSize: 11, color: T.textSecondary }}>{m.label}</div>
                {m.sub && <div style={{ fontSize: 10.5, color: T.textMuted || T.textSecondary }}>{m.sub}</div>}
              </div>
            </Tag>
          );
        })}
      </div>

      <div style={{ ...s.card, marginBottom: 20 }}>
        <p style={{ fontWeight: 700, margin: "0 0 2px" }}>Consumption Trend (6 months)</p>
        <p style={{ fontSize: 11.5, color: T.textSecondary, margin: "0 0 10px" }}>
          Oil issued per month{partial ? " — the dashed end is this month so far" : ""}.
        </p>
        {loadingC ? (
          <p style={{ color: T.textSecondary, margin: 0 }}>Loading…</p>
        ) : monthlyTotals.every((v) => !v) ? (
          <p style={{ color: T.textSecondary, margin: 0 }}>No logged Issue movements in this window yet.</p>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={chartData} margin={{ top: 10, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={T.border} vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: T.textSecondary }} axisLine={{ stroke: T.border }} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: T.textSecondary }} axisLine={false} tickLine={false} width={44} tickFormatter={fmtNum} />
              <Tooltip content={<ChartTooltip T={T} />} />
              <Line
                type="linear"
                dataKey="total"
                name="Issued"
                stroke={T.accent}
                strokeWidth={2}
                dot={{ r: 4, fill: T.accent, strokeWidth: 0 }}
                isAnimationActive={false}
              />
              <Line
                type="linear"
                dataKey="soFar"
                name="So far"
                stroke={T.accent}
                strokeWidth={2}
                strokeDasharray="5 4"
                isAnimationActive={false}
                dot={(p) =>
                  p.index === lastIdx && p.cx != null && p.cy != null ? (
                    <circle key={p.index} cx={p.cx} cy={p.cy} r={5} fill={T.cardBg} stroke={T.accent} strokeWidth={2} />
                  ) : (
                    <g key={p.index} />
                  )
                }
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      <div style={{ ...s.card, marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 4 }}>
          <p style={{ fontWeight: 700, margin: 0 }}>Upcoming Shortfalls</p>
          <PeriodSelect s={s} value={period} onChange={setPeriod} />
        </div>
        <p style={{ fontSize: 11.5, color: T.textSecondary, margin: "0 0 10px" }}>
          Stock vs. the oil the planned work needs in the {periodLabel(period)}, worst shortfall first.
          {contractorFilter === "All" ? " The same oil at RHI and ASEC is one column — pick a contractor to see theirs alone." : ""}
        </p>
        {loadingF ? (
          <p style={{ color: T.textSecondary, margin: 0 }}>Loading…</p>
        ) : (
          <ForecastChart T={T} rows={chartRows} merge={contractorFilter === "All"} />
        )}
      </div>

      <div
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", margin: "0 0 10px" }}
      >
        <p style={{ fontWeight: 700, margin: 0 }}>Low Stock</p>
        {noLevel > 0 && (
          <span style={{ fontSize: 12, color: T.textSecondary }} data-testid="inv-no-level">
            <i className="ti ti-info-circle" aria-hidden="true" /> {noLevel} product{noLevel === 1 ? " has" : "s have"} no low-stock level,
            so {noLevel === 1 ? "it's" : "they're"} never flagged.{" "}
            <button type="button" style={{ ...s.btn, padding: "2px 8px", fontSize: 11.5 }} onClick={() => onOpenStock("nolevel")}>
              Set levels
            </button>
          </span>
        )}
      </div>
      {lowStock.length === 0 ? (
        <div style={s.card}>
          <p style={{ color: T.textSecondary, margin: 0 }}>Nothing at or below its low-stock level right now.</p>
        </div>
      ) : (
        <div style={{ ...s.card, padding: 0, overflowX: "auto", overflowY: "hidden" }}>
          <table style={s.table} data-testid="inv-low-table">
            <thead>
              <tr>
                <th style={s.th}>Type / Brand</th>
                <th style={s.th}>Location</th>
                <th style={s.th}>Contractor</th>
                <th style={s.th}>Stock</th>
                <th style={s.th}>Low-stock Level</th>
                <th style={s.th}>Below Level By</th>
                <th style={s.th}>Days Left</th>
                <th style={s.th}>Last Receipt</th>
              </tr>
            </thead>
            <tbody>
              {lowStock.map((p) => (
                <tr key={p.productId} style={{ cursor: "pointer" }} onClick={() => onOpenProduct(p.productId)}>
                  <td style={s.td}>
                    <div style={{ fontWeight: 700 }}>{p.lubricantType}</div>
                    <div style={{ fontSize: 11.5, color: T.textSecondary }}>{p.lubricantBrand}</div>
                  </td>
                  <td style={s.td}>{p.storageLocation || "—"}</td>
                  <td style={s.td}>{p.contractor}</td>
                  <td style={s.td}>
                    <span style={{ color: T.danger, fontWeight: 700 }}>{fmtQty(p.currentStock, p.unit)}</span>
                  </td>
                  <td style={s.td}>{fmtQty(p.recorderLevel, p.unit)}</td>
                  <td style={s.td}>{fmtQty(p.belowBy, p.unit)}</td>
                  <td style={s.td}>
                    <DaysLeft T={T} days={p.daysLeft} />
                  </td>
                  <td style={s.td}>{p.lastReceiptDate ? formatDate(p.lastReceiptDate) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// "12 days" — red under 15, amber under 45; "—" with no recent use.
function DaysLeft({ T, days }) {
  if (days == null)
    return (
      <span style={{ color: T.textSecondary }} title="Nothing issued in the last 90 days">
        —
      </span>
    );
  const color = days < 15 ? T.danger : days < 45 ? T.warning : T.textPrimary;
  return (
    <span style={{ color, fontWeight: days < 45 ? 700 : 400 }} title="At the rate used over the last 90 days">
      {days} day{days === 1 ? "" : "s"}
    </span>
  );
}

// ─── Stock List tab ─────────────────────────────────────────────────────
// Low-stock level, editable right in the Stock List (the contractor's
// engineer or an ACC engineer) — same save as the product page's card.
function LowStockCell({ webhookUrl, product, pushToast, onSaved }) {
  const { T, s } = useTheme();
  const isContractorEngineer = useIsRouteEngineerFor(product.contractor || "");
  const isAcc = useIsAccEngineer();
  const canEdit = isContractorEngineer || isAcc;
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(product.recorderLevel ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    const level = Number(value);
    if (value === "" || Number.isNaN(level) || level < 0) {
      pushToast("Enter a low-stock level of 0 or more.", "error");
      return;
    }
    setSaving(true);
    try {
      await api.setProductLowStockLevel(webhookUrl, product.productId, level);
      pushToast("Low-stock level saved.", "success");
      setEditing(false);
      onSaved();
    } catch (err) {
      pushToast(err.message, "error");
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }} onClick={(e) => e.stopPropagation()}>
        <input
          style={{ ...s.input, width: 80 }}
          type="number"
          min="0"
          aria-label={`Low-stock level for ${product.productId}`}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <button style={s.btnPrimary} disabled={saving} onClick={save}>
          {saving ? "…" : "Save"}
        </button>
        <button style={s.btn} disabled={saving} onClick={() => setEditing(false)}>
          Cancel
        </button>
      </span>
    );
  }
  return (
    <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
      {product.recorderLevel != null ? fmtQty(product.recorderLevel, product.unit) : <span style={{ color: T.textMuted }}>Not set</span>}
      {canEdit && (
        <button
          style={{ ...s.btn, padding: "2px 8px", fontSize: 11 }}
          aria-label={`Change low-stock level for ${product.productId}`}
          onClick={(e) => {
            e.stopPropagation();
            setValue(product.recorderLevel ?? "");
            setEditing(true);
          }}
        >
          <i className="ti ti-pencil" aria-hidden="true" /> Edit
        </button>
      )}
    </span>
  );
}

const STOCK_FILTERS = [
  { key: "active", label: "Active", test: (p) => p.status !== "Discontinued" },
  { key: "low", label: "Low", test: (p) => p.status !== "Discontinued" && isLow(p) },
  { key: "nolevel", label: "No low-stock level", test: (p) => p.status !== "Discontinued" && p.recorderLevel == null },
  { key: "discontinued", label: "Discontinued", test: (p) => p.status === "Discontinued" },
  { key: "all", label: "All", test: () => true },
];

function StockListTab({ webhookUrl, pushToast, onChanged, products, loading, error, onAdd, onOpenProduct, filter, setFilter }) {
  const { T, s } = useTheme();
  const [search, setSearch] = useState("");
  const q = search.trim().toLowerCase();
  const f = STOCK_FILTERS.find((x) => x.key === filter) || STOCK_FILTERS[0];
  const visible = products.filter((p) => {
    if (!f.test(p)) return false;
    if (!q) return true;
    return [p.productId, p.lubricantType, p.lubricantBrand, p.storageLocation, p.supplier]
      .filter(Boolean)
      .some((v) => v.toLowerCase().includes(q));
  });

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
        <input
          style={{ ...s.input, maxWidth: 420, flex: "1 1 220px" }}
          type="search"
          placeholder="Search by type, brand, location, or supplier…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button style={s.btnPrimary} onClick={onAdd}>
          <i className="ti ti-plus" aria-hidden="true" /> Add Product
        </button>
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }} role="group" aria-label="Show">
        {STOCK_FILTERS.map((x) => {
          const n = products.filter(x.test).length;
          const on = x.key === f.key;
          return (
            <button
              key={x.key}
              type="button"
              aria-pressed={on}
              data-testid={`stock-filter-${x.key}`}
              onClick={() => setFilter(x.key)}
              style={{
                ...s.btn,
                padding: "4px 10px",
                fontSize: 12,
                background: on ? T.accent : "transparent",
                color: on ? T.accentText : T.textSecondary,
                borderColor: on ? T.accent : T.border,
              }}
            >
              {x.label} ({n})
            </button>
          );
        })}
      </div>

      {loading ? (
        <p style={{ color: T.textSecondary }}>Loading inventory…</p>
      ) : error ? (
        <p style={{ color: T.danger }}>{error}</p>
      ) : visible.length === 0 ? (
        <div style={s.card}>
          <p style={{ color: T.textSecondary, margin: 0 }}>No products match.</p>
        </div>
      ) : (
        <div style={{ ...s.card, padding: 0, overflowX: "auto", overflowY: "hidden" }}>
          <table style={s.table} data-testid="stock-table">
            <thead>
              <tr>
                <th style={s.th}>Type / Brand</th>
                <th style={s.th}>Contractor</th>
                <th style={s.th}>Stock</th>
                <th style={s.th}>Days Left</th>
                <th style={s.th}>Low-stock Level</th>
                <th style={s.th}>Location</th>
                <th style={s.th}>Status</th>
                <th style={s.th}>Last Movement</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((p) => {
                const low = isLow(p);
                return (
                  <tr key={p.productId} style={{ cursor: "pointer" }} onClick={() => onOpenProduct(p.productId)}>
                    <td style={s.td}>
                      <div style={{ fontWeight: 700 }}>{p.lubricantType}</div>
                      <div style={{ fontSize: 11.5, color: T.textSecondary }}>{p.lubricantBrand}</div>
                      {p.equivalentToType && (
                        <div style={{ fontSize: 11, color: T.warning, fontWeight: 600 }}>
                          Approved equivalent for {p.equivalentToType}
                          {p.equivalentToBrand ? ` — ${p.equivalentToBrand}` : ""}
                        </div>
                      )}
                    </td>
                    <td style={s.td}>{p.contractor || "—"}</td>
                    <td style={{ ...s.td, whiteSpace: "nowrap" }}>
                      <span style={low ? { color: T.danger, fontWeight: 700 } : undefined}>{fmtQty(p.currentStock, p.unit)}</span>
                      {low && (
                        <span style={{ ...s.badge("Overdue"), marginLeft: 6 }}>
                          <i className="ti ti-alert-triangle" aria-hidden="true" /> Low
                        </span>
                      )}
                    </td>
                    <td style={{ ...s.td, whiteSpace: "nowrap" }}>
                      <DaysLeft T={T} days={daysLeft(p)} />
                    </td>
                    <td style={s.td}>
                      <LowStockCell webhookUrl={webhookUrl} product={p} pushToast={pushToast} onSaved={onChanged} />
                    </td>
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

// ─── Consumption tab ────────────────────────────────────────────────────
const CONSUMPTION_MONTHS_OPTIONS = [3, 6, 12];

function ConsumptionTab({ webhookUrl, contractorFilter, onOpenProduct }) {
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
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [webhookUrl, months]);

  const byProductAll = useMemo(() => data?.byProduct || [], [data]);
  const monthKeys = useMemo(() => data?.months || [], [data]);
  // With no contractor picked and both present, one stacked series per
  // contractor, in the categorical palette (never the warning/danger
  // colours, which mean "something is wrong").
  const presentContractors = useMemo(
    () => Array.from(new Set(byProductAll.map((p) => p.contractor).filter(Boolean))).sort(),
    [byProductAll]
  );
  const splitChart = contractorFilter === "All" && presentContractors.length > 1;
  const palette = isDarkSurface(T.cardBg) ? SERIES_DARK : SERIES_LIGHT;
  const lastIdx = monthKeys.length - 1;
  const partial = lastIdx >= 0 && isCurrentMonth(monthKeys[lastIdx]);

  const chartData = useMemo(() => {
    if (!monthKeys.length) return [];
    const label = (m, i) => monthLabel(m) + (partial && i === lastIdx ? " (so far)" : "");
    if (splitChart) {
      const totalsByContractor = presentContractors.map((c) => monthlyTotalsFor(byProductAll, monthKeys, c));
      return monthKeys.map((m, i) => {
        const row = { month: label(m, i) };
        presentContractors.forEach((c, ci) => {
          row[c] = totalsByContractor[ci][i];
        });
        return row;
      });
    }
    const totals = monthlyTotalsFor(byProductAll, monthKeys, contractorFilter);
    return monthKeys.map((m, i) => ({ month: label(m, i), total: totals[i] }));
  }, [monthKeys, splitChart, presentContractors, byProductAll, contractorFilter, partial, lastIdx]);
  const hasChartData = chartData.some((d) => Object.keys(d).some((k) => k !== "month" && d[k] > 0));

  const byProduct = (contractorFilter === "All" ? byProductAll : byProductAll.filter((p) => p.contractor === contractorFilter))
    .slice()
    .sort((a, b) => b.total - a.total);
  const grandTotal = byProduct.reduce((sum, p) => sum + (p.total || 0), 0);
  const opacity = (i) => (partial && i === lastIdx ? 0.45 : 1);

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
            <p style={{ fontWeight: 700, margin: "0 0 2px" }}>Total Consumption by Month{splitChart ? " — by Contractor" : ""}</p>
            {partial && (
              <p style={{ fontSize: 11.5, color: T.textSecondary, margin: "0 0 10px" }}>The pale last column is this month so far.</p>
            )}
            {!hasChartData ? (
              <p style={{ color: T.textSecondary, margin: 0 }}>No logged Issue movements in this window.</p>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke={T.border} vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: T.textSecondary }} axisLine={{ stroke: T.border }} tickLine={false} />
                  <YAxis
                    tick={{ fontSize: 11, fill: T.textSecondary }}
                    axisLine={false}
                    tickLine={false}
                    width={44}
                    tickFormatter={fmtNum}
                  />
                  <Tooltip content={<ChartTooltip T={T} />} cursor={{ fill: T.accent + "15" }} />
                  {splitChart && <Legend wrapperStyle={{ fontSize: 11 }} />}
                  {splitChart ? (
                    presentContractors.map((c, idx) => (
                      <Bar
                        key={c}
                        dataKey={c}
                        name={c}
                        stackId="a"
                        fill={palette[idx % palette.length]}
                        radius={idx === presentContractors.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                        isAnimationActive={false}
                      >
                        {chartData.map((_, i) => (
                          <Cell key={i} fillOpacity={opacity(i)} />
                        ))}
                      </Bar>
                    ))
                  ) : (
                    <Bar dataKey="total" name="Issued" fill={palette[0]} radius={[4, 4, 0, 0]} isAnimationActive={false}>
                      {chartData.map((_, i) => (
                        <Cell key={i} fillOpacity={opacity(i)} />
                      ))}
                    </Bar>
                  )}
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
              <table style={s.table} data-testid="consumption-table">
                <thead>
                  <tr>
                    <th style={s.th}>Type / Brand</th>
                    <th style={s.th}>Contractor</th>
                    <th style={s.th}>Total</th>
                    <th style={s.th}>Avg / Month</th>
                    <th style={s.th}>% of Total</th>
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
                      <td style={s.td}>{fmtQty(p.total)}</td>
                      <td style={s.td}>{fmtQty(p.averageMonthly)}</td>
                      <td style={s.td}>{grandTotal ? `${fmtNum((p.total / grandTotal) * 100)}%` : "—"}</td>
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

// ─── Forecast tab ───────────────────────────────────────────────────────
// Projected need vs. current stock for the chosen period — see
// backend/oil-lubrication/src/OilInventory.js's getOilInventoryForecast.
// The period is shared with the Overview's Upcoming Shortfalls.
function ForecastTab({ webhookUrl, contractorFilter, products, period, setPeriod }) {
  const { T, s } = useTheme();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .getOilInventoryForecast(webhookUrl, { days: period })
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [webhookUrl, period]);

  const levelById = useMemo(() => Object.fromEntries((products || []).map((p) => [p.productId, p.recorderLevel])), [products]);
  const rows = (data?.forecast || [])
    .filter((r) => contractorFilter === "All" || r.contractor === contractorFilter)
    .map((r) => {
      const level = r.productId != null && levelById[r.productId] != null ? levelById[r.productId] : null;
      const after = r.currentStock != null ? Math.round((r.currentStock - (r.quantityNeeded || 0)) * 100) / 100 : null;
      return { ...r, level, after, belowLevel: after != null && level != null && after <= level };
    })
    .sort((a, b) => (b.currentStock == null) - (a.currentStock == null) || (b.shortfall || 0) - (a.shortfall || 0));
  const shortCount = rows.filter((r) => r.shortfall == null || r.shortfall > 0).length;
  const insufficientHistory = (data?.insufficientHistory || []).filter(
    (e) => contractorFilter === "All" || e.contractor === contractorFilter
  );

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <label style={s.label}>Shortage check</label>
        <PeriodSelect s={s} value={period} onChange={setPeriod} />
        {data?.windowEnd && <span style={{ fontSize: 12, color: T.textSecondary }}>through {formatDate(data.windowEnd)}</span>}
      </div>
      {!loading && !error && shortCount > 0 && (
        <div style={{ ...s.card, borderColor: T.danger, marginBottom: 14, fontSize: 13 }}>
          <i className="ti ti-alert-triangle" aria-hidden="true" style={{ color: T.danger, marginRight: 6 }} />
          <strong>
            {shortCount} oil{shortCount === 1 ? "" : "s"} won't cover the planned work in this period.
          </strong>{" "}
          Obtain stock, reschedule the work, or use an approved equivalent oil.
        </div>
      )}

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
            <>
              <div style={{ ...s.card, marginBottom: 20 }}>
                <p style={{ fontWeight: 700, margin: "0 0 4px" }}>Current Stock vs. Projected Need</p>
                <p style={{ fontSize: 11.5, color: T.textSecondary, margin: "0 0 10px" }}>
                  Worst shortfall first.
                  {contractorFilter === "All"
                    ? " The same oil at RHI and ASEC is one column (hover for each contractor) — pick a contractor to see theirs alone."
                    : ""}
                </p>
                <ForecastChart T={T} rows={rows} merge={contractorFilter === "All"} />
              </div>
              <div style={{ ...s.card, padding: 0, overflowX: "auto", overflowY: "hidden" }}>
                <table style={s.table} data-testid="forecast-table">
                  <thead>
                    <tr>
                      <th style={s.th}>Oil</th>
                      <th style={s.th}>Contractor</th>
                      <th style={s.th}>LPs Contributing</th>
                      <th style={s.th}>Projected Need</th>
                      <th style={s.th}>Current Stock</th>
                      <th style={s.th}>Shortfall</th>
                      <th style={s.th}>Low-stock Level</th>
                      <th style={s.th}>Stock After Work</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const noProduct = r.currentStock == null;
                      const short = !noProduct && r.shortfall > 0;
                      return (
                        <tr key={`${r.contractor}|${r.lubricant}|${r.lubricantBrand}`}>
                          <td style={s.td}>
                            <div style={{ fontWeight: 700 }}>{r.lubricant}</div>
                            <div style={{ fontSize: 11.5, color: T.textSecondary }}>{r.lubricantBrand}</div>
                          </td>
                          <td style={s.td}>{r.contractor}</td>
                          <td style={s.td}>{r.lpCount}</td>
                          <td style={s.td}>{fmtQty(r.quantityNeeded)}</td>
                          <td style={s.td}>
                            {noProduct ? "—" : fmtQty(r.currentStock)}
                            {(r.coveredBy || []).length > 1 && (
                              <div style={{ fontSize: 11, color: T.textSecondary }}>incl. {r.coveredBy.slice(1).join(", ")}</div>
                            )}
                          </td>
                          <td style={s.td}>
                            {noProduct ? (
                              <span
                                style={{ ...s.badge("Overdue") }}
                                data-testid="forecast-no-product"
                                title="No product for this oil in the inventory — add it, or approve an equivalent"
                              >
                                <i className="ti ti-package-off" aria-hidden="true" /> No stock product
                              </span>
                            ) : short ? (
                              <span style={{ ...s.badge("Overdue") }}>
                                <i className="ti ti-alert-triangle" aria-hidden="true" /> {fmtQty(r.shortfall)} short
                              </span>
                            ) : (
                              <span style={{ color: T.success }}>Covered</span>
                            )}
                          </td>
                          <td style={s.td}>{r.level != null ? fmtQty(r.level) : "—"}</td>
                          <td style={s.td}>
                            {r.after == null ? (
                              "—"
                            ) : (
                              <span style={r.belowLevel ? { color: T.warning, fontWeight: 700 } : undefined}>
                                {fmtQty(r.after)}
                                {r.belowLevel ? " — at/below low-stock level" : ""}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
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
                  <span
                    key={e.code}
                    style={{ fontSize: 11.5, color: T.textSecondary, border: `1px solid ${T.border}`, borderRadius: 4, padding: "3px 8px" }}
                  >
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

// ─── Movements tab ──────────────────────────────────────────────────────
const MOVEMENT_TYPE_FILTERS = ["All", "Receipt", "Issue", "Adjustment"];
const MOVEMENTS_PAGE = 50;
const dayStart = (v) => (v ? new Date(`${v}T00:00:00`).getTime() : null);

function MovementsTab({ webhookUrl, products, contractorFilter, onOpenProduct }) {
  const { T, s } = useTheme();
  const [movements, setMovements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [typeFilter, setTypeFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .getAllOilInventoryMovements(webhookUrl)
      .then((res) => {
        if (!cancelled) setMovements(res);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [webhookUrl]);

  useEffect(() => setPage(0), [typeFilter, search, from, to, contractorFilter]);

  const productById = useMemo(() => new Map(products.map((p) => [p.productId, p])), [products]);

  const q = search.trim().toLowerCase();
  const fromT = dayStart(from);
  const toT = to ? dayStart(to) + 86400000 : null;
  const visible = movements.filter((m) => {
    if (contractorFilter !== "All" && m.contractor !== contractorFilter) return false;
    if (typeFilter !== "All" && m.movementType !== typeFilter) return false;
    if (fromT != null && (m.movementTime == null || m.movementTime < fromT)) return false;
    if (toT != null && (m.movementTime == null || m.movementTime >= toT)) return false;
    if (!q) return true;
    const product = productById.get(m.productId);
    return [m.productId, m.linkedLpId, m.doneBy, m.reference, m.contractor, product?.lubricantType, product?.lubricantBrand]
      .filter(Boolean)
      .some((v) => v.toLowerCase().includes(q));
  });
  const pages = Math.max(1, Math.ceil(visible.length / MOVEMENTS_PAGE));
  const cur = Math.min(page, pages - 1);
  const shown = visible.slice(cur * MOVEMENTS_PAGE, (cur + 1) * MOVEMENTS_PAGE);

  function exportCsv() {
    const rows = [
      ["Date", "Product ID", "Oil", "Brand", "Type", "Quantity", "Unit", "Issued To", "Contractor", "Done By", "Reference", "Notes"],
    ];
    visible.forEach((m) => {
      const p = productById.get(m.productId);
      rows.push([
        m.movementDate,
        m.productId,
        p?.lubricantType || "",
        p?.lubricantBrand || "",
        m.movementType,
        signedQty(m.movementType, m.quantity) ?? "",
        p?.unit || "L",
        m.linkedLpId,
        m.contractor,
        m.doneBy,
        m.reference,
        m.notes,
      ]);
    });
    const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `Oil-Movements${contractorFilter !== "All" ? `-${contractorFilter}` : ""}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <select
          style={{ ...s.select, width: 140, fontSize: 12 }}
          value={typeFilter}
          aria-label="Movement type"
          onChange={(e) => setTypeFilter(e.target.value)}
        >
          {MOVEMENT_TYPE_FILTERS.map((t) => (
            <option key={t} value={t}>
              {t === "All" ? "All Types" : t}
            </option>
          ))}
        </select>
        <label style={{ fontSize: 12, color: T.textSecondary, display: "inline-flex", alignItems: "center", gap: 6 }}>
          From
          <input
            style={{ ...s.input, width: 150, fontSize: 12 }}
            type="date"
            value={from}
            max={to || undefined}
            aria-label="From date"
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label style={{ fontSize: 12, color: T.textSecondary, display: "inline-flex", alignItems: "center", gap: 6 }}>
          To
          <input
            style={{ ...s.input, width: 150, fontSize: 12 }}
            type="date"
            value={to}
            min={from || undefined}
            aria-label="To date"
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        <input
          style={{ ...s.input, flex: 1, minWidth: 200 }}
          type="search"
          placeholder="Search by oil, LP, done by, reference…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button type="button" style={s.btn} onClick={exportCsv} disabled={!visible.length} data-testid="movements-export">
          <i className="ti ti-file-spreadsheet" aria-hidden="true" /> Export (Excel)
        </button>
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
            <table style={s.table} data-testid="movements-table">
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
                  const qty = signedQty(m.movementType, m.quantity);
                  return (
                    <tr
                      key={m.movementId}
                      style={{ cursor: product ? "pointer" : "default" }}
                      onClick={() => product && onOpenProduct(m.productId)}
                    >
                      <td style={{ ...s.td, whiteSpace: "nowrap" }}>{m.movementDate || "—"}</td>
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
                      <td style={{ ...s.td, whiteSpace: "nowrap", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                        {fmtSigned(qty, product?.unit || "L")}
                      </td>
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
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, color: T.textSecondary }} data-testid="movements-range">
              {cur * MOVEMENTS_PAGE + 1}–{cur * MOVEMENTS_PAGE + shown.length} of {visible.length}
            </span>
            {pages > 1 && (
              <span style={{ display: "inline-flex", gap: 6 }}>
                <button type="button" style={s.btn} disabled={cur === 0} onClick={() => setPage(cur - 1)}>
                  <i className="ti ti-chevron-left" aria-hidden="true" /> Previous
                </button>
                <button
                  type="button"
                  style={s.btn}
                  disabled={cur >= pages - 1}
                  onClick={() => setPage(cur + 1)}
                  data-testid="movements-next"
                >
                  Next <i className="ti ti-chevron-right" aria-hidden="true" />
                </button>
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default function OilInventory({ webhookUrl, equipmentRegistry, pushToast }) {
  const { T, s } = useTheme();
  const isMobile = useIsMobile();
  const [view, setView] = useState("tabs"); // "tabs" | "add" | "detail"
  const [activeTab, setActiveTab] = useState("overview");
  const [selectedProductId, setSelectedProductId] = useState(null);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // One shortage-check period for the Overview's Upcoming Shortfalls and
  // the Forecast tab, so the count on the card is the count you land on.
  const [period, setPeriod] = useState(90);
  const [stockFilter, setStockFilter] = useState("active");
  // Stock is owned per-contractor, not pooled. Locked to the account's own
  // org for a scoped caller (their data is already scoped server-side).
  const scopedContractor = useSessionContractor();
  const [contractorFilter, setContractorFilter] = useState(scopedContractor || "All");
  const visibleProducts = useMemo(
    () => (contractorFilter === "All" ? products : products.filter((p) => p.contractor === contractorFilter)),
    [products, contractorFilter]
  );

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
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 16 }}>
        <p style={{ ...s.sectionTitle, margin: 0 }}>Oil Inventory</p>
        {!scopedContractor && (
          <select
            style={{ ...s.select, width: isMobile ? "100%" : 170, fontSize: 12 }}
            value={contractorFilter}
            aria-label="Contractor"
            onChange={(e) => setContractorFilter(e.target.value)}
          >
            <option value="All">All Contractors</option>
            {CONTRACTOR_OPTIONS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        )}
      </div>
      <TabBar T={T} s={s} activeTab={activeTab} setActiveTab={setActiveTab} />
      {activeTab === "overview" && (
        <OverviewTab
          webhookUrl={webhookUrl}
          products={visibleProducts}
          contractorFilter={contractorFilter}
          period={period}
          setPeriod={setPeriod}
          onOpenProduct={openProduct}
          onNavigateTab={setActiveTab}
          onOpenStock={(f) => {
            setStockFilter(f);
            setActiveTab("stock");
          }}
        />
      )}
      {activeTab === "stock" && (
        <StockListTab
          webhookUrl={webhookUrl}
          pushToast={pushToast}
          onChanged={refresh}
          products={visibleProducts}
          loading={loading}
          error={error}
          onAdd={() => setView("add")}
          onOpenProduct={openProduct}
          filter={stockFilter}
          setFilter={setStockFilter}
        />
      )}
      {activeTab === "consumption" && (
        <ConsumptionTab webhookUrl={webhookUrl} contractorFilter={contractorFilter} onOpenProduct={openProduct} />
      )}
      {activeTab === "forecast" && (
        <ForecastTab
          webhookUrl={webhookUrl}
          contractorFilter={contractorFilter}
          products={products}
          period={period}
          setPeriod={setPeriod}
        />
      )}
      {activeTab === "movements" && (
        <MovementsTab webhookUrl={webhookUrl} products={visibleProducts} contractorFilter={contractorFilter} onOpenProduct={openProduct} />
      )}
    </div>
  );
}
