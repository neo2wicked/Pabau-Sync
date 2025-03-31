export default async function handler(req, res) {
    if (req.method === "GET") {
      return res.status(200).send("✅ Pabau webhook endpoint is live.");
    }
  
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }
  
    console.log("📥 Pabau webhook received:", JSON.stringify(req.body, null, 2));
    res.status(200).json({ received: true });
  }
  