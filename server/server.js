const express = require("express");
const cors = require("cors");
const nodemailer = require("nodemailer");
const mysql = require("mysql2/promise");
const crypto = require("crypto");

require("dotenv").config();

const app = express();

app.use(cors());
app.use(express.json());


// ===============================
// MySQL Database Configuration
// ===============================

const db = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,

  // Aiven requires SSL
  ssl: {
    rejectUnauthorized: false
  },

  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});


// ===============================
// Test MySQL Connection
// ===============================

async function testDatabaseConnection() {

  try {

    const connection = await db.getConnection();

    console.log(
      "MySQL database connected successfully"
    );

    connection.release();

  } catch (error) {

    console.error(
      "MySQL connection failed:",
      error
    );

  }

}


// ===============================
// Email Configuration
// ===============================

const transporter = nodemailer.createTransport({

  service: "gmail",

  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }

});


// ===============================
// Generate 6-digit OTP
// ===============================

function generateOTP() {

  return Math.floor(
    100000 + Math.random() * 900000
  ).toString();

}


// ===============================
// Request Access
// ===============================

app.post("/request-access", async (req, res) => {

  try {

    const { deviceId } = req.body;


    // Check Device ID
    if (!deviceId) {

      return res.status(400).json({

        success: false,

        message: "Device ID is required"

      });

    }


    // Generate OTP
    const otp = generateOTP();


    // OTP expires after 10 minutes
    const expiresAt = new Date(
      Date.now() + 10 * 60 * 1000
    );


    // Store OTP in MySQL
    await db.execute(

      `INSERT INTO access_requests
        (
          device_id,
          otp,
          otp_expires_at
        )

       VALUES (?, ?, ?)

       ON DUPLICATE KEY UPDATE

          otp = VALUES(otp),

          otp_expires_at = VALUES(otp_expires_at),

          access_token = NULL,

          token_expires_at = NULL`,

      [
        deviceId,
        otp,
        expiresAt
      ]

    );


    // Send OTP to owner email
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


    console.log(
      `OTP generated for device ${deviceId}`
    );


    res.json({

      success: true,

      message: "Access request received. OTP sent."

    });


  } catch (error) {

    console.error(
      "Request access error:",
      error
    );


    res.status(500).json({

      success: false,

      message: "Could not process access request"

    });

  }

});


// ===============================
// Verify OTP
// ===============================

app.post("/verify-otp", async (req, res) => {

  try {

    const { deviceId, otp } = req.body;


    // Check input
    if (!deviceId || !otp) {

      return res.status(400).json({

        success: false,

        message: "Device ID and OTP are required"

      });

    }


    // Find device in MySQL
    const [rows] = await db.execute(

      `SELECT *

       FROM access_requests

       WHERE device_id = ?`,

      [deviceId]

    );


    const record = rows[0];


    // No OTP request
    if (!record) {

      return res.status(400).json({

        success: false,

        message: "No OTP request found for this device"

      });

    }


    // Check OTP expiration
    if (

      !record.otp_expires_at ||

      new Date() > new Date(record.otp_expires_at)

    ) {

      return res.status(400).json({

        success: false,

        message: "OTP has expired"

      });

    }


    // Check OTP
    if (

      record.otp !== otp.toString().trim()

    ) {

      return res.status(400).json({

        success: false,

        message: "Invalid OTP"

      });

    }


    // ===============================
    // OTP Correct
    // ===============================


    // Generate access token
    const accessToken =
      crypto.randomBytes(32).toString("hex");


    // Access valid for 30 days
    const tokenExpiresAt = new Date(

      Date.now() +

      30 * 24 * 60 * 60 * 1000

    );


    // Save access token in MySQL
    await db.execute(

      `UPDATE access_requests

       SET

          access_token = ?,

          token_expires_at = ?,

          otp = NULL,

          otp_expires_at = NULL

       WHERE device_id = ?`,

      [

        accessToken,

        tokenExpiresAt,

        deviceId

      ]

    );


    console.log(
      `Access granted to device ${deviceId}`
    );


    // Send token to Android app
    res.json({

      success: true,

      message: "Access granted",

      accessToken

    });

  } catch (error) {

    console.error(
      "OTP verification error:",
      error
    );


    res.status(500).json({

      success: false,

      message: "Could not verify OTP"

    });

  }

});


// ===============================
// Check Existing Access Token
// ===============================

app.get("/check-access", async (req, res) => {

  try {

    const authHeader =
      req.headers.authorization;


    if (!authHeader) {

      return res.status(401).json({

        success: false,

        message: "Access token required"

      });

    }


    const token =
      authHeader.replace("Bearer ", "");


    if (!token) {

      return res.status(401).json({

        success: false,

        message: "Access token required"

      });

    }


    // Find token in database
    const [rows] = await db.execute(

      `SELECT *

       FROM access_requests

       WHERE access_token = ?`,

      [token]

    );


    const record = rows[0];


    if (!record) {

      return res.status(401).json({

        success: false,

        message: "Invalid access token"

      });

    }


    // Check token expiration
    if (

      !record.token_expires_at ||

      new Date() >

      new Date(record.token_expires_at)

    ) {

      return res.status(401).json({

        success: false,

        message: "Access token has expired"

      });

    }


    // Token is valid
    res.json({

      success: true,

      message: "Access granted"

    });


  } catch (error) {

    console.error(

      "Access check error:",

      error

    );


    res.status(500).json({

      success: false,

      message: "Could not check access"

    });

  }

});


// ===============================
// Test Route
// ===============================

app.get("/", (req, res) => {

  res.json({

    message:
      "StreamFlow Access Server is running"

  });

});


// ===============================
// Start Server
// ===============================

const PORT =
  process.env.PORT || 5001;


app.listen(

  PORT,

  "0.0.0.0",

  async () => {

    console.log(
      `Access server running on port ${PORT}`
    );

    await testDatabaseConnection();

  }

);