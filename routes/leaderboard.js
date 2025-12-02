const express = require('express');
const router = express.Router();
const User = require('../models/User'); // ✅ players/users collection

module.exports = function(io) {
  // ✅ GET /api/leaderboard — show top players by tokens
  router.get('/leaderboard', async (_req, res) => {
    try {
      const topPlayers = await User.find({})
        .sort({ championshipTokens: -1, rrpBalance: -1 }) // sort by tokens, then RRP
        .limit(20) // top 20
        .select('username championshipTokens rrpBalance');

      res.status(200).json(topPlayers);
    } catch (err) {
      console.error("❌ Leaderboard fetch error:", err.message);
      res.status(500).json({ error: "Server error" });
    }
  });

  return router;
};