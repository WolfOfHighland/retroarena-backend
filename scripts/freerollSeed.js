require("dotenv").config();
const mongoose = require("mongoose");
const Tournament = require("../models/Tournament");

// ✅ Freerolls now use RRP (Retro Rumble Points)
// ✅ No dollars, no rake, no dynamic prize logic
// ✅ prizeType = "fixed"
// ✅ prizeAmount = RRP value

const freerollTemplates = [
  {
    id: "freeroll-auto-2",
    name: "NHL 95 Auto (2‑max)",
    startTime: null,
    game: "NHL 95",
    goalieMode: "auto",
    elimination: "single",
    maxPlayers: 2,
    entryFee: 0,
    prizeType: "fixed",
    prizeAmount: 900, // ✅ 900 RRP
    registeredPlayers: [],
    rom: "NHL_95.bin",
    core: "genesis_plus_gx",
    type: "freeroll",
    status: "scheduled",
    periodLength: 5
  },
  {
    id: "freeroll-manual-4",
    name: "NHL 95 Manual (4‑max)",
    startTime: null,
    game: "NHL 95",
    goalieMode: "manual",
    elimination: "single",
    maxPlayers: 4,
    entryFee: 0,
    prizeType: "fixed",
    prizeAmount: 3600, // ✅ 3600 RRP
    registeredPlayers: [],
    rom: "NHL_95.bin",
    core: "genesis_plus_gx",
    type: "freeroll",
    status: "scheduled",
    periodLength: 5
  },
  {
    id: "freeroll-manual-10",
    name: "NHL 95 Manual (10‑max Double Elim)",
    startTime: null,
    game: "NHL 95",
    goalieMode: "manual",
    elimination: "double",
    maxPlayers: 10,
    entryFee: 0,
    prizeType: "fixed",
    prizeAmount: 18000, // ✅ 18,000 RRP
    registeredPlayers: [],
    rom: "NHL_95.bin",
    core: "genesis_plus_gx",
    type: "freeroll",
    status: "scheduled",
    periodLength: 5
  }
];

async function seedFreerolls() {
  try {
    await Tournament.insertMany(freerollTemplates);
    console.log("✅ Seeded Freeroll tournaments (RRP version)");
  } catch (err) {
    console.error("❌ Error seeding Freerolls:", err);
  }
}

module.exports = seedFreerolls;

if (require.main === module) {
  mongoose
    .connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      dbName: "retro_rumble"
    })
    .then(async () => {
      await seedFreerolls();
      mongoose.disconnect();
    });
}