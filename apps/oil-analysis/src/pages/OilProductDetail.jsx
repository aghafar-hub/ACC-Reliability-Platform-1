import { useCallback, useEffect, useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useTheme } from "../ThemeContext";
import { useSessionEmail, useIsAccEngineer, useIsRouteEngineerFor } from "../SessionContext";
import * as api from "../api";
import { todayISO } from "../parsers";
import { daysLeft, fmtNum, fmtQty, fmtSigned, signedQty } from "../inventoryLogic";
import { Gauge } from "../components/DashCharts";

// Phase 5: receipts, adjustments and the one-off opening balance are the
// contractor's engineer's; Issue stays available as before.
const MOVEMENT_TYPES = ["Receipt", "Issue", "Adjustment"];
const CONTRACTOR_OPTIONS = ["", "RHI", "ASEC"];

function LogMovementForm({ webhookUrl, productId, unit, equipmentRegistry, pushToast, onLogged, types }) {
  const { T, s } = useTheme();
  const [movementType, setMovementType] = useState(types[0]);
  const [quantity, setQuantity] = useState("");
  const [movementDate, setMovementDate] = useState(todayISO());
  const [linkedLpId, setLinkedLpId] = useState("");
  const [contractor, setContractor] = useState("");
  const [doneBy, setDoneBy] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const sessionEmail = useSessionEmail();

  useEffect(() => {
    if (sessionEmail && !doneBy) setDoneBy(sessionEmail);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only reacts to sessionEmail becoming available, not to the user's own edits to doneBy
  }, [sessionEmail]);

  async function handleLog() {
    const qty = parseFloat(quantity);
    if (isNaN(qty) || (movementType !== "Adjustment" && qty <= 0)) {
      pushToast("Enter a valid quantity.", "error");
      return;
    }
    if (movementType === "Issue" && !reason.trim()) {
      pushToast("Enter the reason for this issue — oil changes and top-ups are already deducted automatically.", "error");
      return;
    }
    setSaving(true);
    try {
      await api.logOilMovement(webhookUrl, {
        productId,
        movementType,
        quantity: qty,
        movementDate,
        linkedLpId: movementType === "Issue" ? linkedLpId : "",
        contractor,
        doneBy,
        reference,
        notes,
        reason: movementType === "Issue" ? reason.trim() : "",
      });
      pushToast(`${movementType} logged.`, "success");
      setQuantity("");
      setReason("");
      setReference("");
      setNotes("");
      onLogged();
    } catch (err) {
      pushToast(err.message, "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={s.card}>
      <p style={{ fontWeight: 700, marginBottom: 10 }}>Log Movement</p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 14 }}>
        <div>
          <label style={s.label}>Type</label>
          <select style={s.select} value={movementType} onChange={(e) => setMovementType(e.target.value)}>
            {types.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label style={s.label}>Quantity ({unit || "L"}){movementType === "Adjustment" ? " — signed +/-" : ""}</label>
          <input style={s.input} type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
        </div>
        <div>
          <label style={s.label}>Date</label>
          <input style={s.input} type="date" value={movementDate} onChange={(e) => setMovementDate(e.target.value)} />
        </div>
        {movementType === "Issue" && (
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={s.label}>Reason for issue *</label>
            <input
              style={s.input}
              type="text"
              aria-label="Reason for issue"
              placeholder="Why is this oil issued by hand? (oil changes and top-ups are deducted automatically)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
        )}
        {movementType === "Issue" && (
          <div>
            <label style={s.label}>Issued to (LP_ID)</label>
            <input
              style={s.input}
              type="text"
              list="lp-id-options"
              placeholder="Optional — which lubrication point"
              value={linkedLpId}
              onChange={(e) => setLinkedLpId(e.target.value)}
            />
            <datalist id="lp-id-options">
              {(equipmentRegistry || []).map((r) => (
                <option key={r.code} value={r.code}>
                  {r.lubricationPoint || r.description}
                </option>
              ))}
            </datalist>
          </div>
        )}
        <div>
          <label style={s.label}>Contractor</label>
          <select style={s.select} value={contractor} onChange={(e) => setContractor(e.target.value)}>
            {CONTRACTOR_OPTIONS.map((c) => (
              <option key={c} value={c}>
                {c || "—"}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label style={s.label}>Done By</label>
          <input style={s.input} type="text" value={doneBy} onChange={(e) => setDoneBy(e.target.value)} />
        </div>
        <div>
          <label style={s.label}>Reference</label>
          <input style={s.input} type="text" placeholder="PO / delivery note / requisition #" value={reference} onChange={(e) => setReference(e.target.value)} />
        </div>
      </div>
      <label style={s.label}>Notes</label>
      <input style={{ ...s.input, marginBottom: 14 }} type="text" value={notes} onChange={(e) => setNotes(e.target.value)} />
      <button style={s.btnPrimary} onClick={handleLog} disabled={saving}>
        {saving ? "Logging…" : `Log ${movementType}`}
      </button>
      <p style={{ fontSize: 12, color: T.textSecondary, marginTop: 10 }}>
        Current Stock on the Oil Inventory tab updates automatically from this — no separate save needed there.
      </p>
    </div>
  );
}

export default function OilProductDetail({ webhookUrl, productId, equipmentRegistry, pushToast, onBack }) {
  const { T, s } = useTheme();
  const [product, setProduct] = useState(null);
  const [movements, setMovements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Sequential, not Promise.all — see App.jsx's startup-fetch fix:
      // Google Apps Script Web Apps don't reliably serve concurrent GET
      // requests to the same deployment.
      const products = await api.getOilInventory(webhookUrl);
      const moves = await api.getOilInventoryMovements(webhookUrl, productId);
      setProduct(products.find((p) => p.productId === productId) || null);
      setMovements(moves);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [webhookUrl, productId]);

  useEffect(() => {
    refresh();
  }, [refresh]);
  // Receipts, adjustments and the opening balance: the contractor's
  // engineer or an ACC engineer. Anyone else can only record an Issue.
  const isContractorEngineer = useIsRouteEngineerFor(product?.contractor || "");
  const isAccEngineer = useIsAccEngineer();
  const isStockEngineer = isContractorEngineer || isAccEngineer;

  if (loading) return <p style={{ color: T.textSecondary }}>Loading product…</p>;
  if (error) return <p style={{ color: T.danger }}>{error}</p>;
  if (!product) return <p style={{ color: T.danger }}>Product not found.</p>;

  const low = product.currentStock != null && product.recorderLevel != null && product.currentStock <= product.recorderLevel;
  const hasOpening = movements.some((m) => String(m.reference || "").trim() === "Opening balance");

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <p style={{ ...s.sectionTitle, margin: "0 0 4px" }}>
            {product.lubricantType} <span style={{ color: T.textSecondary, fontWeight: 400 }}>{product.lubricantBrand}</span>
          </p>
          <p style={{ fontSize: 12.5, color: T.textSecondary, margin: 0 }}>
            {product.storageLocation || "—"} · {product.containerType} ({product.containerSizeL} L) · <span style={s.badge(product.status)}>{product.status}</span>
          </p>
        </div>
        <button style={s.btn} onClick={onBack}>
          <i className="ti ti-arrow-left" aria-hidden="true" /> Back to Inventory
        </button>
      </div>

      <div style={{ display: "flex", gap: 14, marginBottom: 20, flexWrap: "wrap" }}>
        <div style={{ ...s.card, marginBottom: 0, padding: "12px 18px", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }} data-testid="product-gauge">
          {/* D5 — how full this oil's stock is, with the low-stock level as the tick */}
          <Gauge
            T={T}
            value={product.currentStock}
            level={product.recorderLevel}
            max={Math.max(product.currentStock || 0, (product.recorderLevel || 0) * 2)}
            unit={product.unit || "L"}
            size={170}
            label={`${fmtQty(product.currentStock, product.unit)} in stock, low-stock level ${product.recorderLevel ?? "not set"}`}
          />
          <div style={{ fontSize: 13, color: T.textSecondary, lineHeight: 1.6 }}>
            <div style={{ fontWeight: 700, color: T.textPrimary }}>Current stock</div>
            <div>
              {daysLeft(product) != null ? (
                <>
                  <b style={{ color: T.textPrimary }}>{daysLeft(product)}</b> days left at the recent rate of use
                </>
              ) : (
                "No recent use recorded"
              )}
            </div>
            {low && <div style={{ color: T.danger, fontWeight: 700 }}>Below the low-stock level — order now</div>}
          </div>
        </div>
        <LowStockLevelCard webhookUrl={webhookUrl} product={product} pushToast={pushToast} onSaved={refresh} />
        <div style={{ ...s.card, marginBottom: 0, padding: "12px 18px" }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{product.supplier || "—"}</div>
          <div style={{ fontSize: 12, color: T.textSecondary }}>Supplier</div>
        </div>
        <div style={{ ...s.card, marginBottom: 0, padding: "12px 18px" }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{product.lastMovementDate || "—"}</div>
          <div style={{ fontSize: 12, color: T.textSecondary }}>Last Movement</div>
        </div>
      </div>

      <EquivalentCard
        webhookUrl={webhookUrl}
        product={product}
        equipmentRegistry={equipmentRegistry}
        canApprove={isContractorEngineer}
        pushToast={pushToast}
        onSaved={refresh}
      />

      <StockChart movements={movements} level={product.recorderLevel} unit={product.unit} />

      <LogMovementForm
        key={hasOpening ? "with-opening" : "no-opening"}
        types={
          !isStockEngineer ? ["Issue"] : hasOpening || movements.length > 0 ? MOVEMENT_TYPES : ["Opening Balance", ...MOVEMENT_TYPES]
        }
        webhookUrl={webhookUrl}
        productId={productId}
        unit={product.unit}
        equipmentRegistry={equipmentRegistry}
        pushToast={pushToast}
        onLogged={refresh}
      />

      <p style={{ fontWeight: 700, margin: "20px 0 10px" }}>Movement History</p>
      {movements.length === 0 ? (
        <div style={s.card}>
          <p style={{ color: T.textSecondary, margin: 0 }}>No movements logged yet.</p>
        </div>
      ) : (
        <div style={{ ...s.card, padding: 0, overflowX: "auto", overflowY: "hidden" }}>
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>Date</th>
                <th style={s.th}>Type</th>
                <th style={s.th}>Quantity</th>
                <th style={s.th}>Issued To</th>
                <th style={s.th}>Contractor</th>
                <th style={s.th}>Done By</th>
                <th style={s.th}>Reference</th>
                <th style={s.th}>Notes / Reason</th>
              </tr>
            </thead>
            <tbody>
              {movements.map((m) => (
                <tr key={m.movementId}>
                  <td style={s.td}>{m.movementDate || "—"}</td>
                  <td style={s.td}>{m.movementType}</td>
                  <td style={{ ...s.td, whiteSpace: "nowrap", fontWeight: 700 }}>{fmtSigned(signedQty(m.movementType, m.quantity), product.unit || "L")}</td>
                  <td style={s.td}>{m.linkedLpId || "—"}</td>
                  <td style={s.td}>{m.contractor || "—"}</td>
                  <td style={s.td}>{m.doneBy || "—"}</td>
                  <td style={s.td}>{m.reference || "—"}</td>
                  <td style={s.td}>{m.notes || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// Phase 5 — the low-stock level: an alert goes to the contractor's and ACC
// engineers when stock falls to it. Either of them can change it.
function LowStockLevelCard({ webhookUrl, product, pushToast, onSaved }) {
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

  return (
    <div style={{ ...s.card, marginBottom: 0, padding: "12px 18px" }}>
      {editing ? (
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input
            style={{ ...s.input, width: 90 }}
            type="number"
            min="0"
            aria-label="Low-stock level"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          <button style={s.btnPrimary} disabled={saving} onClick={save}>
            {saving ? "…" : "Save"}
          </button>
        </div>
      ) : (
        <div style={{ fontSize: 22, fontWeight: 800 }}>
          {fmtQty(product.recorderLevel, product.unit)}
          {canEdit && (
            <button style={{ ...s.btn, marginLeft: 8, padding: "2px 8px", fontSize: 12 }} onClick={() => setEditing(true)} aria-label="Change low-stock level">
              <i className="ti ti-pencil" aria-hidden="true" /> Edit
            </button>
          )}
        </div>
      )}
      <div style={{ fontSize: 12, color: T.textSecondary }}>Low-stock level</div>
    </div>
  );
}

// Phase 5 — stock after each movement, with the low-stock level as a line.
function StockChart({ movements, level, unit }) {
  const { T, s } = useTheme();
  const data = useMemo(() => {
    const sorted = [...(movements || [])]
      .filter((m) => m.movementDate && m.quantity != null)
      .sort((a, b) => new Date(a.movementDate) - new Date(b.movementDate));
    let total = 0;
    return sorted.map((m) => {
      const q = Number(m.quantity) || 0;
      total += m.movementType === "Receipt" ? Math.abs(q) : m.movementType === "Issue" ? -Math.abs(q) : q;
      return { date: m.movementDate, stock: Math.round(total * 100) / 100, kind: m.movementType };
    });
  }, [movements]);
  if (data.length < 2) return null;
  const u = unit || "L";
  return (
    <div style={{ ...s.card, margin: "20px 0 0" }}>
      <p style={{ fontWeight: 700, margin: "0 0 10px" }}>Stock over time</p>
      <div style={{ width: "100%", height: 220 }}>
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 10, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={T.border} strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="date" tick={{ fill: T.textSecondary, fontSize: 12 }} tickLine={false} axisLine={{ stroke: T.border }} />
            <YAxis tick={{ fill: T.textSecondary, fontSize: 12 }} tickLine={false} axisLine={false} width={44} tickFormatter={fmtNum} />
            <Tooltip
              contentStyle={{ background: T.cardBg, border: `1px solid ${T.border}`, borderRadius: 6, fontSize: 12, color: T.textPrimary }}
              labelStyle={{ color: T.textSecondary }}
              itemStyle={{ color: T.textPrimary }}
              formatter={(v, _n, item) => [fmtQty(v, u), `Stock after ${item?.payload?.kind || "movement"}`]}
            />
            {level != null && (
              <ReferenceLine
                y={level}
                stroke={T.danger}
                strokeDasharray="5 4"
                label={{ value: `Low-stock level ${fmtQty(level, u)}`, position: "insideTopRight", fill: T.textSecondary, fontSize: 12 }}
              />
            )}
            <Line type="stepAfter" dataKey="stock" stroke={T.accent} strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// Phase 8 — "this product is an approved equivalent for <main oil>". Only
// the product's own contractor engineer approves or removes it; the ACC
// engineers and the managers are told. Routes then use it when the main
// oil is short, and the technician can pick it as the oil used.
function EquivalentCard({ webhookUrl, product, equipmentRegistry, canApprove, pushToast, onSaved }) {
  const { T, s } = useTheme();
  const [editing, setEditing] = useState(false);
  const [pick, setPick] = useState("");
  const [saving, setSaving] = useState(false);
  const mainOils = useMemo(() => {
    const seen = new Map();
    (equipmentRegistry || []).forEach((r) => {
      const type = (r.lubricant || "").trim();
      if (!type || (r.contractor || "").trim() !== product.contractor) return;
      const brand = (r.lubricantBrand || "").trim();
      if (type.toLowerCase() === (product.lubricantType || "").trim().toLowerCase()) return;
      // spelling differences in the registry ("MOBIL SHC 632") are one oil
      const key = `${type}|${brand}`.toLowerCase().replace(/\s+/g, " ");
      if (!seen.has(key)) seen.set(key, { type, brand });
    });
    return Array.from(seen.values()).sort((a, b) => a.type.localeCompare(b.type));
  }, [equipmentRegistry, product.contractor, product.lubricantType]);

  async function save(mainType, mainBrand) {
    setSaving(true);
    try {
      await api.setOilEquivalent(webhookUrl, product.productId, mainType, mainBrand);
      pushToast(mainType ? "Equivalent approved — the ACC engineers and managers have been told." : "Equivalent removed.", "success");
      setEditing(false);
      onSaved();
    } catch (err) {
      pushToast(err.message, "error");
    } finally {
      setSaving(false);
    }
  }

  const has = !!product.equivalentToType;
  const label = (type, brand) => (brand ? `${type} — ${brand}` : type);
  return (
    <div style={{ ...s.card, marginBottom: 16, borderLeft: has ? `3px solid ${T.warning}` : undefined }} data-testid="equivalent-card">
      <p style={{ fontWeight: 700, margin: "0 0 6px" }}>Approved equivalent</p>
      {has ? (
        <p style={{ fontSize: 13, margin: "0 0 8px" }}>
          Used in place of <strong>{label(product.equivalentToType, product.equivalentToBrand)}</strong> when that oil is short.
          {product.equivalentApprovedBy && (
            <span style={{ color: T.textSecondary }}>
              {" "}
              Approved by {product.equivalentApprovedBy}
              {product.equivalentApprovedDate ? ` on ${product.equivalentApprovedDate}` : ""}.
            </span>
          )}
        </p>
      ) : (
        <p style={{ fontSize: 13, color: T.textSecondary, margin: "0 0 8px" }}>Not an equivalent for another oil.</p>
      )}
      {canApprove &&
        (editing ? (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <select style={{ ...s.select, width: "auto", minWidth: 220 }} aria-label="Main oil this product replaces" value={pick} onChange={(e) => setPick(e.target.value)}>
              <option value="">Main oil it replaces…</option>
              {mainOils.map((o) => (
                <option key={`${o.type}|${o.brand}`} value={`${o.type}|${o.brand}`}>
                  {label(o.type, o.brand)}
                </option>
              ))}
            </select>
            <button
              style={s.btnPrimary}
              disabled={saving || !pick}
              onClick={() => {
                const [type, brand] = pick.split("|");
                save(type, brand);
              }}
            >
              {saving ? "…" : "Approve"}
            </button>
            <button style={s.btn} disabled={saving} onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 8 }}>
            <button style={s.btn} onClick={() => setEditing(true)}>
              <i className="ti ti-arrows-exchange" aria-hidden="true" /> {has ? "Change" : "Approve as an equivalent"}
            </button>
            {has && (
              <button style={s.btn} disabled={saving} onClick={() => save("", "")}>
                Remove
              </button>
            )}
          </div>
        ))}
      {!canApprove && (
        <p style={{ fontSize: 12, color: T.textSecondary, margin: 0 }}>Only {product.contractor || "the contractor"}'s engineer can approve or remove an equivalent.</p>
      )}
    </div>
  );
}
