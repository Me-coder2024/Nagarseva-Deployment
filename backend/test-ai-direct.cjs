const axios = require("axios");
const FormData = require("form-data");

async function test() {
  const imageUrl = "https://res.cloudinary.com/dxecix6t9/image/upload/v1789792636/pothole-detections/w2xea7so0lvgxb7yzqre.jpg";
  console.log("Fetching image from Cloudinary:", imageUrl);
  const imgRes = await axios.get(imageUrl, { responseType: "arraybuffer" });
  
  const form = new FormData();
  form.append("file", Buffer.from(imgRes.data), { filename: "image.jpg", contentType: "image/jpeg" });

  console.log("Sending to AI Model Service https://nagarseva-ai-uwwk.onrender.com/analyze ...");
  try {
    const aiRes = await axios.post("https://nagarseva-ai-uwwk.onrender.com/analyze", form, {
      headers: {
        ...form.getHeaders(),
        "X-Service-Key": "eACRXX5hdqfLvb5L66UDVi3D3+xQ55HubqZzX9upHGY="
      },
      timeout: 60000
    });
    console.log("? AI Analysis Result:", aiRes.data);
  } catch (err) {
    console.error("? AI Analysis error:", err.response?.status, err.response?.data || err.message);
  }
}
test();
