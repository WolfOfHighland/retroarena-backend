const express = require('express');
const Tournament = require('../models/Tournament');
const MatchState = require('../models/MatchState');
const {
  generateBracket,
  createMatchState,
  advanceWinners,
} = require('../utils/bracketManager');

module.exports = function (io) {
  const router = express.Router();

  router.post('/join/:id', async (req, res) => {
	console.log('Entered /join/:id route'); // Confirm route is
    try {
      const { id } = req.params;
      const { playerId } = req.body;

      console.log(`🧪 Join request for ${id} from ${playerId}`);

      if (!playerId) return res.status(400).json({ error: 'Missing playerId' });

      const tournament = await Tournament.findOne({ id });
      if (!tournament) return res.status(404).json({ error: 'Tournament not found' });

      // 🧼 Normalize legacy entries
      tournament.registeredPlayers = Array.isArray(tournament.registeredPlayers)
        ? tournament.registeredPlayers.map(p => (typeof p === 'string' ? { id: p } : p))
        : [];

      // 🚫 Enforce maxPlayers
      if (tournament.registeredPlayers.length >= tournament.maxPlayers) {
        console.log(`🚫 Tournament ${tournament.id} is full`);
        return res.status(403).json({ error: 'Tournament is full' });
      }

      // ✅ Check for existing player
      const alreadyJoined = tournament.registeredPlayers.some(p => p.id === playerId);
      if (alreadyJoined) {
        console.log(`⚠️ Player ${playerId} already joined ${tournament.name}`);
        return res.status(200).json({ message: 'Already joined' });
      }

      // ✅ Push and persist
      tournament.registeredPlayers.push({ id: playerId });
      await tournament.save();
      console.log(`✅ Saved ${playerId} to tournament ${tournament.id}`);

      // 🔥 Emit matches if full
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
            matchIndex: index,
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

          console.log(`🧪 Saving matchDoc:`, matchDoc);
          await matchDoc.save();
          console.log(`💾 Saved matchState for ${matchId}`);

          pair.forEach(player => {
            io.to(player).emit('matchStart', matchState);
          });
        }

        // 🧬 Auto-clone tournament
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
      console.error('❌ Join error:', err.stack || err);
      res.status(500).json({ error: 'Server error' });
    }
  });

  return router;
};