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
import { processLocalCivicAiQuery } from "./services/aiChatService.js";

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
  const question = req.body?.question || req.query.question || "How many open issues are there?";
  const language = (req.body?.language || req.query.language || "english") as "english" | "hindi" | "gujarati";

  try {
    const url = `${sqlAgentUrl}/ask`;
    // Attempt upstream SQL agent with quick 8s timeout
    const response = await axios.post(
      url,
      { question, language },
      { headers: serviceHeaders, timeout: 8000 }
    );
    if (response.data && (response.data.result || response.data.content)) {
      return res.status(response.status).json(response.data);
    }
  } catch (err: any) {
    console.log("[Seva Assistant] Upstream SQL agent unavailable or slow. Using internal real-time database AI engine.");
  }

  try {
    // High-speed direct database intelligence
    const localResult = await processLocalCivicAiQuery(question, language);
    return res.status(200).json(localResult);
  } catch (fallbackErr: any) {
    console.error("[Seva Assistant] Error in local AI processor:", fallbackErr);
    return res.status(500).json({
      question,
      result: {
        content: "Sorry, I encountered an issue processing civic telemetry. Please try asking again shortly.",
      },
    });
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
