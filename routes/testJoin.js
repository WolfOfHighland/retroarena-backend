const express = require("express");
const router = express.Router();
const Tournament = require("../models/Tournament");

module.exports = function (io) {
  router.post("/testjoin/:id", async (req, res) => {
    const { id } = req.params;
    const { playerId } = req.body;

    if (!playerId) return res.status(400).json({ error: "Missing playerId" });

    const tournament = await Tournament.findOne({ id });
    if (!tournament) return res.status(404).json({ error: "Tournament not found" });

    tournament.registeredPlayers.push({ id: playerId });
    await tournament.save();

    const registeredCount = tournament.registeredPlayers.length;
    const maxPlayers = tournament.maxPlayers || 2;

    let matchId = null;
    if (registeredCount >= maxPlayers) {
      matchId = `${id}-${Date.now()}`;
      io.to(id).emit("launchEmulator", {
        matchId,
        launchUrl: `https://www.retrorumblearena.com/Retroarch-Browser/index.html?core=genesis_plus_gx&rom=NHL_95.bin&matchId=${matchId}&goalieMode=auto`
      });
    }

    res.json({ matchId, playersJoined: registeredCount, maxPlayers });
  });

  return router;
};