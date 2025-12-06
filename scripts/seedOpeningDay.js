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

    // ✅ Start times 1 hour in the future, hourly slots
    const baseDate = new Date(Date.now() + 60 * 60 * 1000);
    baseDate.setMinutes(0, 0, 0);

    const payloads = [];
    for (let i = 0; i < 8; i++) {
      const start = new Date(baseDate.getTime() + i * 60 * 60 * 1000);
      payloads.push({
        id: `opening-day-${i + 1}`,
        name: `Opening Day ${i + 1}`,
        startTime: start,
        game: "NHL 95",
        goalieMode: "manual",
        periodLength: 5,
        status: "scheduled",
        type: "scheduled",
        elimination: i === 7 ? "double" : "single",
        entryFee: 0,
        registeredPlayers: [],
        prizeType: "fixed",
        prizeAmount: (i + 1) * 900,
        rom: "NHL_95.bin",
        core: "genesis_plus_gx",
      });
    }

    // Upsert all with lobbies only on insert
    const ops = payloads.map((t) => ({
      updateOne: {
        filter: { id: t.id },
        update: {
          $set: t,
          $setOnInsert: { lobbies: [[], [], []] }
        },
        upsert: true,
      }
    }));

    await Tournament.bulkWrite(ops, { ordered: false });
    console.log("✅ Seeded/Updated 8 Opening Day tournaments with persistent lobbies");
  } catch (err) {
    console.error("❌ Seed failed:", err);
  } finally {
    if (require.main === module) {
      mongoose.disconnect();
    }
  }
}

module.exports = seedOpeningDay;

if (require.main === module) {
  seedOpeningDay().then(() => process.exit(0));
}