const mongoose = require("mongoose");

const TournamentSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  startTime: { type: Date },
  game: { type: String, default: "NHL 95" },
  goalieMode: { type: String, enum: ["manual", "auto"], default: "manual" },
  periodLength: { type: Number, default: 5 },
  status: { type: String, default: "scheduled" },
  type: { type: String, default: "sit-n-go" }, // ✅ Required for sit-n-go filtering
  registeredPlayers: { type: Array, default: [] },
  entryFee: { type: Number, default: 0 },
  prizeType: { type: String, enum: ["guaranteed", "dynamic"], default: "dynamic" },
  prizeAmount: { type: Number, default: 0 },
  elimination: { type: String, enum: ["single", "double"], default: "single" },
});

module.exports = mongoose.model("Tournament", TournamentSchema);