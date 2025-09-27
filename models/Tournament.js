const mongoose = require("mongoose");

const RegisteredPlayerSchema = new mongoose.Schema({
  playerId: { type: String, required: true },
  username: { type: String, required: true },
  paid: { type: Boolean, default: false },
  socketId: { type: String },
});

const TournamentSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  startTime: { type: Date, required: true },
  game: { type: String, enum: ["NHL 94", "NHL 95"], required: true },
  goalieMode: { type: String, enum: ["manual", "auto"], required: true },
  periodLength: { type: Number, default: 5 },
  registeredPlayers: { type: [RegisteredPlayerSchema], default: [] },
  status: { type: String, enum: ["scheduled", "live", "completed"], default: "scheduled" },
});

module.exports = mongoose.model("Tournament", TournamentSchema);