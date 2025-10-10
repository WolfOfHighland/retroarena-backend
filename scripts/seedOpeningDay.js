// scripts/seedOpeningDay.js
require("dotenv").config();
const mongoose = require("mongoose");
const Tournament = require("../models/Tournament");

async function seed() {
  await mongoose.connect(process.env.MONGO_URI);

  const baseDate = new Date("2025-10-19T12:00:00-04:00"); // Noon EDT
  const tournaments = [];

  for (let i = 0; i < 8; i++) {
    const start = new Date(baseDate.getTime() + i * 60 * 60 * 1000);

    tournaments.push({
      id: `opening-day-${i + 1}`,       // 👈 required by your schema
      name: `Opening Day ${i + 1}`,
      startTime: start,
      game: "NHL 95",
      goalieMode: "manual",
      periodLength: 5,
      status: "scheduled",
      registeredPlayers: [],
    });
  }

  await Tournament.insertMany(tournaments);
  console.log("✅ Seeded 8 Opening Day tournaments");
  process.exit(0);
}

seed().catch(err => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});