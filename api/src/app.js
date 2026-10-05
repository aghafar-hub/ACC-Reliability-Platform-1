import express from "express";
import cors from "cors";
import { authRouter } from "./routes/auth.js";
import { equipmentRouter } from "./routes/equipment.js";
import { lubricationPointsRouter } from "./routes/lubricationPoints.js";
import { oilSamplesRouter } from "./routes/oilSamples.js";
import { oilActionsRouter } from "./routes/oilActions.js";
import { routinesRouter, routineItemsRouter } from "./routes/routines.js";
import { oilInventoryRouter } from "./routes/oilInventory.js";
import { routeTemplatesRouter } from "./routes/routeTemplates.js";
import { oilReferenceRouter } from "./routes/oilReference.js";
import { vibPointsRouter } from "./routes/vibPoints.js";
import { vibRegistersRouter } from "./routes/vibRegisters.js";
import { vibReadingsRouter } from "./routes/vibReadings.js";
import { vibComplianceRouter } from "./routes/vibCompliance.js";
import { vibActionsRouter } from "./routes/vibActions.js";

export const app = express();

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => res.json({ status: "ok", time: new Date().toISOString() }));

app.use("/auth", authRouter);
app.use("/equipment", equipmentRouter);
app.use("/lubrication-points", lubricationPointsRouter);
app.use("/oil-samples", oilSamplesRouter);
app.use("/oil-actions", oilActionsRouter);
app.use("/routines", routinesRouter);
app.use("/routine-items", routineItemsRouter);
app.use("/oil-inventory", oilInventoryRouter);
app.use("/route-templates", routeTemplatesRouter);
app.use("/", oilReferenceRouter);
app.use("/vib-points", vibPointsRouter);
app.use("/", vibRegistersRouter);
app.use("/", vibReadingsRouter);
app.use("/compliance", vibComplianceRouter);
app.use("/vib-actions", vibActionsRouter);

// Centralized error handler — any route that throws (including a rejected
// promise, since this project's routes are all async) lands here instead of
// crashing the process or leaking a stack trace to the client.
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});
