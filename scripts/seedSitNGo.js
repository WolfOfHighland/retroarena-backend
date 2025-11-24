require("dotenv").config(); // ✅ Load .env variables
const mongoose = require("mongoose");
const Tournament = require("../models/Tournament");

mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const sitngoTemplates = [
  {
    id: "nhl95-auto-2",
    name: "NHL 95 Auto (2‑max)",
    startTime: null,
    game: "NHL 95",
    goalieMode: "auto",
    elimination: "single",
    maxPlayers: 2,
    entryFee: 5,
    prizeType: "dynamic",
    prizeAmount: 0,
    registeredPlayers: [],
    rom: "NHL_95.bin",
    core: "genesis_plus_gx",
    type: "sit-n-go",
    status: "scheduled", // ✅ Required for visibility
    periodLength: 5,
  },
  {
    id: "nhl95-manual-4",
    name: "NHL 95 Manual (4‑max)",
    startTime: null,
    game: "NHL 95",
    goalieMode: "manual",
    elimination: "single",
    maxPlayers: 4,
    entryFee: 10,
    prizeType: "dynamic",
    prizeAmount: 0,
    registeredPlayers: [],
    rom: "NHL_95.bin",
    core: "genesis_plus_gx",
    type: "sit-n-go",
    status: "scheduled",
    periodLength: 5,
  },
  {
    id: "nhl95-double-10",
    name: "NHL 95 Manual (10‑max Double Elim)",
    startTime: null,
    game: "NHL 95",
    goalieMode: "manual",
    elimination: "double",
    maxPlayers: 10,
    entryFee: 20,
    prizeType: "dynamic",
    prizeAmount: 0,
    registeredPlayers: [],
    rom: "NHL_95.bin",
    core: "genesis_plus_gx",
    type: "sit-n-go",
    status: "scheduled",
    periodLength: 5,
  },
];

async function seedSitNGo() {
  try {
    await Tournament.deleteMany({ startTime: null }); // optional: clear old sitngos
    await Tournament.insertMany(sitngoTemplates);
    console.log("✅ Seeded Sit‑n‑Go templates");
  } catch (err) {
    console.error("❌ Error seeding Sit‑n‑Go:", err);
  }
}

// 👉 Export the function instead of running it
module.exports = seedSitNGo;