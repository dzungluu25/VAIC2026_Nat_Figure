
import express from "express";
import type { NextFunction, Request, Response } from "express";
import cors from "cors";
import authRoutes from "./routes/auth.routes";
import orchestrationRoutes from "./routes/orchestration.routes";
import { runRoutes, tenantRoutes, workflowRoutes } from "./routes/platform.routes";
import { documentChecklistRoutes, dossierRoutes } from "./routes/document-intake.routes";
import { notificationRoutes } from "./routes/notification.routes";
import { adminRoutes } from "./routes/admin.routes";
import { ocrRoutes } from "./routes/ocr.routes";
import authorizationRoutes from "./routes/authorization.routes";

const app = express();

app.use(cors());
app.use(express.json());

app.use((error: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (error instanceof SyntaxError && "body" in error) {
    return res.status(400).json({
      error: "Dữ liệu JSON của request không hợp lệ. Vui lòng kiểm tra dấu phẩy, dấu ngoặc và chuỗi giá trị trước khi gửi lại.",
      code: "INVALID_INPUT",
    });
  }
  return next(error);
});

app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.use("/api/auth", authRoutes);
app.use("/api/orchestrate", orchestrationRoutes);
app.use("/api/workflows", workflowRoutes);
app.use("/api/tenants", tenantRoutes);
app.use("/api/runs", runRoutes);
app.use("/api/document-checklists", documentChecklistRoutes);
app.use("/api/dossiers", dossierRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/ocr", ocrRoutes);
app.use("/api/users", authorizationRoutes);

export default app;
