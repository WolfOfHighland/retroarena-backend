const express = require('express');
const router = express.Router();
const Tournament = require('../models/Tournament');
const MatchState = require('../models/MatchState');
const User = require('../models/User'); // ✅ for RRP + Tokens
const { BracketManager } = require('../utils/bracketManager');

const getMaxPlayers = (val) => {
  if (typeof val === 'number') return val;
  const parsed = Number(val);
  return Number.isNaN(parsed) ? 4 : parsed;
};

module.exports = function(io) {
  // ✅ GET /api/sit-n-go — fetch visible tournaments
  router.get('/', async (req, res) => {
    try {
      const showAll = req.query.all === 'true';

      const all = await Tournament.find({ type: 'sit-n-go' }).sort({ createdAt: -1 });
      console.log(`📦 Found ${all.length} sit-n-go tournaments total`);

      const filtered = showAll
        ? all
        : all.filter(t => {
            const max = getMaxPlayers(t.maxPlayers);
            const reg = Array.isArray(t.registeredPlayers) ? t.registeredPlayers.length : 0;
            return reg < max;
          }).slice(0, 3);

      console.log(`🎯 Returning ${filtered.length} visible sit-n-go tournaments`);

      const enriched = filtered.map(t => {
        return {
          id: t.id || t._id.toString(),
          name: t.name,
          entryFee: t.entryFee,
          registeredPlayers: Array.isArray(t.registeredPlayers) ? t.registeredPlayers : [],
          prizeType: t.prizeType,
          prizeAmount: t.prizeAmount || 0,
          rakeAmount: 0,
          game: t.game,
          goalieMode: t.goalieMode,
          elimination: t.elimination,
          maxPlayers: getMaxPlayers(t.maxPlayers),
          status: t.status || 'open'   // ✅ default to open if missing
        };
      });

      res.status(200).json(enriched);
    } catch (err) {
      console.error('❌ Sit-n-Go fetch error:', err.message);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // ✅ GET /api/sit-n-go/:id — fetch tournament by ID
  router.get('/:id', async (req, res) => {
    try {
      const tournament = await Tournament.findOne({ id: req.params.id });
      if (!tournament) return res.status(404).json({ error: 'Tournament not found' });
      res.status(200).json(tournament);
    } catch (err) {
      console.error(`❌ Failed to fetch Sit‑n‑Go ${req.params.id}:`, err.message);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // ✅ POST /api/sit-n-go/register/:id — register player
  router.post('/register/:id', async (req, res) => {
    const { playerId } = req.body;
    const { id } = req.params;

    if (!playerId || playerId.startsWith('guest')) {
      return res.status(403).json({ error: 'Guests cannot register' });
    }

    try {
      const tournament = await Tournament.findOne({ id });
      if (!tournament) return res.status(404).json({ error: 'Tournament not found' });

      if (!Array.isArray(tournament.registeredPlayers)) {
        tournament.registeredPlayers = [];
      }

      if (tournament.registeredPlayers.includes(playerId)) {
        return res.status(400).json({ error: 'Already registered' });
      }

      tournament.registeredPlayers.push(playerId);
      await tournament.save();

      // Spawn matches if full
      if (
        tournament.maxPlayers &&
        tournament.registeredPlayers.length === tournament.maxPlayers
      ) {
        const manager = new BracketManager(io, tournament);
        await manager.startRound(tournament.registeredPlayers);

        tournament.status = 'live';
        await tournament.save();

        // ✅ Auto-clone a fresh Sit-n-Go
        const newTournament = new Tournament({
          id: `${tournament.id}-clone-${Date.now()}`,
          name: tournament.name,
          type: tournament.type || 'sit-n-go',
          maxPlayers: tournament.maxPlayers,
          entryFee: tournament.entryFee,
          prizeType: tournament.prizeType,
          prizeAmount: tournament.prizeAmount || 0,
          elimination: tournament.elimination,
          goalieMode: tournament.goalieMode,
          periodLength: tournament.periodLength,
          rom: tournament.rom || 'NHL_95.bin',
          core: tournament.core || 'genesis_plus_gx',
          registeredPlayers: [],
          status: 'open',        // ✅ visible immediately
          startTime: null,       // ✅ sit-n-go starts when full
          game: tournament.game,
          rakePercent: tournament.rakePercent ?? 0.10
        });

        await newTournament.save();
        io.emit('tournamentCreated', newTournament);
      }

      res.status(200).json({ message: 'Registered', tournament });
    } catch (err) {
      console.error(`❌ Registration error for ${id}:`, err.message);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // ✅ POST /api/sit-n-go/clone/:id — clone tournament
  router.post('/clone/:id', async (req, res) => {
    try {
      const original = await Tournament.findOne({ id: req.params.id });
      if (!original) return res.status(404).json({ error: 'Original tournament not found' });

      const clone = new Tournament({
        id: `${original.id}-clone-${Date.now()}`,
        name: original.name,
        type: original.type || 'sit-n-go',
        maxPlayers: original.maxPlayers,
        entryFee: original.entryFee,
        prizeType: original.prizeType,
        prizeAmount: original.prizeAmount || 0,
        elimination: original.elimination,
        goalieMode: original.goalieMode,
        periodLength: original.periodLength,
        rom: original.rom || 'NHL_95.bin',
        core: original.core || 'genesis_plus_gx',
        registeredPlayers: [],
        status: 'open',        // ✅ visible immediately
        startTime: null,
        game: original.game,
        rakePercent: original.rakePercent ?? 0.10
      });

      await clone.save();
      console.log(`🧬 Clone created: ${clone.id}`);
      res.status(201).json({ message: 'Clone created', clone });
    } catch (err) {
      console.error('❌ Clone error:', err.message);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // ✅ POST /api/sit-n-go/recalculate-prizes — update prize pools
  router.post('/recalculate-prizes', async (req, res) => {
    try {
      const tournaments = await Tournament.find({ type: 'sit-n-go' });
      let updatedCount = 0;

      for (const t of tournaments) {
        const newPrize = t.prizeAmount || 0;
        if (t.prizeAmount !== newPrize) {
          t.prizeAmount = newPrize;
          await t.save();
          updatedCount++;
          console.log(`💰 Updated prize pool for ${t.id} to ${newPrize} RRP`);
        }
      }

      res.status(200).json({ message: `Updated ${updatedCount} tournaments.` });
    } catch (err) {
      console.error('❌ Prize recalculation error:', err.message);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // ✅ POST /api/sit-n-go/create-test — inject test tournament
  router.post('/create-test', async (req, res) => {
    try {
      const testTournament = new Tournament({
        id: `nhl95-auto-2-max-test-${Date.now()}`,
        name: 'NHL 95 Auto (2‑max)',
        type: 'sit-n-go',
        maxPlayers: 2,
        entryFee: 0,
        prizeType: 'fixed',
        prizeAmount: 0,
        elimination: 'single',
        goalieMode: 'auto',
        periodLength: 5,
        rom: 'NHL_95.bin',
        core: 'genesis_plus_gx',
        registeredPlayers: [],
        status: 'open',        // ✅ visible immediately
        startTime: null,
        game: 'NHL 95',
        rakePercent: 0.10
      });

      await testTournament.save();
      console.log(`🧪 Test tournament created: ${testTournament.id}`);
      res.status(201).json({ message: 'Test tournament created', tournament: testTournament });
    } catch (err) {
      console.error('❌ Test tournament creation error:', err.message);
      res.status(500).json({ error: 'Server error' });
    }
  });

   // ✅ POST /api/sit-n-go/match-result — record result + award RRP + Tokens
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