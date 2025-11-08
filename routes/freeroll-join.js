const express = require("express");
const Tournament = require("../models/Tournament");

function buildMatchPayload(tournament) {
  const bootUrl = `https://www.retrorumblearena.com/Retroarch-Browser/index.html?core=${tournament.core || "genesis_plus_gx"}&rom=${tournament.rom || "NHL_95.bin"}`;

  return {
    matchId: tournament.id,
    tournamentId: tournament.id,
    rom: bootUrl,
    core: tournament.core || "genesis_plus_gx",
    players: tournament.registeredPlayers.map((p) =>
      typeof p === "string" ? { id: p, name: p } : { id: p.id, name: p.displayName || p.id }
    ),
  };
}

module.exports = function (io) {
  const router = express.Router();

  // ✅ Freeroll registration
  router.post("/freeroll/register/:id", async (req, res) => {
    const { playerId } = req.body;
    const { id } = req.params;

    if (!playerId || playerId.startsWith("guest")) {
      return res.status(403).json({ error: "Guests cannot register" });
    }

    try {
      const tournament = await Tournament.findOne({ id, entryFee: 0 });
      if (!tournament) return res.status(404).json({ error: "Freeroll not found" });

      const alreadyJoined = tournament.registeredPlayers.some((p) =>
        typeof p === "string" ? p === playerId : p.id === playerId
      );
      if (alreadyJoined) {
        return res.status(400).json({ error: "Already registered" });
      }

      tournament.registeredPlayers.push({ id: playerId, displayName: playerId });
      await tournament.save();

      if (tournament.registeredPlayers.length >= 2) {
        const payload = buildMatchPayload(tournament);
        tournament.registeredPlayers.forEach((p) => {
          const room = typeof p === "string" ? p : p.id;
          io.to(room).emit("matchStart", payload);
          console.log(`🎮 matchStart emitted to ${room}`);
        });
      }

      res.status(200).json({ message: "Joined freeroll", tournament });
    } catch (err) {
      console.error(`❌ Freeroll join error for ${id}:`, err.message);
      res.status(500).json({ error: "Server error" });
    }
  });

  // ✅ Manual matchStart emit
  router.post("/emit-match", async (req, res) => {
    const { tournamentId } = req.body;
    try {
      const tournament = await Tournament.findOne({ id: tournamentId, entryFee: 0 });
      if (!tournament) return res.status(404).json({ error: "Tournament not found" });

      if (!Array.isArray(tournament.registeredPlayers) || tournament.registeredPlayers.length < 2) {
        return res.status(400).json({ error: "Tournament not full" });
      }

      const payload = buildMatchPayload(tournament);
      tournament.registeredPlayers.forEach((p) => {
        const room = typeof p === "string" ? p : p.id;
        io.to(room).emit("matchStart", payload);
        console.log(`🎮 matchStart manually emitted to ${room}`);
      });

      res.status(200).json({ message: "matchStart emitted", tournamentId });
    } catch (err) {
      console.error(`❌ Manual emit error for ${tournamentId}:`, err.message);
      res.status(500).json({ error: "Server error" });
    }
  });

  return router;
};