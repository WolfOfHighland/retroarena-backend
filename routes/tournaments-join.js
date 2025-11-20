const express = require("express");
const router = express.Router();
const Tournament = require("../models/Tournament");
const MatchState = require("../models/MatchState");
const { generateBracket } = require("../utils/bracketManager");

const BRACKET_SIZE = 8;

module.exports = function (io) {
  router.post("/join/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const { playerId } = req.body;

      if (!playerId) return res.status(400).json({ error: "Missing playerId" });

      const tournament = await Tournament.findOne({ id });
      if (!tournament) return res.status(404).json({ error: "Tournament not found" });

      tournament.registeredPlayers = Array.isArray(tournament.registeredPlayers)
        ? tournament.registeredPlayers.map(p => (typeof p === "string" ? { id: p } : p))
        : [];

      const alreadyJoined = tournament.registeredPlayers.some(p => p.id === playerId);
      if (alreadyJoined) {
        console.log(`⚠️ Player ${playerId} already registered for ${tournament.name}`);
        return res.status(200).json({ message: "Already registered" });
      }

      tournament.registeredPlayers.push({ id: playerId });
      await tournament.save();
      console.log(`✅ Player ${playerId} registered for ${tournament.name}`);

      const updated = await Tournament.findOne({ id });
      const registeredCount = updated.registeredPlayers.length;

      // ✅ Emit tournamentUpdate to sync all clients
      io.to(updated.id).emit("tournamentUpdate", {
        tournamentId: updated.id,
        registeredCount,
      });
      console.log(`📡 tournamentUpdate emitted for ${updated.id}: ${registeredCount}`);

      const unprocessed = updated.registeredPlayers.map(p => p.id);
      const matched = new Set();
      let bracketCount = 0;
      const round = 1;

      while (unprocessed.length >= BRACKET_SIZE) {
        const bracketPlayers = unprocessed.splice(0, BRACKET_SIZE);
        bracketCount++;

        console.log(`🎯 Creating bracket ${bracketCount} with players:`, bracketPlayers);
        const matches = generateBracket(bracketPlayers);

        for (let index = 0; index < matches.length; index++) {
          const pair = matches[index];
          const matchId = `${updated.id}-bracket${bracketCount}-r${round}-m${index}`;

          const matchState = {
            matchId,
            tournamentId: updated.id,
            players: pair,
            round,
            matchIndex: index,
            rom: updated.rom || "NHL_95.bin",
            core: updated.core || "genesis_plus_gx",
            goalieMode: updated.goalieMode,
            periodLength: updated.periodLength,
          };

          const matchDoc = new MatchState(matchState);
          await matchDoc.save();
          console.log(`💾 Saved matchState for ${matchId}`);

          const params = new URLSearchParams({
            core: matchState.core,
            rom: matchState.rom,
            matchId: matchState.matchId,
            goalieMode: matchState.goalieMode || "auto",
          });

          const launchUrl = `https://www.retrorumblearena.com/Retroarch-Browser/index.html?${params.toString()}`;

          io.to(updated.id).emit("launchEmulator", { matchId, launchUrl });
          console.log(`📡 launchEmulator emitted to ${updated.id}: ${launchUrl}`);

          io.to(updated.id).emit("matchStart", matchState);
          console.log(`📡 matchStart emitted to room ${updated.id}:`, matchState);

          pair.forEach(player => matched.add(player));
        }

        io.emit("sitngoUpdated");
        console.log(`🔔 sitngoUpdated emitted`);
      }

      const remaining = updated.registeredPlayers.filter(p => !matched.has(p.id));
      console.log(`⏳ Waiting pool: ${remaining.length} players`);

      res.status(200).json({ message: "Registered successfully" });
    } catch (err) {
      console.error("❌ Tournament register error:", err.message);
      res.status(500).json({ error: "Server error" });
    }
  });

  return router;
};