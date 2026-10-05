// MySQL connection pool — every route imports `pool` from here rather than
// opening its own connection. mysql2/promise gives async/await query() calls
// instead of the callback style the plain mysql2 driver uses.
import mysql from "mysql2/promise";
import "dotenv/config";

export const pool = mysql.createPool({
  host: process.env.DB_HOST || "127.0.0.1",
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "acc_reliability",
  waitForConnections: true,
  connectionLimit: 10,
  dateStrings: true, // keep DATE/DATETIME columns as plain strings, not JS Date objects with timezone surprises
});
