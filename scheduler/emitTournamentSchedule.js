const Tournament = require("../models/Tournament");

function formatTimeEDT(date) {
  try {
    return new Date(date).toLocaleString("en-US", {
      timeZone: "America/New_York",
      weekday: "short",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      month: "short",
      day: "numeric",
    });
  } catch {
    return String(date);
  }
}

async function emitTournamentSchedule(io) {
  console.log(`📡 emitTournamentSchedule triggered`); // ✅ LOG ADDED

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);

  try {
    const today = await Tournament.find({
      startTime: { $gte: startOfDay, $lte: endOfDay },
    }).lean();

    const visible = today.map((t) => ({
      id: t._id,
      name: t.name,
      startTime: t.startTime,
      localTime: formatTimeEDT(t.startTime),
      game: t.game,
      prizePool: t.prizeAmount,
      status: t.status,
      buyIn: t.entryFee || 0,
      players: t.registeredPlayers?.length || 0,
      elimination: t.elimination,
    }));

    if (visible.length === 0) {
      visible.push({
        id: "dummy",
        name: "No tournaments today",
        startTime: null,
        localTime: "—",
        game: "TBD",
        prizePool: 0,
        status: "placeholder",
        buyIn: 0,
        players: 0,
        elimination: "Single Elim",
      });
    }

    io.emit("tournamentSchedule", visible);
    console.log(`📡 Emitted ${visible.length} tournament(s) to lobby`);
  } catch (err) {
    console.error("⚠️ Failed to emit tournament schedule:", err.message);
  }
}

module.exports = emitTournamentSchedule;