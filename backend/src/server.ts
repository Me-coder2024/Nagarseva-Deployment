import "dotenv/config";
import express from "express";
import fs from "node:fs";
import cors from "cors";
import axios from "axios";
import { prisma } from "./lib/prisma.js";
import { adminRouter } from "./routes/adminRoutes.js";
import { surveyorRouter } from "./routes/surveyorRoutes.js";
import { engineerRouter } from "./routes/engineerRoutes.js";
import { requireAuth, requireRole } from "./middlewares/authMiddleware.js";
import { production, sqlAgentUrl, serviceHeaders, serviceTimeout, validateDeployment } from "./lib/deployment.js";

validateDeployment();
["uploads/user-images", "uploads/model-images", "uploads/issues"].forEach(dir => fs.mkdirSync(dir, { recursive: true }));
const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);
const origins = (process.env.CORS_ORIGINS || "http://localhost:5173,http://localhost:8080").split(",").map(value => value.trim());
app.use(cors({ origin(origin, callback) {
  // Native mobile clients have no Origin header. JWT authentication still applies.
  callback(null, !origin || origins.includes(origin));
}, methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"], allowedHeaders: ["Content-Type", "Authorization"] }));
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.use("/uploads", express.static("uploads"));
app.get("/", (_req, res) => res.json({ service: "NagarSeva Backend", status: "ok" }));
app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
app.get("/api/ready", async (_req, res) => {
  try { await prisma.$queryRaw`SELECT 1`; res.json({ status: "ready", database: "connected" }); }
  catch { res.status(503).json({ status: "unavailable", database: "disconnected" }); }
});
app.use("/api/admin", adminRouter);
app.use("/api/surveyor", surveyorRouter);
app.use("/api/engineer", engineerRouter);
app.post("/api/chat/ask", requireAuth, requireRole("ADMIN"), async (req, res) => {
  try {
    const url = `${sqlAgentUrl}/ask`;
    const response = await axios.post(url, {
      question: req.body?.question || req.query.question,
      language: req.body?.language || req.query.language || "english",
    }, { headers: serviceHeaders, timeout: serviceTimeout });
    res.status(response.status).json(response.data);
  } catch (err: any) {
    res.status(err.response?.status || 502).json({ error: "Chat service unavailable. Please try again shortly." });
  }
});
const port = Number(process.env.PORT || 3000);
const server = app.listen(port, "0.0.0.0", () => console.log(`NagarSeva backend listening on port ${port}`));
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, () => {
    server.close(async () => { await prisma.$disconnect(); process.exit(0); });
    setTimeout(() => process.exit(1), 10000).unref();
  });
}
