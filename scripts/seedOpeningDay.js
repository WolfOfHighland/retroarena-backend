require("dotenv").config();
const mongoose = require("mongoose");
const Tournament = require("../models/Tournament");

async function seedOpeningDay() {
  try {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGO_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
      });
    }

    // ✅ Push start times 1 hour into the future
    const baseDate = new Date(Date.now() + 60 * 60 * 1000);
    baseDate.setMinutes(0, 0, 0);

    const tournaments = [];

    for (let i = 0; i < 8; i++) {
      const start = new Date(baseDate.getTime() + i * 60 * 60 * 1000);

      const tournament = {
        id: `opening-day-${i + 1}`,
        name: `Opening Day ${i + 1}`,
        startTime: start,
        game: "NHL 95",
        goalieMode: "manual",
        periodLength: 5,
        status: "scheduled",
        type: "scheduled",
        elimination: i === 7 ? "double" : "single",

        // ✅ No entry fees in skill‑based model
        entryFee: 0,

        registeredPlayers: [],

        // ✅ Persistent lobbies
        lobbies: [[], [], []],

        // ✅ Fixed RRP prize model
        prizeType: "fixed",

        // ✅ RRP scaling (same pattern as freerolls/sit‑n‑gos)
        // Example: 900, 1800, 2700, ... 7200
        prizeAmount: (i + 1) * 900,

        // ✅ Consistency with ROM/core
        rom: "NHL_95.bin",
        core: "genesis_plus_gx",
      };

      tournaments.push(tournament);
    }

    await Tournament.deleteMany({ id: /opening-day-/ });
    await Tournament.insertMany(tournaments);
    console.log("✅ Seeded 8 Opening Day tournaments (RRP version with lobbies)");
  } catch (err) {
    console.error("❌ Seed failed:", err);
  } finally {
    if (require.main === module) {
      mongoose.disconnect();
    }
  }
}

// ✅ Export for server.js
module.exports = seedOpeningDay;

// ✅ Run directly if invoked via CLI
if (require.main === module) {
  seedOpeningDay().then(() => process.exit(0));
}