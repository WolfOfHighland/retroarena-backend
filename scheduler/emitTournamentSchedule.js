const Tournament = require("../models/Tournament");
const { loadMatchState } = require("../utils/matchState");

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
  console.log("📡 emitTournamentSchedule triggered");

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);

  const now = Date.now();

  try {
    const today = await Tournament.find({
      startTime: { $gte: startOfDay, $lte: endOfDay },
    }).lean();

    const visible = today.map((t) => {
      const start = t.startTime ? new Date(t.startTime).getTime() : Infinity;
      return {
        id: t._id,
        tournamentId: t.id,
        name: t.name,
        startTime: t.startTime,
        localTime: t.startTime ? formatTimeEDT(t.startTime) : "—",
        game: t.game,
        prizePool: t.prizeAmount,
        status: t.status,
        buyIn: t.entryFee || 0,
        players: Array.isArray(t.registeredPlayers) ? t.registeredPlayers.length : 0,
        elimination: t.elimination,
        isLive: t.status === "live",
        hasStarted: start <= now,
        romUrl: t.romUrl || "https://www.retrorumblearena.com/roms/NHL_95.bin",
        // ✅ Always include 3 lobbies (fallback ensures visibility)
        lobbies: Array.isArray(t.lobbies) && t.lobbies.length === 3 ? t.lobbies : [[], [], []],
        registeredPlayers: t.registeredPlayers || [],
      };
    });

    if (visible.length === 0) {
      visible.push({
        id: "dummy",
        tournamentId: "placeholder",
        name: "No tournaments today",
        startTime: null,
        localTime: "—",
        game: "TBD",
        prizePool: 0,
        status: "placeholder",
        buyIn: 0,
        players: 0,
        elimination: "Single Elim",
        isLive: false,
        hasStarted: false,
        romUrl: null,
        lobbies: [[], [], []],
        registeredPlayers: [],
      });
    }

    io.emit("tournamentSchedule", visible);
    console.log(`📡 Emitted ${visible.length} tournament(s) to lobby`);
  } catch (err) {
    console.error("⚠️ Failed to emit tournament schedule:", err.message);
  }
}

function watchSitNGoTables(io) {
  console.log("👀 watchSitNGoTables activated");

  const pollInterval = 30000;

  setInterval(async () => {
    try {
      const sitNGo = await Tournament.find({
        type: "sit-n-go",
        status: "live",
      }).lean();

      const updates = await Promise.all(
        sitNGo.map(async (t) => {
          const state = await loadMatchState(t.id);
          return {
            tournamentId: t.id,
            name: t.name,
            players: t.registeredPlayers || [],
            lobbies: Array.isArray(t.lobbies) && t.lobbies.length === 3 ? t.lobbies : [[], [], []],
            matchState: state || null,
          };
        })
      );

      io.emit("sitNGoUpdate", updates);
      console.log(`📡 Emitted ${updates.length} Sit-n-Go updates`);
    } catch (err) {
      console.error("⚠️ Sit-n-Go polling failed:", err.message);
    }
  }, pollInterval);
}

module.exports = {
  emitTournamentSchedule,
  watchSitNGoTables,
};