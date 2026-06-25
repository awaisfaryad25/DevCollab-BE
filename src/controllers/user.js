const User = require("../models/auth.js");

// ─────────────────────────────────────────────────────────────────────────────
// @route   POST /api/v1/users
// @desc    Create a user (admin only)
// @access  Private/Admin
// ─────────────────────────────────────────────────────────────────────────────
const createUser = async (req, res) => {
  try {
    const { name, email, password, role, plan } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Name, email and password are required.",
      });
    }

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: "A user with this email already exists.",
      });
    }

    const user = await User.create({ name, email, password, role, plan });
    user.password = undefined;

    res.status(201).json({
      success: true,
      message: "User created successfully.",
      user,
    });
  } catch (error) {
    console.error("Create user error:", error);
    res.status(500).json({ success: false, message: "Server error." });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @route   GET /api/v1/users
// @desc    Get all users with search, filter, pagination
// @access  Private/Admin
// ─────────────────────────────────────────────────────────────────────────────
const getAllUsers = async (req, res) => {
  try {
    const {
      search,
      plan,
      role,
      isActive,
      page = 1,
      limit = 10,
      sortBy = "createdAt",
      order = "desc",
    } = req.query;

    // Build filter object
    const filter = {};

    // Search by name or email
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ];
    }

    // Filter by plan (free/pro)
    if (plan) filter.plan = plan;

    // Filter by role (user/admin)
    if (role) filter.role = role;

    // Filter by active status
    if (isActive !== undefined) {
      filter.isActive = isActive === "true";
    }

    // Pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Sort direction
    const sortOrder = order === "asc" ? 1 : -1;

    const [users, total] = await Promise.all([
      User.find(filter)
        .sort({ [sortBy]: sortOrder })
        .skip(skip)
        .limit(limitNum)
        .select("-__v"),
      User.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      total,
      page: pageNum,
      totalPages: Math.ceil(total / limitNum),
      count: users.length,
      users,
    });
  } catch (error) {
    console.error("Get all users error:", error);
    res.status(500).json({ success: false, message: "Server error." });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @route   GET /api/v1/users/:id
// @desc    Get single user by ID
// @access  Private/Admin
// ─────────────────────────────────────────────────────────────────────────────
const getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select("-__v");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    res.status(200).json({ success: true, user });
  } catch (error) {
    // Handle invalid MongoDB ObjectId
    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID format.",
      });
    }
    console.error("Get user by ID error:", error);
    res.status(500).json({ success: false, message: "Server error." });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @route   PUT /api/v1/users/:id
// @desc    Update user (name, email, role, plan, isActive)
// @access  Private/Admin
// ─────────────────────────────────────────────────────────────────────────────
const updateUser = async (req, res) => {
  try {
    // Fields admin is allowed to update
    const allowedFields = ["name", "email", "role", "plan", "isActive", "isVerified"];

    // Build update object — only include allowed fields
    const updates = {};
    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    });

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        success: false,
        message: "No valid fields provided to update.",
      });
    }

    // Check new email not already taken by another user
    if (updates.email) {
      const existing = await User.findOne({
        email: updates.email,
        _id: { $ne: req.params.id }, // exclude current user
      });
      if (existing) {
        return res.status(409).json({
          success: false,
          message: "This email is already used by another account.",
        });
      }
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      updates,
      {
        new: true,         // return updated document
        runValidators: true, // run schema validators on update
      }
    ).select("-__v");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    res.status(200).json({
      success: true,
      message: "User updated successfully.",
      user,
    });
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID format.",
      });
    }
    console.error("Update user error:", error);
    res.status(500).json({ success: false, message: "Server error." });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @route   DELETE /api/v1/users/:id
// @desc    Delete user permanently
// @access  Private/Admin
// ─────────────────────────────────────────────────────────────────────────────
const deleteUser = async (req, res) => {
  try {
    // Prevent admin from deleting themselves
    if (req.params.id === req.user._id.toString()) {
      return res.status(400).json({
        success: false,
        message: "You cannot delete your own account.",
      });
    }

    const user = await User.findByIdAndDelete(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    res.status(200).json({
      success: true,
      message: `User "${user.name}" deleted successfully.`,
    });
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID format.",
      });
    }
    console.error("Delete user error:", error);
    res.status(500).json({ success: false, message: "Server error." });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @route   PATCH /api/v1/users/:id/suspend
// @desc    Toggle user active/suspended status
// @access  Private/Admin
// ─────────────────────────────────────────────────────────────────────────────
const toggleSuspend = async (req, res) => {
  try {
    if (req.params.id === req.user._id.toString()) {
      return res.status(400).json({
        success: false,
        message: "You cannot suspend your own account.",
      });
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found." });
    }

    user.isActive = !user.isActive;
    await user.save({ validateBeforeSave: false });

    res.status(200).json({
      success: true,
      message: `User "${user.name}" has been ${user.isActive ? "reactivated" : "suspended"}.`,
      isActive: user.isActive,
    });
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({ success: false, message: "Invalid user ID format." });
    }
    console.error("Toggle suspend error:", error);
    res.status(500).json({ success: false, message: "Server error." });
  }
};

module.exports = {
  createUser,
  getAllUsers,
  getUserById,
  updateUser,
  deleteUser,
  toggleSuspend,
};