const express = require('express');
const Tournament = require('../models/Tournament');

module.exports = function(io) {
  const router = express.Router();

  router.post('/join/:id', async (req, res) => {
    try {
      const tournament = await Tournament.findOne({ id: req.params.id });
      if (!tournament) return res.status(404).json({ error: 'Tournament not found' });

      const { playerId } = req.body;
      if (!playerId) return res.status(400).json({ error: 'Missing playerId' });

      const alreadyJoined = tournament.registeredPlayers?.includes(playerId);
      if (alreadyJoined) {
        console.log(`⚠️ Player ${playerId} already joined ${tournament.name}`);
        return res.status(200).json({ message: 'Already joined' });
      }

      tournament.registeredPlayers.push(playerId);
      await tournament.save();

      console.log(`✅ Player ${playerId} joined ${tournament.name}`);
      console.log('✅ Join successful for', req.params.id);

      // 🔥 Trigger matchStart if full
      if (tournament.registeredPlayers.length === tournament.maxPlayers) {
        const matchState = {
          matchId: tournament.id,
          rom: tournament.rom || 'nhl95.bin',
          core: tournament.core || 'genesis',
          goalieMode: tournament.goalieMode,
          periodLength: tournament.periodLength || 5,
        };

        console.log(`🎮 Match full — emitting matchStart for ${tournament.id}`);
        io.to(tournament.id).emit('matchStart', matchState);
      }

      res.status(200).json({ message: 'Joined successfully' });
    } catch (err) {
      console.error('❌ Join error:', err.message);
      res.status(500).json({ error: 'Server error' });
    }
  });

  return router;
};