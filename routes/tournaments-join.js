const express = require('express');
const router = express.Router();
const Tournament = require('../models/Tournament');
const { generateBracket, createMatchState } = require('../utils/bracketManager');

const BRACKET_SIZE = 8; // Can be 8, 16, etc.

module.exports = function(io) {
  router.post('/join/:id', async (req, res) => {
    try {
      const tournament = await Tournament.findOne({ id: req.params.id });
      if (!tournament) return res.status(404).json({ error: 'Tournament not found' });

      const { playerId } = req.body;
      if (!playerId) return res.status(400).json({ error: 'Missing playerId' });

      const alreadyJoined = tournament.registeredPlayers?.includes(playerId);
      if (alreadyJoined) {
        console.log(`⚠️ Player ${playerId} already registered for ${tournament.name}`);
        return res.status(200).json({ message: 'Already registered' });
      }

      tournament.registeredPlayers.push(playerId);
      await tournament.save();

      console.log(`✅ Player ${playerId} registered for ${tournament.name}`);

      // 🧠 Group players into brackets of BRACKET_SIZE
      const totalPlayers = tournament.registeredPlayers.length;
      const unprocessed = [...tournament.registeredPlayers];
      const matched = new Set();
      let bracketCount = 0;

      while (unprocessed.length >= BRACKET_SIZE) {
        const bracketPlayers = unprocessed.splice(0, BRACKET_SIZE);
        bracketCount++;

        console.log(`🎯 Creating bracket ${bracketCount} with players:`, bracketPlayers);

        const matches = generateBracket(bracketPlayers);
        matches.forEach((pair, index) => {
          const matchId = `${tournament.id}-bracket${bracketCount}-match${index + 1}`;
          const matchState = createMatchState(matchId, pair, tournament);

          console.log(`🎮 Emitting matchStart for ${matchId}`);
          pair.forEach(player => {
            io.to(player).emit('matchStart', matchState);
            matched.add(player);
          });
        });
      }

      // Remaining players will wait for the next wave
      const remaining = tournament.registeredPlayers.filter(p => !matched.has(p));
      console.log(`⏳ Waiting pool: ${remaining.length} players`);

      res.status(200).json({ message: 'Registered successfully' });
    } catch (err) {
      console.error('❌ Tournament register error:', err.message);
      res.status(500).json({ error: 'Server error' });
    }
  });

  return router;
};