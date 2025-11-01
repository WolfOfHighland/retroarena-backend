const mongoose = require('mongoose');

const MatchStateSchema = new mongoose.Schema({
  matchId: { type: String, required: true },
  tournamentId: { type: String, required: true },
  rom: { type: String },
  core: { type: String },
  goalieMode: { type: String },
  periodLength: { type: Number },
  matchStatus: {
    type: String,
    enum: ['pending', 'ready', 'inProgress', 'completed'],
    default: 'pending'
  },
  playerStates: [
    {
      id: { type: String, required: true },
      displayName: String,
      isGuest: Boolean,
      isReady: { type: Boolean, default: false },
      controllerType: String,
      joinedAt: { type: Date, default: Date.now }
    }
  ],
  redisSynced: { type: Boolean, default: false },
  timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model('MatchState', MatchStateSchema);