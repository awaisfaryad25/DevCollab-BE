// src/middleware/auth.js

const jwt = require("jsonwebtoken");
const User = require("../models/auth.js");

// ── Protect: requires valid JWT ───────────────────────────────────────────────
const protect = async (req, res, next) => {
  try {
    let token;

    // Get token from Authorization header: "Bearer eyJ..."
    if (req.headers.authorization?.startsWith("Bearer ")) {
      token = req.headers.authorization.split(" ")[1];
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Not logged in. Please log in to continue.",
      });
    }

    // Verify the token — throws error if invalid or expired
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Check the user still exists in DB
    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(401).json({
        success: false,
        message: "This account no longer exists.",
      });
    }

    // Check account is not suspended
    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: "Your account has been suspended.",
      });
    }

    // Attach user to request so routes can use it: req.user
    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired session. Please log in again.",
    });
  }
};

// ── Authorize: requires specific role ─────────────────────────────────────────
// Usage: router.delete("/users/:id", protect, authorize("admin"), deleteUser)
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Required: ${roles.join(" or ")}`,
      });
    }
    next();
  };
};

module.exports = { protect, authorize };