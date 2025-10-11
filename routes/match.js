const express = require('express');
const router = express.Router();
const Tournament = require('../models/Tournament');
const { saveMatchState } = require('../utils/matchState');
const io = require('../server'); // imported from server.js

// POST /api/start-match
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

    const matchState = {
      rom,
      core,
      goalieMode: tournament.goalieMode || "manual",
      periodLength: tournament.periodLength || 5,
      matchId: tournamentId,
    };

    console.log("✅ Match state:", matchState);

    await saveMatchState(tournamentId, matchState);
    io.to(tournamentId).emit("matchStart", matchState);

    return res.status(200).json({
      ok: true,
      message: "Match start emitted",
      matchState,
    });
  } catch (err) {
    console.error("❌ start-match error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;