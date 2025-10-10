// retrorumble-backend/scheduler/tournaments.js
const Tournament = require("../models/Tournament");

// In-memory registry: tournamentId -> timeout
const timers = new Map();

// Utility: calculate delay until start
function msUntil(date) {
  const ts = typeof date === "string" ? new Date(date).getTime() : new Date(date).getTime();
  return Math.max(0, ts - Date.now());
}

// Utility: readable local time for logs
function asLocalString(date) {
  try {
    return new Date(date).toLocaleString(); // uses server local timezone
  } catch {
    return String(date);
  }
}

// Utility: build matchStart payload for frontend
function buildPayload(t) {
  return {
    rom: t.game === "NHL 95" ? "NHL_95.bin" : "NHL_94.bin",
    core: "genesis_plus_gx",
    goalieMode: t.goalieMode === "manual" ? "manual_goalie" : "auto_goalie",
    matchId: t._id.toString(),
  };
}

// Clear an existing timer for a tournament (protect against re-scheduling)
function clearTimer(tournamentId) {
  const prev = timers.get(tournamentId);
  if (prev) {
    clearTimeout(prev);
    timers.delete(tournamentId);
  }
}

// Schedule a single tournament start
function scheduleTournamentStart(t, io) {
  if (!t?.startTime) {
    console.warn(`⚠️ Tournament "${t?.name || t?._id}" has no startTime, skipping`);
    return;
  }

  // Avoid double scheduling
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
      // Re-fetch to ensure status hasn’t changed
      const fresh = await Tournament.findById(t._id);
      if (!fresh) {
        console.warn(`⚠️ Tournament ${t._id} not found at start time, aborting`);
        return;
      }
      if (fresh.status !== "scheduled") {
        console.warn(`⚠️ Tournament "${fresh.name}" status is "${fresh.status}", not "scheduled" — aborting start`);
        return;
      }

      // Flip to live, persist
      fresh.status = "live";
      await fresh.save();

      // Emit matchStart to room keyed by tournament ID
      io.to(fresh._id.toString()).emit("matchStart", payload);
      console.log(`🚨 Emitted matchStart for "${fresh.name}" (${fresh._id})`);

    } catch (err) {
      console.error(`⚠️ Failed to start tournament "${t.name}":`, err.message);
    } finally {
      // Clean registry
      clearTimer(t._id.toString());
    }
  }, delay);

  // Track timer
  timers.set(t._id.toString(), timeout);
}

// Schedule all tournaments on boot
async function scheduleAllTournaments(io) {
  try {
    const upcoming = await Tournament.find({ status: "scheduled" }).lean();
    console.log(`📋 Found ${upcoming.length} scheduled tournament(s)`);
    upcoming.forEach((t) => scheduleTournamentStart(t, io));
  } catch (err) {
    console.error("⚠️ Failed to fetch tournaments:", err.message);
  }
}

// Optional helper: reschedule one by ID (e.g., after an admin edits startTime)
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

module.exports = {
  scheduleAllTournaments,
  scheduleTournamentStart,
  rescheduleTournamentById,
};