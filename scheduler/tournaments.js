const Tournament = require("../models/Tournament");
const { io } = require("../socket"); // adjust path to where you init Socket.IO

function msUntil(date) {
  return Math.max(0, new Date(date).getTime() - Date.now());
}

function buildPayload(t) {
  return {
    rom: t.game === "NHL 95" ? "NHL_95.bin" : "NHL_94.bin",
    core: "genesis_plus_gx",
    goalieMode: t.goalieMode === "manual" ? "manual_goalie" : "auto_goalie",
  };
}

async function scheduleAllTournaments() {
  const upcoming = await Tournament.find({ status: "scheduled" });
  upcoming.forEach(scheduleTournamentStart);
}

function scheduleTournamentStart(t) {
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