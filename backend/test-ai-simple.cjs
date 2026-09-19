const axios = require("axios");
const FormData = require("form-data");
const fs = require("fs");

async function run() {
  console.log("Checking /health...");
  const h = await axios.get("https://nagarseva-ai-uwwk.onrender.com/health");
  console.log("Health:", h.data);

  console.log("Creating 100x100 dummy image buffer...");
  // Create a minimal 1x1 valid PNG buffer
  const pngBuffer = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");

  const form = new FormData();
  form.append("file", pngBuffer, { filename: "test.png", contentType: "image/png" });

  console.log("Testing POST /analyze ...");
  try {
    const res = await axios.post("https://nagarseva-ai-uwwk.onrender.com/analyze", form, {
      headers: {
        ...form.getHeaders(),
        "X-Service-Key": "eACRXX5hdqfLvb5L66UDVi3D3+xQ55HubqZzX9upHGY="
      },
      timeout: 30000
    });
    console.log("? Analyze success:", res.data);
  } catch (err) {
    console.error("? Analyze failed:", err.response?.status, err.response?.data || err.message);
  }
}
run();
