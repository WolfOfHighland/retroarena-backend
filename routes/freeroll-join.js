const express = require("express");
const Tournament = require("../models/Tournament");

function buildMatchPayload(tournament) {
  const bootUrl = `https://www.retrorumblearena.com/Retroarch-Browser/index.html?core=${tournament.core || "genesis_plus_gx"}&rom=${tournament.rom || "NHL_95.bin"}`;

  return {
    matchId: tournament.id,
    tournamentId: tournament.id,
    rom: bootUrl,
    core: tournament.core || "genesis_plus_gx",
    players: tournament.registeredPlayers.map((p) =>
      typeof p === "string" ? { id: p, name: p } : { id: p.id, name: p.displayName || p.id }
    ),
  };
}

module.exports = function (io) {
  const router = express.Router();

  router.post("/freeroll/register/:id", async (req, res) => {
    const { playerId } = req.body;
    const { id } = req.params;

    if (!playerId || playerId.startsWith("guest")) {
      return res.status(403).json({ error: "Guests cannot register" });
    }

    try {
      const tournament = await Tournament.findOne({ id, entryFee: 0 });
      if (!tournament) return res.status(404).json({ error: "Freeroll not found" });

      const alreadyJoined = tournament.registeredPlayers.some((p) =>
        typeof p === "string" ? p === playerId : p.id === playerId
      );
      if (alreadyJoined) {
        return res.status(400).json({ error: "Already registered" });
      }

      tournament.registeredPlayers.push({ id: playerId, displayName: playerId });
      await tournament.save();

      const updated = await Tournament.findOne({ id, entryFee: 0 });
      const registeredCount = updated.registeredPlayers.length;

      console.log(`🧪 Player count after join: ${registeredCount}`);

      // ✅ Emit tournamentUpdate to all clients in this tournament room
      io.to(updated.id).emit("tournamentUpdate", {
        tournamentId: updated.id,
        registeredCount,
      });
      console.log(`📡 tournamentUpdate emitted for ${updated.id}: ${registeredCount}`);

      // ✅ If full, emit match boot
      if (registeredCount >= 2) {
        const payload = buildMatchPayload(updated);
        const launchUrl = `https://www.retrorumblearena.com/Retroarch-Browser/index.html?core=${payload.core}&rom=${payload.rom}&matchId=${payload.matchId}&goalieMode=auto`;

        io.to(updated.id).emit("launchEmulator", { matchId: payload.matchId, launchUrl });
        console.log(`📡 launchEmulator emitted to ${updated.id}: ${launchUrl}`);

        io.to(updated.id).emit("matchStart", payload);
        console.log(`📡 matchStart emitted to room ${updated.id}`);

        io.emit("sitngoUpdated");
        console.log(`🔔 sitngoUpdated emitted`);
      }

      res.status(200).json({ message: "Joined freeroll", tournament: updated });
    } catch (err) {
      console.error(`❌ Freeroll join error for ${id}:`, err.message);
      res.status(500).json({ error: "Server error" });
    }
  });

  return router;
};