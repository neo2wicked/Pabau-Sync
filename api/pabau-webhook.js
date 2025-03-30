export default async function handler(req, res) {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }
  
    console.log("📥 Pabau webhook received:", JSON.stringify(req.body, null, 2));
    // Add any internal sync or logging logic here
  
    return res.status(200).json({ status: "received" });
  }
  