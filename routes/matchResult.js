const express = require('express');
const router = express.Router();
const Tournament = require('../models/Tournament');
const { BracketManager } = require('../utils/bracketManager'); // uses your merged file

module.exports = function(io) {
  router.post('/match-result', async (req, res) => {
    const { matchId, winnerId, tournamentId } = req.body;

    console.log("📨 Incoming match result:", req.body);

    if (!matchId || !winnerId || !tournamentId) {
      console.log("❌ Missing required fields");
      return res.status(400).json({ error: "Missing matchId, winnerId, or tournamentId" });
    }

    try {
      const tournament = await Tournament.findOne({ id: tournamentId });
      if (!tournament) {
        console.log("❌ Tournament not found");
        return res.status(404).json({ error: "Tournament not found" });
      }

      const manager = new BracketManager(io, tournament);
      manager.recordResult(matchId, winnerId);

      return res.status(200).json({ message: `Winner recorded for ${matchId}` });
    } catch (err) {
      console.error("❌ match-result error:", {
        message: err.message,
        stack: err.stack,
        name: err.name,
        cause: err.cause,
      });
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  return router;
};