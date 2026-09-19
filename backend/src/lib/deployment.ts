import "dotenv/config";
export const production = process.env.NODE_ENV === "production";
export const publicUrl = (process.env.PUBLIC_BACKEND_URL || process.env.RENDER_EXTERNAL_URL || "https://nagarseva-backend-yo7f.onrender.com").replace(/\/+$/, "");
export const serviceHeaders = process.env.INTERNAL_API_KEY ? { "X-Service-Key": process.env.INTERNAL_API_KEY } : {};
export const modelServiceUrl = (process.env.MODEL_SERVICE_URL || (process.env.MODEL_SERVICE_HOSTPORT ? `http://${process.env.MODEL_SERVICE_HOSTPORT}` : "https://nagarseva-ai-uwwk.onrender.com")).replace(/\/+$/, "");
export const sqlAgentUrl = (process.env.SQL_AGENT_URL || (process.env.SQL_AGENT_HOSTPORT ? `http://${process.env.SQL_AGENT_HOSTPORT}` : "https://nagarseva-sql-agent.onrender.com")).replace(/\/+$/, "");
export const serviceTimeout = Number(process.env.SERVICE_TIMEOUT_MS || 120000);
export function localUploadUrl(path: string): string {
  return `${publicUrl}/${path.replace(/\\/g, "/").replace(/^\/+/, "")}`;
}
export function validateDeployment() {
  const required = ["DATABASE_URL", "JWT_SECRET"];
  const missing = required.filter(key => !process.env[key]?.trim());
  if (missing.length) throw new Error(`Missing configuration: ${missing.join(", ")}`);
}

