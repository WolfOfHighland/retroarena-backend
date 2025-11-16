const express = require("express");
const router = express.Router();
const Tournament = require("../models/Tournament");
const MatchState = require("../models/MatchState");
const { generateBracket, createMatchState } = require("../utils/bracketManager");


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

      const alreadyJoined = tournament.registeredPlayers.some(p => p.id === playerId);
      if (alreadyJoined) {
        console.log(`⚠️ Player ${playerId} already joined ${tournament.name}`);
        return res.status(200).json({ message: 'Already joined' });
      }

      if (tournament.registeredPlayers.length >= tournament.maxPlayers) {
        console.log(`🚫 Tournament ${tournament.id} is full`);
        return res.status(403).json({ error: 'Tournament is full' });
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

      // 🔁 Re-fetch to ensure fresh player count
      const updated = await Tournament.findOne({ id });
      if (updated.registeredPlayers.length === updated.maxPlayers) {
        const round = 1;
        const bracket = generateBracket(updated.registeredPlayers.map(p => p.id));
        const bootUrlBase = `https://www.retrorumblearena.com/Retroarch-Browser/index.html`;

        for (let index = 0; index < bracket.length; index++) {
          const pair = bracket[index];
          const matchId = `${updated.id}-r${round}-m${index}`;

          const matchState = {
            matchId,
            tournamentId: updated.id,
            players: pair,
            round,
            matchIndex: index,
            rom: updated.rom || "NHL_95.bin",
            core: updated.core || "genesis_plus_gx",
            goalieMode: updated.goalieMode,
            periodLength: updated.periodLength
          };

          const matchDoc = new MatchState(matchState);
          console.log(`🧪 Saving matchDoc:`, matchDoc);
          await matchDoc.save();
          console.log(`💾 Saved matchState for ${matchId}`);

          const params = new URLSearchParams({
            core: matchState.core,
            rom: matchState.rom,
            matchId: matchState.matchId,
            goalieMode: matchState.goalieMode || "auto"
          });

          const launchUrl = `${bootUrlBase}?${params.toString()}`;
          io.to(updated.id).emit("launchEmulator", { matchId, launchUrl });
          console.log(`📡 launchEmulator emitted to ${updated.id}: ${launchUrl}`);
        }

        const rakePercent = updated.rakePercent ?? 0.10;
        const netEntry = updated.entryFee * (1 - rakePercent);
        updated.prizeAmount = netEntry * updated.maxPlayers;
        await updated.save();
        console.log(`💰 Prize pool updated to $${updated.prizeAmount}`);

        const newTournament = new Tournament({
          id: `${updated.id}-clone-${Date.now()}`,
          name: updated.name,
          game: updated.game,
          goalieMode: updated.goalieMode,
          periodLength: updated.periodLength,
          status: 'scheduled',
          type: updated.type,
          registeredPlayers: [],
          entryFee: updated.entryFee,
          maxPlayers: updated.maxPlayers,
          prizeType: updated.prizeType,
          prizeAmount: 0,
          elimination: updated.elimination,
          rom: updated.rom,
          core: updated.core,
          rakePercent: updated.rakePercent
        });

        await newTournament.save();
        console.log(`🧬 Auto-cloned new tournament: ${newTournament.id}`);
        io.emit('tournamentCreated', newTournament);

        // 🔔 Notify frontend to refresh Sit-n-Go lobby
        io.emit("sitngoUpdated");
        console.log(`🔔 sitngoUpdated emitted`);
      }

      res.status(200).json({ message: 'Joined successfully' });
    } catch (err) {
      console.error('❌ Join error:', err.stack || err);
      res.status(500).json({ error: 'Server error' });
    }
  });

  return router;
};