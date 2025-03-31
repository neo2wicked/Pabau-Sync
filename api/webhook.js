import axios from "axios";

const PABAU_API_KEY = process.env.PABAU_API_KEY;
const PABAU_BASE_URL = "https://crm.pabau.com/api/v3";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const calendlyPayload = req.body;
    console.log("📩 Calendly payload received:", JSON.stringify(calendlyPayload, null, 2));

    const data = calendlyPayload.payload || {};
    const name = data.name || "Unknown";
    const email = data.email;
    const phone = data.text_reminder_number || null;
    const service = data.scheduled_event?.name || "General Consultation";
    const bookingTime = data.scheduled_event?.start_time;
    const utmSource = data.tracking?.utm_source || "unknown";

    if (!email || !bookingTime) {
      return res.status(400).json({ error: "Missing email or booking time" });
    }

    const createClient = await axios.post(
      `${PABAU_BASE_URL}/contact/create`,
      {
        name,
        email,
        phone,
        notes: `Source: ${utmSource}`
      },
      {
        headers: {
          Authorization: `Bearer ${PABAU_API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    const clientId = createClient.data?.data?.contact_id || createClient.data?.contact_id;
    console.log("✅ Client created with ID:", clientId);

    const createAppointment = await axios.post(
      `${PABAU_BASE_URL}/appointment/create`,
      {
        contact_id: clientId,
        service_name: service,
        datetime: bookingTime
      },
      {
        headers: {
          Authorization: `Bearer ${PABAU_API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    console.log("✅ Appointment booked:", createAppointment.data);
    res.status(200).json({ status: "success" });
  } catch (err) {
    const errorDetails = {
      message: err.message,
      responseData: err.response?.data,
      requestUrl: err.config?.url,
      requestBody: err.config?.data,
      status: err.response?.status
    };
    console.error("❌ Webhook error details:", JSON.stringify(errorDetails, null, 2));
    res.status(500).json({ error: "Internal Server Error" });
  }
}
