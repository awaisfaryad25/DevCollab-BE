const express = require("express");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const User = require("../models/auth.js");
const { protect } = require("../middleware/auth.js");
const nodemailer = require("nodemailer");

const router = express.Router();

// ── Helper: sign JWT ──────────────────────────────────────────────────────────
const signToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });
};

// ── Helper: send email ────────────────────────────────────────────────────────
const sendEmail = async ({ to, subject, html }) => {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  await transporter.sendMail({
    from: `"DevCollab" <${process.env.SMTP_USER}>`,
    to,
    subject,
    html,
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// @route   POST /api/v1/auth/register
// @desc    Register new user
// @access  Public
// ─────────────────────────────────────────────────────────────────────────────
router.post("/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // Basic validation
    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: "Please fill all fields." });
    }

    if (password.length < 8) {
      return res.status(400).json({ success: false, message: "Password must be at least 8 characters." });
    }

    // Check if email already used
    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(409).json({ success: false, message: "An account with this email already exists." });
    }

    // Create user — password hashed automatically by pre-save hook
    const user = await User.create({ name, email, password });

    const token = signToken(user._id);

    // Remove password from response
    user.password = undefined;

    res.status(201).json({
      success: true,
      message: "Registration successful.",
      token,
      user,
    });
  } catch (error) {
    console.error("Register error:", error);
    res.status(500).json({ success: false, message: "Server error. Please try again." });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// @route   POST /api/v1/auth/login
// @desc    Login with email + password
// @access  Public
// ─────────────────────────────────────────────────────────────────────────────
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: "Please provide email and password." });
    }

    // Explicitly select password (excluded by default)
    const user = await User.findOne({ email }).select("+password");

    if (!user || !user.password) {
      return res.status(401).json({ success: false, message: "Invalid email or password." });
    }

    if (!user.isActive) {
      return res.status(403).json({ success: false, message: "Your account has been suspended." });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: "Invalid email or password." });
    }

    const token = signToken(user._id);
    user.password = undefined;

    res.status(200).json({
      success: true,
      message: "Login successful.",
      token,
      user,
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ success: false, message: "Server error. Please try again." });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// @route   POST /api/v1/auth/forgot-password
// @desc    Send reset password email
// @access  Public
// ─────────────────────────────────────────────────────────────────────────────
router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, message: "Please provide your email." });
    }

    const user = await User.findOne({ email });

    // Always return 200 — never reveal if email exists (security best practice)
    if (!user) {
      return res.status(200).json({
        success: true,
        message: "If an account with that email exists, a reset link has been sent.",
      });
    }

    // Generate raw token to send in email
    const rawToken = crypto.randomBytes(32).toString("hex");

    // Hash it before storing in DB — so even if DB leaks, token is useless
    const hashedToken = crypto.createHash("sha256").update(rawToken).digest("hex");

    user.resetPasswordToken = hashedToken;
    user.resetPasswordExpire = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes
    await user.save({ validateBeforeSave: false });

    const resetUrl = `${process.env.CLIENT_URL}/auth/reset-password/${rawToken}`;

    try {
      await sendEmail({
        to: user.email,
        subject: "Reset your DevCollab password",
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:auto">
            <h2>Reset your password</h2>
            <p>Hi ${user.name}, click below to set a new password. This link expires in 30 minutes.</p>
            <a href="${resetUrl}" style="display:inline-block;background:#7c3aed;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none">
              Reset password
            </a>
            <p style="color:#888;font-size:12px;margin-top:16px">If you didn't request this, ignore this email.</p>
          </div>
        `,
      });

      res.status(200).json({
        success: true,
        message: "If an account with that email exists, a reset link has been sent.",
      });
    } catch (emailError) {
      // Roll back token if email fails
      user.resetPasswordToken = null;
      user.resetPasswordExpire = null;
      await user.save({ validateBeforeSave: false });

      res.status(500).json({ success: false, message: "Email could not be sent. Please try again." });
    }
  } catch (error) {
    console.error("Forgot password error:", error);
    res.status(500).json({ success: false, message: "Server error. Please try again." });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// @route   POST /api/v1/auth/reset-password/:token
// @desc    Reset password using token from email
// @access  Public
// ─────────────────────────────────────────────────────────────────────────────
router.post("/reset-password/:token", async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    if (!password || password.length < 8) {
      return res.status(400).json({ success: false, message: "Password must be at least 8 characters." });
    }

    // Hash the raw token from URL to find matching user in DB
    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpire: { $gt: Date.now() }, // token not expired
    }).select("+resetPasswordToken +resetPasswordExpire");

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired reset link. Please request a new one.",
      });
    }

    // Set new password — pre-save hook will hash it automatically
    user.password = password;
    user.resetPasswordToken = null;
    user.resetPasswordExpire = null;
    await user.save();

    const jwtToken = signToken(user._id);
    user.password = undefined;

    res.status(200).json({
      success: true,
      message: "Password reset successful. You are now logged in.",
      token: jwtToken,
      user,
    });
  } catch (error) {
    console.error("Reset password error:", error);
    res.status(500).json({ success: false, message: "Server error. Please try again." });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// @route   GET /api/v1/auth/me
// @desc    Get currently logged in user
// @access  Private (requires token)
// ─────────────────────────────────────────────────────────────────────────────
router.get("/me", protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    res.status(200).json({ success: true, user });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error." });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// @route   POST /api/v1/auth/logout
// @desc    Logout
// @access  Private
// ─────────────────────────────────────────────────────────────────────────────
router.post("/logout", protect, (req, res) => {
  // JWT is stateless — client just deletes the token
  res.status(200).json({ success: true, message: "Logged out successfully." });
});

module.exports = router;