const mongoose = require('mongoose');

const MatchStateSchema = new mongoose.Schema({
  matchId: { type: String, required: true },
  tournamentId: { type: String, required: true }, // ✅ Add this line
  rom: String,
  core: String,
  goalieMode: String,
  periodLength: Number,
  timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model('MatchState', MatchStateSchema);