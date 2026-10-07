// Oil Inventory — pure helpers shared by the Inventory tabs and the product
// page: number formatting, days of stock left, and the shortfall chart's
// rows (the same oil from both contractors merged when no contractor is
// picked).

const NUM = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });

// 524.2000000000003 → "524.2"; null/blank → "—".
export function fmtNum(v) {
  if (v === null || v === undefined || v === "" || Number.isNaN(Number(v))) return "—";
  return NUM.format(Number(v));
}

// "524.2 L" — the product's own unit (L or Drum), "—" when there's no value.
export function fmtQty(v, unit = "L") {
  const n = fmtNum(v);
  return n === "—" ? n : `${n}${unit ? ` ${unit}` : ""}`;
}

// A movement's quantity with its direction: Receipt +, Issue −, Adjustment
// as signed on the log.
export function signedQty(movementType, quantity) {
  if (quantity === null || quantity === undefined || Number.isNaN(Number(quantity))) return null;
  const q = Number(quantity);
  if (movementType === "Receipt") return Math.abs(q);
  if (movementType === "Issue") return -Math.abs(q);
  return q;
}
export function fmtSigned(v, unit = "L") {
  if (v === null) return "—";
  const s = fmtQty(Math.abs(v), unit);
  return v > 0 ? `+${s}` : v < 0 ? `−${s}` : s;
}

// Days the stock lasts at the recent rate of use (issues over the last
// `useDays` days, from the server). null when nothing was issued lately.
export function daysLeft(product) {
  if (product?.currentStock == null || !product.issuedRecent || !product.useDays) return null;
  const perDay = product.issuedRecent / product.useDays;
  return perDay > 0 ? Math.max(0, Math.floor(product.currentStock / perDay)) : null;
}

export function isLow(p) {
  return p.currentStock != null && p.recorderLevel != null && p.currentStock <= p.recorderLevel;
}

// Low-stock list, most urgent first: fewest days left, then furthest below
// its level.
export function lowStockSorted(products) {
  return products
    .filter(isLow)
    .map((p) => ({ ...p, daysLeft: daysLeft(p), belowBy: Math.round((p.recorderLevel - p.currentStock) * 100) / 100 }))
    .sort((a, b) => {
      const da = a.daysLeft ?? Infinity;
      const db = b.daysLeft ?? Infinity;
      if (da !== db) return da - db;
      const ra = a.recorderLevel ? a.currentStock / a.recorderLevel : 1;
      const rb = b.recorderLevel ? b.currentStock / b.recorderLevel : 1;
      return ra - rb;
    });
}

// "Mobil SHC 630 · Mobil" says Mobil twice — the brand only when the name
// doesn't already carry it ("Mobilgear 600 XP 460 · Total" keeps it).
export function oilLabel(lubricant, brand) {
  const l = String(lubricant || "").trim();
  const b = String(brand || "").trim();
  if (!b || l.toLowerCase().includes(b.toLowerCase())) return l;
  return `${l} · ${b}`;
}

// The shortfall chart's bars. One bar per oil; with no contractor picked the
// same oil's rows from RHI and ASEC are added together. Each contractor's
// stock only covers its own work, so the merged shortfall is the sum of
// each contractor's own shortfall (not need − stock overall), and the bar
// counts as short if any contractor is short or has no stock product.
export function shortfallBars(rows, { merge }) {
  const groups = new Map();
  rows
    .filter((r) => (r.quantityNeeded || 0) > 0)
    .forEach((r) => {
      const key = merge
        ? `${String(r.lubricant || "").trim().toLowerCase()}|${String(r.lubricantBrand || "").trim().toLowerCase()}`
        : `${r.contractor}|${String(r.lubricant || "").trim().toLowerCase()}|${String(r.lubricantBrand || "").trim().toLowerCase()}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(r);
    });
  const round = (v) => Math.round(v * 100) / 100;
  return [...groups.values()]
    .map((parts) => {
      const first = parts[0];
      const need = round(parts.reduce((s, p) => s + (p.quantityNeeded || 0), 0));
      const stocks = parts.filter((p) => p.currentStock != null);
      const stock = stocks.length ? round(stocks.reduce((s, p) => s + p.currentStock, 0)) : null;
      const levels = parts.filter((p) => p.level != null);
      const level = levels.length ? round(levels.reduce((s, p) => s + p.level, 0)) : null;
      const noProduct = parts.some((p) => p.currentStock == null);
      const shortBy = round(parts.reduce((s, p) => s + (p.currentStock == null ? p.quantityNeeded || 0 : p.shortfall || 0), 0));
      return {
        label: oilLabel(first.lubricant, first.lubricantBrand),
        need,
        stock: stock ?? 0,
        hasStock: stock != null,
        level,
        shortBy,
        short: shortBy > 0,
        noProduct,
        parts: parts.map((p) => ({
          contractor: p.contractor,
          need: p.quantityNeeded || 0,
          stock: p.currentStock,
          shortBy: p.currentStock == null ? p.quantityNeeded || 0 : p.shortfall || 0,
        })),
      };
    })
    .sort((a, b) => b.shortBy - a.shortBy || b.need - a.need);
}

// Shared shortage-check periods (Overview and Forecast).
export const SHORTAGE_PERIODS = [
  { days: 15, label: "Next 15 days" },
  { days: 30, label: "Next 30 days" },
  { days: 60, label: "Next 60 days" },
  { days: 90, label: "Next 90 days" },
  { days: 182, label: "Next 6 months" },
  { days: 365, label: "Next 1 year" },
];
export function periodLabel(days) {
  return (SHORTAGE_PERIODS.find((p) => p.days === days)?.label || `Next ${days} days`).replace(/^Next/, "next");
}

// "2026-10" is the month we're in → its total is only so far.
export function isCurrentMonth(key, now = new Date()) {
  const m = now.getMonth() + 1;
  return key === `${now.getFullYear()}-${m < 10 ? "0" + m : m}`;
}

// CSV that Excel opens directly (UTF-8 with BOM).
export function toCsv(rows) {
  const esc = (v) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + rows.map((r) => r.map(esc).join(",")).join("\r\n");
}
