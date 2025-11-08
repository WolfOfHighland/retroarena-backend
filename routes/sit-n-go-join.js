const express = require('express');
const Tournament = require('../models/Tournament');
const MatchState = require('../models/MatchState');
const User = require('../models/User');
const {
  generateBracket,
  createMatchState,
  advanceWinners,
} = require('../utils/bracketManager');

module.exports = function (io) {
  const router = express.Router();

  router.post('/join/:id', async (req, res) => {
    console.log('Entered /join/:id route');
    try {
      const { id } = req.params;
      const { playerId, displayName = 'Guest' } = req.body;

      console.log(`🧪 Join request for ${id} from ${playerId}`);
      if (!playerId) return res.status(400).json({ error: 'Missing playerId' });

      const tournament = await Tournament.findOne({ id });
      if (!tournament) return res.status(404).json({ error: 'Tournament not found' });

      const user = await User.findOne({ username: playerId });
      if (!user) return res.status(404).json({ error: 'User not found' });

      if (user.wallet < tournament.entryFee) {
        console.warn(`[Join Blocked] ${playerId} has $${user.wallet}, needs $${tournament.entryFee}`);
        return res.status(403).json({ error: 'Insufficient wallet balance' });
      }

      tournament.registeredPlayers = Array.isArray(tournament.registeredPlayers)
        ? tournament.registeredPlayers.map(p => (typeof p === 'string' ? { id: p } : p))
        : [];

      if (tournament.registeredPlayers.length >= tournament.maxPlayers) {
        console.log(`🚫 Tournament ${tournament.id} is full`);
        return res.status(403).json({ error: 'Tournament is full' });
      }

      const alreadyJoined = tournament.registeredPlayers.some(p => p.id === playerId);
      if (alreadyJoined) {
        console.log(`⚠️ Player ${playerId} already joined ${tournament.name}`);
        return res.status(200).json({ message: 'Already joined' });
      }

      user.wallet -= tournament.entryFee;
      await user.save();
      console.log(`💸 Deducted $${tournament.entryFee} from ${playerId}`);

      tournament.registeredPlayers.push({
        id: playerId,
        displayName,
        isGuest: true,
        joinedAt: new Date()
      });

      await tournament.save();
      console.log(`✅ Saved ${playerId} to tournament ${tournament.id}`);

      if (tournament.registeredPlayers.length === tournament.maxPlayers) {
        const round = 1;
        const bracket = generateBracket(tournament.registeredPlayers.map(p => p.id));

        const bootUrl = `https://www.retrorumblearena.com/Retroarch-Browser/index.html?core=${tournament.core || "genesis_plus_gx"}&rom=${tournament.rom || "NHL_95.bin"}`;

        for (let index = 0; index < bracket.length; index++) {
          const pair = bracket[index];
          const matchId = `${tournament.id}-r${round}-m${index}`;

          const matchState = {
            matchId,
            tournamentId: tournament.id,
            players: pair,
            round,
            matchIndex: index,
            rom: bootUrl,
            core: tournament.core || "genesis_plus_gx",
            goalieMode: tournament.goalieMode,
            periodLength: tournament.periodLength
          };

          const matchDoc = new MatchState(matchState);
          console.log(`🧪 Saving matchDoc:`, matchDoc);
          await matchDoc.save();
          console.log(`💾 Saved matchState for ${matchId}`);

          pair.forEach(player => {
            io.to(player).emit('matchStart', matchState);
            console.log(`🎮 matchStart emitted to ${player}`);
          });
        }

        const rakePercent = tournament.rakePercent ?? 0.10;
        const netEntry = tournament.entryFee * (1 - rakePercent);
        tournament.prizeAmount = netEntry * tournament.maxPlayers;
        await tournament.save();
        console.log(`💰 Prize pool updated to $${tournament.prizeAmount}`);

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