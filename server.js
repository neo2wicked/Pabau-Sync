// server.js
const express = require("express");
const axios = require("axios");
const bodyParser = require("body-parser");
const app = express();

app.use(bodyParser.json());

const PABAU_API_KEY = "EvtciAXr2nyeFlqoohUhFWBWKKflgIoqjLhvhXhBMBtcG7qnAT6r3ei9pdI6vGkB";
const PABAU_BASE_URL = "https://api.pabau.com"; // Replace if different

// Utility function to convert time strings to minutes
function timeToMinutes(time) {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

// Utility function to convert minutes to time string
function minutesToTime(mins) {
  const h = Math.floor(mins / 60).toString().padStart(2, "0");
  const m = (mins % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

// Subtract booked slots from working hours
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
        if (bEndMins <= s || bStartMins >= e) return [[s, e]]; // No overlap
        if (bStartMins > s && bEndMins < e) return [[s, bStartMins], [bEndMins, e]]; // Middle
        if (bStartMins <= s && bEndMins < e) return [[bEndMins, e]]; // Trim start
        if (bStartMins > s && bEndMins >= e) return [[s, bStartMins]]; // Trim end
        return []; // Fully covered
      });
    });

    availability.push(...blocks.map(([s, e]) => ({ start: minutesToTime(s), end: minutesToTime(e) })));
  });

  return availability;
}

// Endpoint to receive Calendly webhook events
app.post("/webhook", async (req, res) => {
  try {
    const payload = req.body;
    console.log("Calendly payload received:", payload);

    const name = payload.name || "";
    const email = payload.email;
    const phone = payload.phone;
    const service = payload.service_type || "General Consultation";
    const bookingTime = payload.booking_time;
    const utmSource = payload.utm_source || "unknown";

    // Conflict Detection: check if appointment already exists at this time
    const conflictCheck = await axios.get(`${PABAU_BASE_URL}/appointments?datetime=${bookingTime}`, {
      headers: {
        Authorization: `Bearer ${PABAU_API_KEY}`,
        "Content-Type": "application/json"
      }
    });

    if (conflictCheck.data && conflictCheck.data.length > 0) {
      return res.status(409).send({ error: "Time slot already booked" });
    }

    // Create the client
    const createClient = await axios.post(
      `${PABAU_BASE_URL}/clients`,
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

    const clientId = createClient.data.id;

    // Create appointment
    await axios.post(
      `${PABAU_BASE_URL}/appointments`,
      {
        client_id: clientId,
        service,
        datetime: bookingTime
      },
      {
        headers: {
          Authorization: `Bearer ${PABAU_API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    res.status(200).send({ status: "success" });
  } catch (err) {
    console.error("Webhook error:", err.response?.data || err.message);
    res.status(500).send({ error: "Internal Server Error" });
  }
});

// Endpoint to get available appointment times from Pabau
app.get("/availability", async (req, res) => {
  try {
    const staffResponse = await axios.get(`${PABAU_BASE_URL}/staff`, {
      headers: {
        Authorization: `Bearer ${PABAU_API_KEY}`,
        "Content-Type": "application/json"
      }
    });

    const staffList = staffResponse.data;
    if (!Array.isArray(staffList) || staffList.length === 0) {
      return res.status(404).send({ error: "No staff found in Pabau" });
    }

    const staffId = staffList[0].id;
    const today = new Date().toISOString().split("T")[0];

    const scheduleResponse = await axios.get(`${PABAU_BASE_URL}/schedule/staff-hours?staff_id=${staffId}&date=${today}`, {
      headers: {
        Authorization: `Bearer ${PABAU_API_KEY}`,
        "Content-Type": "application/json"
      }
    });

    const appointmentsResponse = await axios.get(`${PABAU_BASE_URL}/appointments?staff_id=${staffId}&date=${today}`, {
      headers: {
        Authorization: `Bearer ${PABAU_API_KEY}`,
        "Content-Type": "application/json"
      }
    });

    const workingHours = scheduleResponse.data; // [{ start: "09:00", end: "17:00" }]
    const bookedSlots = appointmentsResponse.data; // [{ start: "10:00", end: "10:30" }]

    const availableSlots = getAvailableSlots(workingHours, bookedSlots);
    res.status(200).send({ availableSlots });
  } catch (err) {
    console.error("Availability error:", err.response?.data || err.message);
    res.status(500).send({ error: "Failed to fetch availability" });
  }
});

app.get("/", (req, res) => {
  res.send("Calendly ↔ Pabau Sync is live!");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
