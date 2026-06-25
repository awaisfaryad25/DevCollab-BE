const express = require("express");
const {
  createUser,
  getAllUsers,
  getUserById,
  updateUser,
  deleteUser,
  toggleSuspend,
} = require("../controllers/user.js");
const { protect, authorize } = require("../middleware/auth.js");

const router = express.Router();

// All routes below require: logged in + admin role
router.use(protect);
router.use(authorize("admin"));

// /api/v1/users
router.route("/")
  .get(getAllUsers)    // GET  /api/v1/users
  .post(createUser);  // POST /api/v1/users

// /api/v1/users/:id
router.route("/:id")
  .get(getUserById)   // GET    /api/v1/users/:id
  .put(updateUser)    // PUT    /api/v1/users/:id
  .delete(deleteUser); // DELETE /api/v1/users/:id

// /api/v1/users/:id/suspend
router.patch("/:id/suspend", toggleSuspend); // PATCH /api/v1/users/:id/suspend

module.exports = router;