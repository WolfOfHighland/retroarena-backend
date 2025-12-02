const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },

  // ✅ Virtual currencies
  rrcBalance: { type: Number, default: 0 }, // Purchasable currency
  rrpBalance: { type: Number, default: 0 }, // Earned-only currency

  // ✅ NEW: Qualification Tokens for Championship Entry
  championshipTokens: { type: Number, default: 0 },

  displayName: { type: String },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', UserSchema);