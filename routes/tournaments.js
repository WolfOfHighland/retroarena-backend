const express = require('express');
const Tournament = require('../models/Tournament');
const { generateBracket, createMatchState } = require('../utils/bracketManager');

module.exports = function(io) {
  const router = express.Router();

  // GET /api/tournaments
  router.get('/', async (_req, res) => {
    try {
      const tournaments = await Tournament.find({
        startTime: { $ne: null } // filters out Sit-n-Go templates
      });

      const enriched = tournaments.map(t => {
        const entryFee = t.entryFee ?? 0;
        const rakePercent = entryFee <= 10 ? 0.10 : entryFee <= 20 ? 0.08 : 0.05;
        const rakeAmount = Math.round(entryFee * rakePercent * 100) / 100;
        const prizeAmount = entryFee - rakeAmount;

        return {
          ...t.toObject(),
          type: 'scheduled',
          rakePercent,
          rakeAmount,
          prizeAmount,
          prizeType: t.prizeType ?? 'dynamic',
          prizeAmount: t.prizeType === 'guaranteed'
            ? t.prizeAmount ?? prizeAmount
            : prizeAmount
        };
      });

      res.status(200).json(enriched);
    } catch (err) {
      console.error('❌ Failed to fetch tournaments:', err.message);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // POST /api/tournaments/register/:tournamentId
  router.post('/register/:tournamentId', async (req, res) => {
    const { tournamentId } = req.params;
    const { playerId } = req.body;

    try {
      const tournament = await Tournament.findOne({ id: tournamentId });

      if (!tournament) {
        return res.status(404).json({ error: 'Tournament not found' });
      }

      if (!Array.isArray(tournament.registeredPlayers)) {
        tournament.registeredPlayers = [];
      }

      if (tournament.registeredPlayers.includes(playerId)) {
        return res.status(400).json({ error: 'Player already registered' });
      }

      tournament.registeredPlayers.push(playerId);
      await tournament.save();

      // 🔥 Trigger matchStart if full
      if (
        tournament.maxPlayers &&
        tournament.registeredPlayers.length === tournament.maxPlayers
      ) {
        const round = 1;
        const bracket = generateBracket(tournament.registeredPlayers);

        bracket.forEach((pair, index) => {
          const matchId = `${tournament.id}-r${round}-m${index}`;
          const matchState = {
            ...createMatchState(matchId, pair, {
              rom: tournament.rom,
              core: tournament.core,
              goalieMode: tournament.goalieMode,
              periodLength: tournament.periodLength,
              round,
              matchIndex: index,
            }),
            tournamentId // ✅ Inject tournamentId here
          };

          pair.forEach(playerId => {
            io.to(playerId).emit('matchStart', matchState);
          });

          console.log(`🎮 Emitted matchStart for ${matchId}`);
        });

        tournament.status = 'live';
        await tournament.save();
      }

      return res.status(200).json({ message: 'Registered for tournament', tournament });
    } catch (err) {
      console.error('❌ Registration error:', err.message);
      return res.status(500).json({ error: 'Server error' });
    }
  });

  return router;
};