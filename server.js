// server.js
const express = require("express");
const axios = require("axios");
const bodyParser = require("body-parser");
const app = express();

app.use(bodyParser.json());

const PABAU_API_KEY = "92f67a6bfa0hhfdb09fddgh690j266hj94ae4cb625aed291ac89geigbf065ggb";
const PABAU_BASE_URL = "https://api.pabau.com"; // Final corrected base URL

// Utility functions
function timeToMinutes(time) {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}
function minutesToTime(mins) {
  const h = Math.floor(mins / 60).toString().padStart(2, "0");
  const m = (mins % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}
function getAvailableSlots(workingHours, bookedSlots) {
  let availability = [];
  workingHours.forEach(({ start, end }) => {
    let startMins = timeToMinutes(start);
    let endMins = timeToMinutes(end);
    let blocks = [[startMins, endMins]];
    bookedSlots.forEach(({ start: bStart, end: bEnd }) => {
      const bStartMins = timeToMinutes(bStart);
      const bEndMins = timeToMinutes(bEnd);
      blocks = blocks.flatMap(([s, e]) => {
        if (bEndMins <= s || bStartMins >= e) return [[s, e]];
        if (bStartMins > s && bEndMins < e) return [[s, bStartMins], [bEndMins, e]];
        if (bStartMins <= s && bEndMins < e) return [[bEndMins, e]];
        if (bStartMins > s && bEndMins >= e) return [[s, bStartMins]];
        return [];
      });
    });
    availability.push(...blocks.map(([s, e]) => ({ start: minutesToTime(s), end: minutesToTime(e) })));
  });
  return availability;
}

// POST endpoint for Calendly webhook
app.post("/webhook", async (req, res) => {
  try {
    const calendlyPayload = req.body;
    console.log("📩 Calendly payload received:", JSON.stringify(calendlyPayload, null, 2));

    const data = calendlyPayload.payload || {};
    const name = data.name || "";
    const email = data.email;
    const phone = data.text_reminder_number || null;
    const service = data.scheduled_event?.name || "General Consultation";
    const bookingTime = data.scheduled_event?.start_time;
    const utmSource = data.tracking?.utm_source || "unknown";

    if (!email || !bookingTime) {
      console.warn("⚠️ Missing required fields in payload:", calendlyPayload);
      return res.status(400).send({ error: "Missing email or booking time" });
    }

    const createClient = await axios.post(
      `${PABAU_BASE_URL}/core/api/client/addclient`,
      {
        first_name: name || "Unknown",
        email,
        mobile: phone,
        source: utmSource
      },
      { headers: { Authorization: `Bearer ${PABAU_API_KEY}`, "Content-Type": "application/json" } }
    );

    const clientId = createClient.data?.data?.contact_id || createClient.data?.contact_id;
    console.log("✅ Client created with ID:", clientId);

    const createAppointment = await axios.post(
      `${PABAU_BASE_URL}/core/api/appointment/addappointment`,
      {
        client_id: clientId,
        start_date: bookingTime,
        service: service
      },
      { headers: { Authorization: `Bearer ${PABAU_API_KEY}`, "Content-Type": "application/json" } }
    );

    console.log("✅ Appointment booked:", createAppointment.data);
    res.status(200).send({ status: "success" });
  } catch (err) {
    const errorDetails = {
      message: err.message,
      responseData: err.response?.data,
      requestUrl: err.config?.url,
      requestBody: err.config?.data,
      status: err.response?.status
    };
    console.error("❌ Webhook error details:", JSON.stringify(errorDetails, null, 2));
    res.status(500).send({ error: "Internal Server Error" });
  }
});

app.get("/", (req, res) => {
  res.send("Calendly ↔ Pabau Sync is live!");
});

app.get("/availability", async (req, res) => {
  try {
    const staffResponse = await axios.get(`${PABAU_BASE_URL}/v3/staff`, {
      headers: { Authorization: `Bearer ${PABAU_API_KEY}`, "Content-Type": "application/json" }
    });

    const staffList = staffResponse.data;
    if (!Array.isArray(staffList) || staffList.length === 0) {
      return res.status(404).send({ error: "No staff found in Pabau" });
    }

    const staffId = staffList[0].id;
    const today = new Date().toISOString().split("T")[0];

    const scheduleResponse = await axios.get(`${PABAU_BASE_URL}/v3/schedule/staff-hours?staff_id=${staffId}&date=${today}`, {
      headers: { Authorization: `Bearer ${PABAU_API_KEY}`, "Content-Type": "application/json" }
    });

    const appointmentsResponse = await axios.get(`${PABAU_BASE_URL}/v3/appointments?staff_id=${staffId}&date=${today}`, {
      headers: { Authorization: `Bearer ${PABAU_API_KEY}`, "Content-Type": "application/json" }
    });

    const workingHours = scheduleResponse.data;
    const bookedSlots = appointmentsResponse.data;
    const availableSlots = getAvailableSlots(workingHours, bookedSlots);
    res.status(200).send({ availableSlots });
  } catch (err) {
    console.error("❌ Availability error:", err.response?.data || err.message);
    res.status(500).send({ error: "Failed to fetch availability" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
