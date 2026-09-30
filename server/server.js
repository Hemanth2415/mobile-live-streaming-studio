const express = require("express");
const cors = require("cors");
const nodemailer = require("nodemailer");
require("dotenv").config();

const app = express();

app.use(cors());
app.use(express.json());


// ===============================
// Email configuration
// ===============================

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});


// ===============================
// Temporary OTP storage
// ===============================

const otpStore = new Map();


// ===============================
// Generate 6-digit OTP
// ===============================

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}


// ===============================
// Request Access
// ===============================

app.post("/request-access", async (req, res) => {

  try {

    const { deviceId } = req.body;

    if (!deviceId) {
      return res.status(400).json({
        success: false,
        message: "Device ID is required"
      });
    }

    // Generate a new OTP
    const otp = generateOTP();

    // OTP expires after 10 minutes
    const expiresAt = Date.now() + 10 * 60 * 1000;

    // Store OTP for this specific device
    otpStore.set(deviceId, {
      otp,
      expiresAt,
      attempts: 0
    });

    // Send OTP to your email
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: process.env.EMAIL_USER,

      subject: "StreamFlow Access Request",

      text: `
A device is requesting access to StreamFlow.

Device ID:
${deviceId}

OTP:
${otp}

This OTP will expire in 10 minutes.

If you did not expect this request, you can ignore this email.
`
    });

    console.log(`OTP generated for device ${deviceId}`);

    res.json({
      success: true,
      message: "Access request received. OTP sent."
    });

  } catch (error) {

    console.error("Email error:", error);

    res.status(500).json({
      success: false,
      message: "Could not send OTP"
    });

  }

});


// ===============================
// Verify OTP
// ===============================

app.post("/verify-otp", (req, res) => {

  const { deviceId, otp } = req.body;

  if (!deviceId || !otp) {
    return res.status(400).json({
      success: false,
      message: "Device ID and OTP are required"
    });
  }

  const record = otpStore.get(deviceId);

  if (!record) {
    return res.status(400).json({
      success: false,
      message: "No OTP request found for this device"
    });
  }

  // Check expiration
  if (Date.now() > record.expiresAt) {

    otpStore.delete(deviceId);

    return res.status(400).json({
      success: false,
      message: "OTP has expired"
    });
  }

  // Check OTP
  if (record.otp !== otp.toString().trim()) {

    record.attempts++;

    return res.status(400).json({
      success: false,
      message: "Invalid OTP"
    });
  }

  // OTP is correct
  otpStore.delete(deviceId);

  // Temporary access token
  const accessToken =
    require("crypto").randomBytes(32).toString("hex");

  res.json({
    success: true,
    message: "Access granted",
    accessToken
  });

});


// ===============================
// Test route
// ===============================

app.get("/", (req, res) => {

  res.json({
    message: "StreamFlow Access Server is running"
  });

});


// ===============================
// Start server
// ===============================

const PORT = process.env.PORT || 5001;

app.listen(PORT, "0.0.0.0", () => {

  console.log(
    `Access server running on port ${PORT}`
  );

});