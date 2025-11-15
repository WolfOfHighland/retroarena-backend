const express = require('express');
const router = express.Router();
const Tournament = require('../models/Tournament');
const io = require('../server'); // imported from server.js
const { generateBracket, createMatchState } = require('../utils/bracketManager');

router.post('/start-match', async (req, res) => {
  const { tournamentId, rom, core } = req.body;
  console.log("📨 Incoming match start:", req.body);

  if (!tournamentId || !rom || !core) {
    console.log("❌ Missing required fields");
    return res.status(400).json({ error: "Missing tournamentId, rom, or core" });
  }

  try {
    const tournament = await Tournament.findOne({ id: tournamentId });
    console.log("🔍 Tournament lookup result:", tournament);

    if (!tournament) {
      console.log("❌ Tournament not found");
      return res.status(404).json({ error: "Tournament not found" });
    }

    const players = Array.isArray(tournament.registeredPlayers)
      ? tournament.registeredPlayers.map(p => p.id)
      : [];

    if (players.length < 2) {
      console.log("❌ Not enough players to start matches");
      return res.status(400).json({ error: "Not enough players to start matches" });
    }

    const matchPairs = generateBracket(players);
    const emittedMatches = [];

    matchPairs.forEach((pair, index) => {
      const matchId = `${tournamentId}-r1-${index}`;
      const launchUrl = `https://www.retrorumblearena.com/arena/?core=${core}&rom=${rom}&matchId=${matchId}`;

      const matchState = createMatchState(matchId, pair, {
        rom,
        core,
        goalieMode: tournament.goalieMode || "manual",
        periodLength: tournament.periodLength || 5,
        launchUrl, // ✅ Injected here
      });

      // Emit to each player individually
      pair.forEach(playerId => {
        io.to(playerId).emit("assignMatchRoom", { matchId });
        io.to(playerId).emit("launchEmulator", { matchId, launchUrl }); // ✅ New event
      });

      // Emit to shared match room
      io.to(matchId).emit("matchStart", matchState);
      console.log(`🚀 Emitted matchStart to room ${matchId} for ${pair.join(" vs ")}`);

      emittedMatches.push({
        matchId,
        players: pair,
        launchUrl,
      });
    });

    return res.status(200).json({
      ok: true,
      message: `Emitted ${emittedMatches.length} matchStart events`,
      matches: emittedMatches,
    });
  } catch (err) {
    console.error("❌ start-match error:", {
      message: err.message,
      stack: err.stack,
      name: err.name,
      cause: err.cause,
    });
    return res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;