const express = require('express');
const Tournament = require('../models/Tournament');
const MatchState = require('../models/MatchState');
const User = require('../models/User');
const {
  generateBracket,
  createMatchState,
  advanceWinners,
  BracketManager
} = require('../utils/bracketManager');

module.exports = function (io) {
  const router = express.Router();

  // ✅ GET /freeroll — fetch scheduled freeroll tournaments
  router.get('/', async (req, res) => {
  try {
    const all = await Tournament.find({ type: 'freeroll' });
    console.log(`📦 Found ${all.length} freeroll tournaments total`);

    const filtered = all.filter(t => 
      t.entryFee === 0 &&
      t.status === 'scheduled'
    );
    console.log(`🎯 Returning ${filtered.length} scheduled freerolls`);

    res.status(200).json(filtered);
  } catch (err) {
    console.error('❌ Failed to fetch freerolls:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

  // ✅ POST /freeroll/register/:id — join a freeroll and spawn matches
  router.post('/register/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { playerId, displayName = 'Guest' } = req.body;

      if (!playerId || playerId.startsWith('guest')) {
        return res.status(403).json({ error: 'Guests cannot register' });
      }

      const tournament = await Tournament.findOne({ id, entryFee: 0 });
      if (!tournament) return res.status(404).json({ error: 'Freeroll not found' });

      tournament.registeredPlayers = Array.isArray(tournament.registeredPlayers)
        ? tournament.registeredPlayers.map(p => (typeof p === 'string' ? { id: p } : p))
        : [];

      if (tournament.registeredPlayers.length >= tournament.maxPlayers) {
        return res.status(403).json({ error: 'Tournament is full' });
      }

      const alreadyJoined = tournament.registeredPlayers.some(p => p.id === playerId);
      if (alreadyJoined) {
        return res.status(200).json({ message: 'Already joined' });
      }

      tournament.registeredPlayers.push({
        id: playerId,
        displayName,
        isGuest: true,
        joinedAt: new Date()
      });

      await tournament.save();
      console.log(`✅ ${playerId} joined freeroll ${tournament.id}`);

      // Spawn matches if full
      if (tournament.registeredPlayers.length === tournament.maxPlayers) {
        const round = 1;
        const bracket = generateBracket(tournament.registeredPlayers.map(p => p.id));

        for (let index = 0; index < bracket.length; index++) {
          const pair = bracket[index];
          const matchId = `${tournament.id}-r${round}-m${index}`;
          const matchState = createMatchState(matchId, pair, {
            rom: tournament.rom,
            core: tournament.core,
            goalieMode: tournament.goalieMode,
            periodLength: tournament.periodLength,
            round,
            matchIndex: index
          });

          const matchDoc = new MatchState({
            matchId,
            tournamentId: tournament.id,
            players: pair,
            round,
            matchIndex: index,
            rom: tournament.rom,
            core: tournament.core,
            goalieMode: tournament.goalieMode,
            periodLength: tournament.periodLength
          });

          await matchDoc.save();
          pair.forEach(player => {
            io.to(player).emit('matchStart', matchState);
          });
        }

        // Calculate prize pool
        const rakePercent = tournament.rakePercent ?? 0.10;
        const netEntry = tournament.entryFee * (1 - rakePercent);
        tournament.prizeAmount = netEntry * tournament.maxPlayers;
        tournament.status = 'live';
        await tournament.save();

        // Auto-clone
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
          rakePercent: tournament.rakePercent
        });

        await newTournament.save();
        io.emit('tournamentCreated', newTournament);
      }

      res.status(200).json({ message: 'Joined successfully' });
    } catch (err) {
      console.error('❌ Freeroll join error:', err.stack || err);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // ✅ POST /freeroll/emit-match — manually emit matchStart
  router.post('/emit-match', async (req, res) => {
    const { tournamentId } = req.body;

    try {
      const tournament = await Tournament.findOne({ id: tournamentId, entryFee: 0 });
      if (!tournament) return res.status(404).json({ error: 'Tournament not found' });

      if (!Array.isArray(tournament.registeredPlayers) || tournament.registeredPlayers.length < 2) {
        return res.status(400).json({ error: 'Tournament not full' });
      }

      const round = 1;
      const bracket = generateBracket(tournament.registeredPlayers.map(p => p.id));

      for (let index = 0; index < bracket.length; index++) {
        const pair = bracket[index];
        const matchId = `${tournament.id}-r${round}-m${index}`;
        const matchState = createMatchState(matchId, pair, {
          rom: tournament.rom,
          core: tournament.core,
          goalieMode: tournament.goalieMode,
          periodLength: tournament.periodLength,
          round,
          matchIndex: index
        });

        pair.forEach(player => {
          io.to(player).emit('matchStart', matchState);
          console.log(`🎮 matchStart manually emitted to ${player}`);
        });
      }

      res.status(200).json({ message: 'matchStart emitted', tournamentId });
    } catch (err) {
      console.error(`❌ Manual emit error for ${tournamentId}:`, err.message);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // ✅ POST /freeroll/match-result — record result and advance bracket
  router.post('/match-result', async (req, res) => {
    const { matchId, winnerId, tournamentId } = req.body;

    try {
      const tournament = await Tournament.findOne({ id: tournamentId });
      if (!tournament) return res.status(404).json({ error: 'Tournament not found' });

      const manager = new BracketManager(io, tournament);
      await manager.recordResult(matchId, winnerId);

      res.status(200).json({ message: 'Match result recorded', winnerId });
    } catch (err) {
      console.error(`❌ Error recording result for ${matchId}:`, err.message);
      res.status(500).json({ error: 'Failed to record match result' });
    }
  });

  // ✅ GET /freeroll/match/:matchId — fetch matchState by matchId for manual boot
  router.get('/match/:matchId', async (req, res) => {
    const { matchId } = req.params;

    try {
      const match = await MatchState.findOne({ matchId });
      if (!match) return res.status(404).json({ error: 'Match not found' });

      res.status(200).json(match);
    } catch (err) {
      console.error(`❌ Failed to fetch match ${matchId}:`, err.message);
      res.status(500).json({ error: 'Server error' });
    }
  });

  return router;
};