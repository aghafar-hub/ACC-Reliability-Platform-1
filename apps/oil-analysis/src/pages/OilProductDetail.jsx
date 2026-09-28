import { useCallback, useEffect, useState } from "react";
import { useTheme } from "../ThemeContext";
import * as api from "../api";

const MOVEMENT_TYPES = ["Receipt", "Issue", "Adjustment"];
const CONTRACTOR_OPTIONS = ["", "RHI", "ASEC"];

function LogMovementForm({ webhookUrl, productId, unit, equipmentRegistry, pushToast, onLogged }) {
  const { T, s } = useTheme();
  const [movementType, setMovementType] = useState("Receipt");
  const [quantity, setQuantity] = useState("");
  const [movementDate, setMovementDate] = useState(new Date().toISOString().slice(0, 10));
  const [linkedLpId, setLinkedLpId] = useState("");
  const [contractor, setContractor] = useState("");
  const [doneBy, setDoneBy] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleLog() {
    const qty = parseFloat(quantity);
    if (isNaN(qty) || (movementType !== "Adjustment" && qty <= 0)) {
      pushToast("Enter a valid quantity.", "error");
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
      });
      pushToast(`${movementType} logged.`, "success");
      setQuantity("");
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
            {MOVEMENT_TYPES.map((t) => (
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
      <p style={{ fontSize: 11.5, color: T.textSecondary, marginTop: 10 }}>
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
      const [products, moves] = await Promise.all([api.getOilInventory(webhookUrl), api.getOilInventoryMovements(webhookUrl, productId)]);
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

  if (loading) return <p style={{ color: T.textSecondary }}>Loading product…</p>;
  if (error) return <p style={{ color: T.danger }}>{error}</p>;
  if (!product) return <p style={{ color: T.danger }}>Product not found.</p>;

  const low = product.currentStock != null && product.recorderLevel != null && product.currentStock <= product.recorderLevel;

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
        <div style={{ ...s.card, marginBottom: 0, padding: "12px 18px", borderLeft: `3px solid ${low ? T.danger : T.success}` }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: low ? T.danger : T.textPrimary }}>
            {product.currentStock != null ? `${product.currentStock} ${product.unit || ""}` : "—"}
          </div>
          <div style={{ fontSize: 11, color: T.textSecondary }}>Current Stock{low ? " — below reorder level" : ""}</div>
        </div>
        <div style={{ ...s.card, marginBottom: 0, padding: "12px 18px" }}>
          <div style={{ fontSize: 22, fontWeight: 800 }}>{product.recorderLevel != null ? `${product.recorderLevel} ${product.unit || ""}` : "—"}</div>
          <div style={{ fontSize: 11, color: T.textSecondary }}>Reorder Level</div>
        </div>
        <div style={{ ...s.card, marginBottom: 0, padding: "12px 18px" }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{product.supplier || "—"}</div>
          <div style={{ fontSize: 11, color: T.textSecondary }}>Supplier</div>
        </div>
        <div style={{ ...s.card, marginBottom: 0, padding: "12px 18px" }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{product.lastMovementDate || "—"}</div>
          <div style={{ fontSize: 11, color: T.textSecondary }}>Last Movement</div>
        </div>
      </div>

      <LogMovementForm
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
        <div style={{ ...s.card, padding: 0, overflow: "hidden" }}>
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
              </tr>
            </thead>
            <tbody>
              {movements.map((m) => (
                <tr key={m.movementId}>
                  <td style={s.td}>{m.movementDate || "—"}</td>
                  <td style={s.td}>{m.movementType}</td>
                  <td style={s.td}>{m.quantity}</td>
                  <td style={s.td}>{m.linkedLpId || "—"}</td>
                  <td style={s.td}>{m.contractor || "—"}</td>
                  <td style={s.td}>{m.doneBy || "—"}</td>
                  <td style={s.td}>{m.reference || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
