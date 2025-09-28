const Tournament = require("../models/Tournament");

// Utility: calculate delay until start
function msUntil(date) {
  return Math.max(0, new Date(date).getTime() - Date.now());
}

// Utility: build matchStart payload
function buildPayload(t) {
  return {
    rom: t.game === "NHL 95" ? "NHL_95.bin" : "NHL_94.bin",
    core: "genesis_plus_gx",
    goalieMode: t.goalieMode === "manual" ? "manual_goalie" : "auto_goalie",
    matchId: t.id,
  };
}

// Schedule all tournaments on boot
async function scheduleAllTournaments(io) {
  const upcoming = await Tournament.find({ status: "scheduled" });
  upcoming.forEach((t) => scheduleTournamentStart(t, io));
}

// Schedule a single tournament
function scheduleTournamentStart(t, io) {
  const delay = msUntil(t.startTime);
  const payload = buildPayload(t);

  console.log(`⏰ Scheduling "${t.name}" for ${t.startTime} (delay ${delay}ms)`);

  setTimeout(async () => {
    const fresh = await Tournament.findOne({ id: t.id });
    if (!fresh || fresh.status !== "scheduled") return;

    fresh.status = "live";
    await fresh.save();

    io.to(t.id).emit("matchStart", payload);
    console.log(`🚨 Emitted matchStart for "${t.name}"`);
  }, delay);
}

module.exports = { scheduleAllTournaments, scheduleTournamentStart };