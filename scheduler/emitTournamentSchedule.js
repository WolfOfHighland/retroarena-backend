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

  try {
    // ✅ Pull all tournaments, not just today's
    const tournaments = await Tournament.find({}).lean();

    const visible = tournaments.map((t) => {
      const start = t.startTime ? new Date(t.startTime).getTime() : Infinity;
      return {
        id: t._id,
        tournamentId: t.id,
        name: t.name,
        type: t.type, // scheduled | sit-n-go | freeroll
        startTime: t.type === "scheduled" ? t.startTime : null,
        localTime:
          t.type === "scheduled" && t.startTime ? formatTimeEDT(t.startTime) : "—",
        game: t.game,
        prizePool: t.prizeAmount,
        status: t.status || "waiting",
        buyIn: t.entryFee || 0,
        players: Array.isArray(t.registeredPlayers)
          ? t.registeredPlayers.length
          : 0,
        elimination: t.elimination,
        isLive: t.status === "live",
        hasStarted:
          t.type === "scheduled"
            ? start <= Date.now()
            : t.registeredPlayers.length >= (t.maxPlayers || 0),
        romUrl:
          t.romUrl ||
          "https://www.retrorumblearena.com/roms/NHL_95.bin",
        // ✅ Emit lobby objects, not bare arrays
        lobbies: (t.lobbies || [[], [], []]).map((lobby, idx) => ({
          id: `${t.id}-lobby${idx + 1}`,
          name: `Lobby ${idx + 1}`,
          players: lobby,
          status: lobby.length > 0 ? "active" : "waiting",
        })),
        registeredPlayers: t.registeredPlayers || [],
      };
    });

    if (visible.length === 0) {
      visible.push({
        id: "dummy",
        tournamentId: "placeholder",
        name: "No tournaments available",
        type: "placeholder",
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
        lobbies: [
          { id: "dummy-lobby1", name: "Lobby 1", players: [], status: "waiting" },
          { id: "dummy-lobby2", name: "Lobby 2", players: [], status: "waiting" },
          { id: "dummy-lobby3", name: "Lobby 3", players: [], status: "waiting" },
        ],
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
            lobbies: (t.lobbies || [[], [], []]).map((lobby, idx) => ({
              id: `${t.id}-lobby${idx + 1}`,
              name: `Lobby ${idx + 1}`,
              players: lobby,
              status: lobby.length > 0 ? "active" : "waiting",
            })),
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