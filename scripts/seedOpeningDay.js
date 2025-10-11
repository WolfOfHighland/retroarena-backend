// scripts/seedOpeningDay.js
require("dotenv").config();
const mongoose = require("mongoose");
const Tournament = require("../models/Tournament");

async function seed() {
  try {
    await mongoose.connect(process.env.MONGO_URI);

    const baseDate = new Date("2025-10-19T12:00:00-04:00"); // Noon EDT
    const tournaments = [];

    for (let i = 0; i < 8; i++) {
      const start = new Date(baseDate.getTime() + i * 60 * 60 * 1000);

      tournaments.push({
        id: `opening-day-${i + 1}`,
        name: `Opening Day ${i + 1}`,
        startTime: start,
        game: "NHL 95",
        goalieMode: "manual",
        periodLength: 5,
        status: "scheduled",
        registeredPlayers: [],
        entryFee: (i + 1) * 5, // $5, $10, … $40
      });
    }

    // Clear out any existing Opening Day tournaments before inserting
    await Tournament.deleteMany({ id: /opening-day-/ });

    await Tournament.insertMany(tournaments);
    console.log("✅ Seeded 8 Opening Day tournaments with entry fees");
  } catch (err) {
    console.error("❌ Seed failed:", err);
  } finally {
    await mongoose.disconnect();
  }
}

seed();