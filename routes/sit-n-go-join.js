const express = require('express');
const Tournament = require('../models/Tournament');
const {
  generateBracket,
  createMatchState,
  advanceWinners,
} = require('../utils/bracketManager');

module.exports = function (io) {
  const router = express.Router();

  router.post('/join/:id', async (req, res) => {
    try {
      const tournament = await Tournament.findOne({ id: req.params.id });
      if (!tournament) return res.status(404).json({ error: 'Tournament not found' });

      const { playerId } = req.body;
      if (!playerId) return res.status(400).json({ error: 'Missing playerId' });

      // ✅ FIXED: Check for existing player using object match
      const alreadyJoined = tournament.registeredPlayers?.some(p => p.id === playerId);
      if (alreadyJoined) {
        console.log(`⚠️ Player ${playerId} already joined ${tournament.name}`);
        return res.status(200).json({ message: 'Already joined' });
      }

      // ✅ FIXED: Push player as object and persist
      tournament.registeredPlayers.push({ id: playerId });
      await tournament.save();
      console.log(`✅ Player ${playerId} joined ${tournament.name}`);
      console.log('✅ Join successful for', req.params.id);

      // 🔥 Trigger matchStart if full
      if (tournament.registeredPlayers.length === tournament.maxPlayers) {
        const round = 1;
        const bracket = generateBracket(tournament.registeredPlayers.map(p => p.id));

        bracket.forEach((pair, index) => {
          const matchId = `${tournament.id}-r${round}-m${index}`;
          const matchState = createMatchState(matchId, pair, {
            rom: tournament.rom,
            core: tournament.core,
            goalieMode: tournament.goalieMode,
            periodLength: tournament.periodLength,
            round,
            matchIndex: index,
          });

          console.log(`🎮 Emitting matchStart for ${matchId}`);
          pair.forEach(player => {
            io.to(player).emit('matchStart', matchState);
          });
        });

        // 🧬 Auto-clone tournament for next match
        const newTournament = new Tournament({
          id: `${tournament.id}-clone-${Date.now()}`,
          name: tournament.name,
          game: tournament.game,
          goalieMode: tournament.goalieMode,
          periodLength: tournament.periodLength,
          status: 'scheduled',
          type: tournament.type,
          registeredPlayers: [],
          entryFee: tournament.entryFee,
          maxPlayers: tournament.maxPlayers,
          prizeType: tournament.prizeType,
          prizeAmount: 0,
          elimination: tournament.elimination,
          rom: tournament.rom,
          core: tournament.core,
        });

        await newTournament.save();
        console.log(`🧬 Auto-cloned new tournament: ${newTournament.id}`);
        io.emit('tournamentCreated', newTournament);
      }

      res.status(200).json({ message: 'Joined successfully' });
    } catch (err) {
      console.error('❌ Join error:', err.message);
      res.status(500).json({ error: 'Server error' });
    }
  });

  return router;
};