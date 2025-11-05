require("dotenv").config();
const mongoose = require("mongoose");
const Tournament = require("../models/Tournament");

async function seedOpeningDay() {
  try {
    await mongoose.connect(process.env.MONGO_URI);

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
        entryFee: (i + 1) * 5,
        registeredPlayers: [],
        prizeType: "dynamic",
        prizeAmount: 0,
      };

      // ❌ Don't include maxPlayers at all if uncapped
      // If you ever want to cap it, set tournament.maxPlayers = X here

      tournaments.push(tournament);
    }

    await Tournament.deleteMany({ id: /opening-day-/ });
    await Tournament.insertMany(tournaments);
    console.log("✅ Seeded 8 Opening Day tournaments (last one double elimination)");
  } catch (err) {
    console.error("❌ Seed failed:", err);
  } finally {
    mongoose.disconnect();
  }
}

seedOpeningDay();