import express from "express";
import cors from "cors";
import { authRouter } from "./routes/auth.js";

export const app = express();

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => res.json({ status: "ok", time: new Date().toISOString() }));

app.use("/auth", authRouter);

// Centralized error handler — any route that throws (including a rejected
// promise, since this project's routes are all async) lands here instead of
// crashing the process or leaking a stack trace to the client.
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});
