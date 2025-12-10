const mongoose = require("mongoose");

// ✅ Define Lobby schema explicitly
const LobbySchema = new mongoose.Schema({
  id: { type: String, required: true },
  name: { type: String, required: true },
  players: { type: [String], default: [] },
  status: { type: String, enum: ["waiting", "active", "completed"], default: "waiting" }
}, { _id: false });

const TournamentSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },

  startTime: { type: Date },

  game: { type: String, default: "NHL 95" },
  rom: { type: String, default: "NHL_95.bin" },
  core: { type: String, default: "genesis_plus_gx" },

  goalieMode: { type: String, enum: ["manual", "auto"], default: "manual" },
  periodLength: { type: Number, default: 5 },

  status: { type: String, default: "scheduled" },

  // ✅ tournament categories: freeroll, sit-n-go, scheduled
  type: { type: String, enum: ["freeroll", "sit-n-go", "scheduled"], default: "sit-n-go" },

  registeredPlayers: {
    type: [{
      id: { type: String, required: true },
      displayName: String,
      isGuest: Boolean,
      joinedAt: { type: Date, default: Date.now }
    }],
    default: []
  },

  // ✅ Always seed with 3 lobby objects
  lobbies: {
    type: [LobbySchema],
    default: [
      { id: "lobby1", name: "Lobby 1", players: [], status: "waiting" },
      { id: "lobby2", name: "Lobby 2", players: [], status: "waiting" },
      { id: "lobby3", name: "Lobby 3", players: [], status: "waiting" }
    ]
  },

  // ✅ No entry fees in skill-based model
  entryFee: { type: Number, default: 0 },

  maxPlayers: { type: Number },

  // ✅ Only "fixed" prizeType exists now
  prizeType: { type: String, enum: ["fixed"], default: "fixed" },

  // ✅ RRP amount
  prizeAmount: { type: Number, default: 0 },

  elimination: { type: String, enum: ["single", "double"], default: "single" },

  isLive: { type: Boolean, default: false },
  hasStarted: { type: Boolean, default: false }
});

module.exports = mongoose.model("Tournament", TournamentSchema);