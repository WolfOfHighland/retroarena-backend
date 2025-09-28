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
    matchId: t._id.toString(), // always safe, guaranteed by Mongoose
  };
}

// Schedule all tournaments on boot
async function scheduleAllTournaments(io) {
  try {
    const upcoming = await Tournament.find({ status: "scheduled" });
    upcoming.forEach((t) => scheduleTournamentStart(t, io));
  } catch (err) {
    console.error("⚠️ Failed to fetch tournaments:", err.message);
  }
}

// Schedule a single tournament
function scheduleTournamentStart(t, io) {
  const delay = msUntil(t.startTime);
  const payload = buildPayload(t);

  if (delay <= 0) {
    console.log(`⚠️ Tournament "${t.name}" has a past startTime, skipping`);
    return;
  }

  console.log(`⏰ Scheduling "${t.name}" for ${t.startTime} (delay ${delay}ms)`);

  setTimeout(async () => {
    try {
      const fresh = await Tournament.findById(t._id);
      if (!fresh || fresh.status !== "scheduled") return;

      fresh.status = "live";
      await fresh.save();

      io.to(t._id.toString()).emit("matchStart", payload);
      console.log(`🚨 Emitted matchStart for "${t.name}"`);
    } catch (err) {
      console.error(`⚠️ Failed to start tournament "${t.name}":`, err.message);
    }
  }, delay);
}

module.exports = { scheduleAllTournaments, scheduleTournamentStart };