import { useCallback, useEffect, useMemo, useState } from "react";
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
  });
  const [saving, setSaving] = useState(false);

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

  async function handleCreate() {
    if (!form.lubricantType.trim()) {
      pushToast(oilMode === "registry" ? "Select an oil from the list first." : "Lubricant type is required.", "error");
      return;
    }
    setSaving(true);
    try {
      const productId = newId("OIL");
      const saved = await api.addOilProduct(webhookUrl, { productId, ...form });
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

// Projected consumption vs. current stock over the next N months — see
// backend/oil-lubrication/src/OilInventory.js's getOilInventoryForecast
// for how this is computed (registry interval projection, refined by any
// LP already on an open assigned routine). A Contractor Engineer only
// ever sees their own contractor's lines (enforced server-side); ACC/
// Admin sees every contractor's, one row per oil per contractor.
const FORECAST_MONTHS_OPTIONS = [1, 3, 6];

function ForecastView({ webhookUrl }) {
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
      ) : rows.length === 0 ? (
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
    </div>
  );
}

export default function OilInventory({ webhookUrl, equipmentRegistry, pushToast }) {
  const { T, s } = useTheme();
  const [view, setView] = useState("list"); // "list" | "add" | "detail" | "forecast"
  const [selectedProductId, setSelectedProductId] = useState(null);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");

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
        onCancel={() => setView("list")}
      />
    );
  }

  if (view === "forecast") {
    return (
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 16 }}>
          <p style={{ ...s.sectionTitle, margin: 0 }}>Oil Inventory Forecast</p>
          <button style={s.btn} onClick={() => setView("list")}>
            <i className="ti ti-arrow-left" aria-hidden="true" /> Back to Inventory
          </button>
        </div>
        <ForecastView webhookUrl={webhookUrl} />
      </div>
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
          setView("list");
          setSelectedProductId(null);
          refresh();
        }}
      />
    );
  }

  const q = search.trim().toLowerCase();
  const visible = products.filter((p) => {
    if (!q) return true;
    return [p.productId, p.lubricantType, p.lubricantBrand, p.storageLocation, p.supplier].filter(Boolean).some((f) => f.toLowerCase().includes(q));
  });

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 16 }}>
        <p style={{ ...s.sectionTitle, margin: 0 }}>Oil Inventory</p>
        <div style={{ display: "flex", gap: 10 }}>
          <button style={s.btn} onClick={() => setView("forecast")}>
            <i className="ti ti-chart-line" aria-hidden="true" /> Forecast
          </button>
          <button style={s.btnPrimary} onClick={() => setView("add")}>
            <i className="ti ti-plus" aria-hidden="true" /> Add Product
          </button>
        </div>
      </div>

      <input
        style={{ ...s.input, marginBottom: 16 }}
        type="search"
        placeholder="Search by type, brand, location, or supplier…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

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
                  <tr
                    key={p.productId}
                    style={{ cursor: "pointer" }}
                    onClick={() => {
                      setSelectedProductId(p.productId);
                      setView("detail");
                    }}
                  >
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
