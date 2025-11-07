require("dotenv").config(); // ✅ Load .env variables
const mongoose = require("mongoose");
const Tournament = require("../models/Tournament");

mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const freerollTemplates = [
  {
    id: `freeroll-auto-2-${Date.now()}`,
    name: "NHL 95 Auto (2‑max)",
    startTime: null,
    game: "NHL 95",
    goalieMode: "auto",
    elimination: "single",
    maxPlayers: 2,
    entryFee: 0,
    prizeType: "dynamic",
    prizeAmount: 900,
    registeredPlayers: [],
    rom: "NHL_95.bin",
    core: "genesis_plus_gx",
    type: "sit-n-go",
    status: "scheduled",
    periodLength: 5,
    rakePercent: 0.10,
  },
  {
    id: `freeroll-manual-4-${Date.now()}`,
    name: "NHL 95 Manual (4‑max)",
    startTime: null,
    game: "NHL 95",
    goalieMode: "manual",
    elimination: "single",
    maxPlayers: 4,
    entryFee: 0,
    prizeType: "dynamic",
    prizeAmount: 3600,
    registeredPlayers: [],
    rom: "NHL_95.bin",
    core: "genesis_plus_gx",
    type: "sit-n-go",
    status: "scheduled",
    periodLength: 5,
    rakePercent: 0.10,
  },
  {
    id: `freeroll-manual-10-${Date.now()}`,
    name: "NHL 95 Manual (10‑max Double Elim)",
    startTime: null,
    game: "NHL 95",
    goalieMode: "manual",
    elimination: "double",
    maxPlayers: 10,
    entryFee: 0,
    prizeType: "dynamic",
    prizeAmount: 18000,
    registeredPlayers: [],
    rom: "NHL_95.bin",
    core: "genesis_plus_gx",
    type: "sit-n-go",
    status: "scheduled",
    periodLength: 5,
    rakePercent: 0.10,
  },
];

async function seedFreerolls() {
  try {
    await Tournament.insertMany(freerollTemplates);
    console.log("✅ Seeded Freeroll tournaments");
  } catch (err) {
    console.error("❌ Error seeding Freerolls:", err);
  } finally {
    mongoose.disconnect();
  }
}

seedFreerolls();