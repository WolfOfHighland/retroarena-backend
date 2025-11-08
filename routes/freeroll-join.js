const express = require("express");
const router = express.Router();
const Tournament = require("../models/Tournament");
const io = require("../socket"); // adjust if needed

function buildMatchPayload(tournament) {
  return {
    matchId: tournament.id,
    tournamentId: tournament.id,
    rom: tournament.romUrl || "https://www.retrorumblearena.com/Retroarch-Browser/roms/NHL_95.bin",
    core: "genesis_plus_gx",
    players: tournament.registeredPlayers.map((id) => ({
      id,
      name: id,
    })),
  };
}

// POST /api/freeroll/register/:id
router.post("/freeroll/register/:id", async (req, res) => {
  const { playerId } = req.body;
  const { id } = req.params;

  if (!playerId || playerId.startsWith("guest")) {
    return res.status(403).json({ error: "Guests cannot register" });
  }

  try {
    const tournament = await Tournament.findOne({ id, entryFee: 0 });
    if (!tournament) return res.status(404).json({ error: "Freeroll not found" });

    if (tournament.registeredPlayers.includes(playerId)) {
      return res.status(400).json({ error: "Already registered" });
    }

    tournament.registeredPlayers.push(playerId);
    await tournament.save();

    // ✅ Emit matchStart to each player's room if 2 players are now registered
    if (tournament.registeredPlayers.length === 2) {
      const payload = buildMatchPayload(tournament);
      tournament.registeredPlayers.forEach((playerId) => {
        io.to(playerId).emit("matchStart", payload);
        console.log(`🎮 matchStart emitted to ${playerId}`);
      });
    }

    res.status(200).json({ message: "Joined freeroll", tournament });
  } catch (err) {
    console.error(`❌ Freeroll join error for ${id}:`, err.message);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;