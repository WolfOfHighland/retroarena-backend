const mongoose = require("mongoose");

const playerSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    trim: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  },
  country: {
    type: String,
    default: "Unknown",
  },
  avatar: {
    type: String,
    default: "default.png"
  },
  controllerType: {
    type: String
  },
  isGuest: {
    type: Boolean,
    default: false
  },
  balance: {
    type: Number,
    default: 0 // ✅ enables cashier and entry fee logic
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("Player", playerSchema);