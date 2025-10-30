const Tournament = require("../models/Tournament");
const emitTournamentSchedule = require("./emitTournamentSchedule"); // ✅ NEW IMPORT

// In-memory registry: tournamentId -> timeout
const timers = new Map();

function msUntil(date) {
  const ts = typeof date === "string" ? new Date(date).getTime() : new Date(date).getTime();
  return Math.max(0, ts - Date.now());
}

function asLocalString(date) {
  try {
    return new Date(date).toLocaleString();
  } catch {
    return String(date);
  }
}

function buildPayload(t) {
  return {
    rom: t.game === "NHL 95" ? "NHL_95.bin" : "NHL_94.bin",
    core: "genesis_plus_gx",
    goalieMode: t.goalieMode === "manual" ? "manual_goalie" : "auto_goalie",
    matchId: t._id.toString(),
  };
}

function clearTimer(tournamentId) {
  const prev = timers.get(tournamentId);
  if (prev) {
    clearTimeout(prev);
    timers.delete(tournamentId);
  }
}

function scheduleTournamentStart(t, io) {
  if (!t?.startTime) {
    console.warn(`⚠️ Tournament "${t?.name || t?._id}" has no startTime, skipping`);
    return;
  }

  clearTimer(t._id.toString());

  const delay = msUntil(t.startTime);
  const payload = buildPayload(t);

  if (delay <= 0) {
    console.log(`⚠️ Tournament "${t.name}" startTime is in the past (${asLocalString(t.startTime)}), skipping`);
    return;
  }

  console.log(`⏰ Scheduling "${t.name}" for ${asLocalString(t.startTime)} (delay ${delay}ms)`);

  const timeout = setTimeout(async () => {
    try {
      const fresh = await Tournament.findById(t._id);
      if (!fresh) {
        console.warn(`⚠️ Tournament ${t._id} not found at start time, aborting`);
        return;
      }
      if (fresh.status !== "scheduled") {
        console.warn(`⚠️ Tournament "${fresh.name}" status is "${fresh.status}", not "scheduled" — aborting start`);
        return;
      }

      fresh.status = "live";
      await fresh.save();

      io.to(fresh._id.toString()).emit("matchStart", buildPayload(fresh));
      console.log(`🚨 Emitted matchStart for "${fresh.name}" (${fresh._id})`);

      await emitTournamentSchedule(io); // ✅ Refresh lobby after status change
    } catch (err) {
      console.error(`⚠️ Failed to start tournament "${t.name}":`, err.message);
    } finally {
      clearTimer(t._id.toString());
    }
  }, delay);

  timers.set(t._id.toString(), timeout);
}

async function scheduleAllTournaments(io) {
  try {
    const upcoming = await Tournament.find({ status: "scheduled", startTime: { $ne: null } }).lean();
    console.log(`📋 Found ${upcoming.length} scheduled tournament(s)`);
    upcoming.forEach((t) => scheduleTournamentStart(t, io));

    await emitTournamentSchedule(io); // ✅ Emit full daily schedule
  } catch (err) {
    console.error("⚠️ Failed to fetch tournaments:", err.message);
  }
}

async function rescheduleTournamentById(tournamentId, io) {
  try {
    const t = await Tournament.findById(tournamentId);
    if (!t) {
      console.warn(`⚠️ Tournament ${tournamentId} not found for reschedule`);
      return;
    }
    if (t.status !== "scheduled") {
      console.warn(`⚠️ Tournament ${tournamentId} has status "${t.status}", not rescheduling`);
      return;
    }
    scheduleTournamentStart(t, io);
  } catch (err) {
    console.error(`⚠️ Reschedule failed for ${tournamentId}:`, err.message);
  }
}

async function watchSitNGoTables(io) {
  console.log("👀 Watching Sit‑n‑Go tables…");

  setInterval(async () => {
    try {
      const sitngos = await Tournament.find({
        startTime: null,
        status: "scheduled",
        type: "sit-n-go",
      }).lean();

      const visible = sitngos.map((t) => ({
        id: t._id,
        name: t.name,
        buyIn: t.entryFee,
        players: t.registeredPlayers?.length || 0,
        prizePool: t.prizeAmount,
        game: t.game,
      }));

      if (visible.length === 0) {
        visible.push({
          id: "dummy",
          name: "Practice Table",
          buyIn: 0,
          players: 1,
          prizePool: 0,
          game: "NHL 95",
        });
      }

      io.emit("sitngoList", visible);

      for (const t of sitngos) {
        const registered = Array.isArray(t.registeredPlayers)
          ? t.registeredPlayers.length
          : 0;

        if (registered >= t.maxPlayers) {
          console.log(`🚨 Sit‑n‑Go "${t.name}" is full (${registered}/${t.maxPlayers})`);

          const updated = await Tournament.findById(t._id);
          if (!updated) continue;

          updated.status = "live";
          await updated.save();

          io.to(updated._id.toString()).emit("matchStart", buildPayload(updated));
          console.log(`🚀 Emitted matchStart for Sit‑n‑Go "${updated.name}" (${updated._id})`);

          const clone = new Tournament({
            id: `${updated.id}-clone-${Date.now()}`,
            name: updated.name,
            startTime: null,
            game: updated.game,
            goalieMode: updated.goalieMode,
            elimination: updated.elimination,
            maxPlayers: updated.maxPlayers,
            entryFee: updated.entryFee,
            prizeType: updated.prizeType,
            prizeAmount: 0,
            registeredPlayers: [],
            status: "scheduled",
            type: "sit-n-go",
          });

          await clone.save();
          console.log(`🔁 Respawned Sit‑n‑Go: ${clone.name} (${clone._id})`);
        }
      }
    } catch (err) {
      console.error("⚠️ Sit‑n‑Go watcher error:", err.message);
    }
  }, 3000);
}

module.exports = {
  scheduleAllTournaments,
  scheduleTournamentStart,
  rescheduleTournamentById,
  watchSitNGoTables,
};