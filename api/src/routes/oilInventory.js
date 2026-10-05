// Oil Inventory — replaces "Oil Inventory" + "Oil Inventory LOG". Current
// stock and last-movement-date were live SUMIFS/MAXIFS sheet formulas in
// the original; here they're computed by the oil_inventory_current_stock
// VIEW (database/schema/01_oil_lubrication.sql) from the movement log
// instead of stored and kept in sync by a formula.
import { Router } from "express";
import { pool } from "../db.js";
import { requireAuth } from "../auth.js";
import { friendlyForeignKeyError } from "../dbErrors.js";

export const oilInventoryRouter = Router();
oilInventoryRouter.use(requireAuth);

// GET /oil-inventory/products?orgId=&search=
oilInventoryRouter.get("/products", async (req, res) => {
  const { orgId, search } = req.query;
  const where = [];
  const params = [];
  if (orgId) {
    where.push("p.org_id = ?");
    params.push(orgId);
  }
  if (search) {
    where.push("(p.product_id LIKE ? OR p.lubricant_brand LIKE ? OR p.lubricant_type LIKE ?)");
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  // current_stock/last_movement_date come from the view, joined in here —
  // this is the live-computed replacement for the sheet's two formula columns.
  const [rows] = await pool.query(
    `SELECT p.*, s.current_stock, s.last_movement_date
       FROM oil_products p
       LEFT JOIN oil_inventory_current_stock s ON s.product_id = p.product_id
       ${whereSql}
      ORDER BY p.product_id`,
    params,
  );
  res.json({ products: rows });
});

// GET /oil-inventory/products/:productId
oilInventoryRouter.get("/products/:productId", async (req, res) => {
  const [rows] = await pool.query(
    `SELECT p.*, s.current_stock, s.last_movement_date
       FROM oil_products p
       LEFT JOIN oil_inventory_current_stock s ON s.product_id = p.product_id
      WHERE p.product_id = ?`,
    [req.params.productId],
  );
  if (!rows[0]) return res.status(404).json({ error: "Product not found" });
  res.json({ product: rows[0] });
});

// POST /oil-inventory/products
oilInventoryRouter.post("/products", async (req, res) => {
  const { productId, lubricantType, lubricantBrand, containerType, containerSizeL, unit, recorderLevel,
          storageLocation, supplier, unitCost, orgId, equivalentToType, equivalentToBrand } = req.body || {};
  if (!productId) return res.status(400).json({ error: "productId is required" });

  try {
    await pool.query(
      `INSERT INTO oil_products
         (product_id, lubricant_type, lubricant_brand, container_type, container_size_l, unit, recorder_level,
          storage_location, supplier, unit_cost, org_id, equivalent_to_type, equivalent_to_brand)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [productId, lubricantType, lubricantBrand, containerType, containerSizeL || null, unit, recorderLevel || null,
       storageLocation, supplier, unitCost || null, orgId || null, equivalentToType, equivalentToBrand],
    );
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") return res.status(409).json({ error: `Product ${productId} already exists` });
    const fkError = friendlyForeignKeyError(err, { fk_products_org: `Organization ${orgId} does not exist` });
    if (fkError) return res.status(400).json({ error: fkError });
    throw err;
  }
  res.status(201).json({ productId });
});

// GET /oil-inventory/movements?productId=&page=&limit=
oilInventoryRouter.get("/movements", async (req, res) => {
  const { productId } = req.query;
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(200, Number(req.query.limit) || 50);
  const offset = (page - 1) * limit;

  const where = [];
  const params = [];
  if (productId) {
    where.push("m.product_id = ?");
    params.push(productId);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const [rows] = await pool.query(
    `SELECT m.* FROM oil_inventory_log m ${whereSql} ORDER BY m.movement_date DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM oil_inventory_log m ${whereSql}`, params);
  res.json({ movements: rows, page, limit, total });
});

// POST /oil-inventory/movements { productId, movementType, quantity,
//   movementDate, linkedLpId?, linkedEventId?, orgId, reference?, notes? }
// doneBy is always the caller.
oilInventoryRouter.post("/movements", async (req, res) => {
  const { productId, movementType, quantity, movementDate, linkedLpId, linkedEventId, orgId, reference, notes } = req.body || {};
  if (!productId || !movementType || quantity === undefined) {
    return res.status(400).json({ error: "productId, movementType, and quantity are required" });
  }
  if (!["Receipt", "Issue", "Adjustment"].includes(movementType)) {
    return res.status(400).json({ error: "movementType must be Receipt, Issue, or Adjustment" });
  }

  try {
    const [result] = await pool.query(
      `INSERT INTO oil_inventory_log (product_id, movement_type, quantity, movement_date, linked_lp_id, linked_event_id, org_id, done_by, reference, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [productId, movementType, quantity, movementDate || new Date(), linkedLpId || null, linkedEventId || null,
       orgId || null, req.user.uid, reference, notes],
    );
    res.status(201).json({ movementId: result.insertId });
  } catch (err) {
    const fkError = friendlyForeignKeyError(err, {
      fk_inv_log_product: `Product ${productId} does not exist`,
      fk_inv_log_lp: `Lubrication point ${linkedLpId} does not exist`,
      fk_inv_log_org: `Organization ${orgId} does not exist`,
    });
    if (fkError) return res.status(400).json({ error: fkError });
    throw err;
  }
});
