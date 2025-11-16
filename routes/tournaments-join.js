const express = require("express");
const router = express.Router();
const Tournament = require("../models/Tournament");
const MatchState = require("../models/MatchState");
const { generateBracket, createMatchState } = require("../utils/bracketManager");

const BRACKET_SIZE = 8;

module.exports = function (io) {
  router.post("/join/:id", async (req, res) => {
    try {
      const tournament = await Tournament.findOne({ id: req.params.id });
      if (!tournament) return res.status(404).json({ error: "Tournament not found" });

      const { playerId } = req.body;
      if (!playerId) return res.status(400).json({ error: "Missing playerId" });

      const alreadyJoined = tournament.registeredPlayers?.includes(playerId);
      if (alreadyJoined) {
        console.log(`⚠️ Player ${playerId} already registered for ${tournament.name}`);
        return res.status(200).json({ message: "Already registered" });
      }

      tournament.registeredPlayers.push(playerId);
      await tournament.save();

      console.log(`✅ Player ${playerId} registered for ${tournament.name}`);

      const unprocessed = [...tournament.registeredPlayers];
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
          const matchId = `${tournament.id}-bracket${bracketCount}-r${round}-m${index}`;

          const matchState = {
            matchId,
            tournamentId: tournament.id,
            players: pair,
            round,
            matchIndex: index,
            rom: tournament.rom || "NHL_95.bin",
            core: tournament.core || "genesis_plus_gx",
            goalieMode: tournament.goalieMode,
            periodLength: tournament.periodLength,
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
          io.to(tournament.id).emit("launchEmulator", { matchId, launchUrl });
          console.log(`📡 launchEmulator emitted to ${tournament.id}: ${launchUrl}`);

          pair.forEach(player => matched.add(player));
        }
      }

      const remaining = tournament.registeredPlayers.filter((p) => !matched.has(p));
      console.log(`⏳ Waiting pool: ${remaining.length} players`);

      res.status(200).json({ message: "Registered successfully" });
    } catch (err) {
      console.error("❌ Tournament register error:", err.message);
      res.status(500).json({ error: "Server error" });
    }
  });

  return router;
};