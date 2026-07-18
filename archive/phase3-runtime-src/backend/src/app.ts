import express from "express";
import cors from "cors";
import { config } from "./config/env";
import orchestrationRoutes from "./routes/orchestration.routes";
import mockRoutes from "./routes/mock.routes";
import retailCaseRoutes from "./routes/retail-case.routes";
import { nowIso } from "./services/retail/retail-common";

const app = express();

app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: nowIso() });
});

app.use("/api", retailCaseRoutes);

if (config.enableLegacyMockRoutes) {
  app.use("/api/orchestrate", orchestrationRoutes);
  app.use("/api/mock", mockRoutes);
}

export default app;
