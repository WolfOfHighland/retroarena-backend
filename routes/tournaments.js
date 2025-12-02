const express = require('express');
const Tournament = require('../models/Tournament');
const User = require('../models/User'); // ✅ for RRP + Tokens
const { BracketManager } = require('../utils/bracketManager');
const { loadMatchStatesByTournament } = require('../utils/matchState');

module.exports = function(io) {
  const router = express.Router();

  // ✅ GET /api/tournaments — fetch scheduled tournaments
  router.get('/', async (_req, res) => {
    try {
      const tournaments = await Tournament.find({
        type: 'scheduled',
        status: 'scheduled'
      });

      console.log(
        '🧪 Raw tournaments from DB:',
        tournaments.map(t => ({
          id: t.id,
          type: t.type,
          startTime: t.startTime
        }))
      );

      const enriched = tournaments.map(t => {
        const entryFee = t.entryFee ?? 0;
        const maxPlayers =
          typeof t.maxPlayers === 'number' && !isNaN(t.maxPlayers)
            ? t.maxPlayers
            : undefined;

        const prizeAmount = t.prizeAmount || 0;

        return {
          id: t.id || t._id.toString(),
          name: t.name,
          entryFee,
          registeredPlayers: Array.isArray(t.registeredPlayers)
            ? t.registeredPlayers
            : [],
          maxPlayers,
          prizeType: t.prizeType ?? 'fixed',
          prizeAmount,
          rakePercent: 0,
          rakeAmount: 0,
          game: t.game,
          goalieMode: t.goalieMode,
          elimination: t.elimination,
          status: t.status || 'scheduled',
          startTime: t.startTime
        };
      });

      res.status(200).json(enriched);
    } catch (err) {
      console.error('❌ Failed to fetch tournaments:', err.message);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // ✅ POST /api/tournaments/create — create and launch tournament
  router.post('/create', async (req, res) => {
    const { id, maxPlayers, rom, core, goalieMode, periodLength, players } = req.body;

    console.log('[RRC] Incoming tournament payload:', JSON.stringify(req.body, null, 2));

    if (!id || !Array.isArray(players) || players.length < 2) {
      console.warn('⚠️ Invalid tournament payload');
      return res.status(400).json({ error: 'Invalid tournament payload' });
    }

    try {
      const tournament = new Tournament({
        id,
        name: id,
        maxPlayers,
        rom,
        core,
        goalieMode,
        periodLength,
        registeredPlayers: players.map(p => ({
          id: p,
          displayName: p,
          isGuest: false
        })),
        status: 'scheduled',
        type: 'scheduled',
        game: 'NHL 95',
        prizeAmount: 0,
        prizeType: 'fixed'
      });

      await tournament.save();
      console.log('✅ Tournament created:', tournament);

      if (maxPlayers && players.length === maxPlayers) {
        const manager = new BracketManager(io, tournament);
        await manager.startRound(players);

        tournament.status = 'live';
        await tournament.save();
      }

      res.status(201).json({ message: 'Tournament created', tournament });
    } catch (err) {
      console.error('❌ Tournament creation error:', err.stack || err.message);
      res.status(500).json({ error: 'Server error during tournament creation' });
    }
  });

  // ✅ POST /api/tournaments/register/:tournamentId — join and trigger matchStart
  router.post('/register/:tournamentId', async (req, res) => {
    const { tournamentId } = req.params;
    const { playerId } = req.body;

    try {
      if (!playerId || !tournamentId) {
        console.warn('⚠️ Missing playerId or tournamentId');
        return res.status(400).json({ error: 'Missing playerId or tournamentId' });
      }

      if (playerId.startsWith('guest')) {
        console.warn(`⚠️ Guest attempted to register: ${playerId}`);
        return res.status(403).json({ error: 'Guests cannot register for tournaments' });
      }

      const tournament = await Tournament.findOne({ id: tournamentId });
      if (!tournament) {
        console.warn(`⚠️ Tournament not found: ${tournamentId}`);
        return res.status(404).json({ error: 'Tournament not found' });
      }

      if (!Array.isArray(tournament.registeredPlayers)) {
        tournament.registeredPlayers = [];
      }

      const alreadyRegistered = tournament.registeredPlayers.some(p =>
        typeof p === 'string' ? p === playerId : p.id === playerId
      );
      if (alreadyRegistered) {
        console.warn(`⚠️ Player already registered: ${playerId}`);
        return res.status(400).json({ error: 'Player already registered' });
      }

      tournament.registeredPlayers.push(playerId);
      await tournament.save();

      console.log(
        `🧪 Tournament ${tournament.id} has ${tournament.registeredPlayers.length}/${tournament.maxPlayers} players`
      );

      if (tournament.maxPlayers && tournament.registeredPlayers.length === tournament.maxPlayers) {
        const manager = new BracketManager(io, tournament);
        await manager.startRound(tournament.registeredPlayers);

        tournament.status = 'live';
        await tournament.save();
      }

      return res.status(200).json({ message: 'Registered for tournament', tournament });
    } catch (err) {
      console.error('❌ Registration error:', err.stack || err.message);
      return res.status(500).json({ error: 'Server error during registration' });
    }
  });

  // ✅ GET /api/tournaments/:id/matches — fetch all matchStates
  router.get('/:id/matches', async (req, res) => {
    const { id } = req.params;

    try {
      const matches = await loadMatchStatesByTournament(id);
      res.status(200).json(matches || []);
    } catch (err) {
      console.error(`❌ Failed to load matches for ${id}:`, err.message);
      res.status(500).json({ error: 'Failed to load matches' });
    }
  });

  // ✅ POST /api/tournaments/match-result — record result + award RRP + Tokens
  router.post('/match-result', async (req, res) => {
    const { matchId, winnerId, tournamentId } = req.body;

    try {
      const tournament = await Tournament.findOne({ id: tournamentId });
      if (!tournament) return res.status(404).json({ error: 'Tournament not found' });

      const manager = new BracketManager(io, tournament);
      await manager.recordResult(matchId, winnerId);

      // 🎁 Reward winner with RRP + Championship Token
      try {
        const user = await User.findOne({ username: winnerId });
        if (user) {
          user.rrpBalance += 25; // reward amount
          user.championshipTokens += 1;
          await user.save();
          console.log(`✅ ${winnerId} earned 25 RRP and 1 Championship Token (tokens: ${user.championshipTokens})`);
        } else {
          console.warn("⚠️ Winner not found in User collection:", winnerId);
        }
      } catch (rewardErr) {
        console.error("❌ Error rewarding RRP/Token:", rewardErr);
      }

      res.status(200).json({ message: 'Match result recorded', winnerId });
    } catch (err) {
      console.error(`❌ Error recording result for ${matchId}:`, err.message);
      res.status(500).json({ error: 'Failed to record match result' });
    }
  });

  return router;
};