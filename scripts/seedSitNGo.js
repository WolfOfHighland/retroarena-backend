require("dotenv").config();
const mongoose = require("mongoose");
const Tournament = require("../models/Tournament");

mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

// ✅ Sit‑n‑Go tournaments now use RRP (Retro Rumble Points)
// ✅ No entry fees, no rake, no dynamic prize logic
// ✅ prizeType = "fixed"
// ✅ prizeAmount = RRP value

const sitngoTemplates = [
  {
    id: "sitngo-auto-2",
    name: "NHL 95 Auto (2‑max)",
    startTime: null,
    game: "NHL 95",
    goalieMode: "auto",
    elimination: "single",
    maxPlayers: 2,
    entryFee: 0,            // ✅ No buy‑ins
    prizeType: "fixed",
    prizeAmount: 900,       // ✅ 900 RRP
    registeredPlayers: [],
    rom: "NHL_95.bin",
    core: "genesis_plus_gx",
    type: "sit-n-go",
    status: "scheduled",
    periodLength: 5,
  },
  {
    id: "sitngo-manual-4",
    name: "NHL 95 Manual (4‑max)",
    startTime: null,
    game: "NHL 95",
    goalieMode: "manual",
    elimination: "single",
    maxPlayers: 4,
    entryFee: 0,
    prizeType: "fixed",
    prizeAmount: 3600,      // ✅ 3600 RRP
    registeredPlayers: [],
    rom: "NHL_95.bin",
    core: "genesis_plus_gx",
    type: "sit-n-go",
    status: "scheduled",
    periodLength: 5,
  },
  {
    id: "sitngo-manual-10",
    name: "NHL 95 Manual (10‑max Double Elim)",
    startTime: null,
    game: "NHL 95",
    goalieMode: "manual",
    elimination: "double",
    maxPlayers: 10,
    entryFee: 0,
    prizeType: "fixed",
    prizeAmount: 18000,     // ✅ 18,000 RRP
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
    await Tournament.deleteMany({ type: "sit-n-go" }); // ✅ Clean old sit‑n‑gos
    await Tournament.insertMany(sitngoTemplates);
    console.log("✅ Seeded Sit‑n‑Go templates (RRP version)");
  } catch (err) {
    console.error("❌ Error seeding Sit‑n‑Go:", err);
  }
}

module.exports = seedSitNGo;