require("dotenv").config();
const mongoose = require("mongoose");
const Tournament = require("../models/Tournament");

// ✅ Freerolls use RRP, fixed prize, zero entry fee
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
    prizeAmount: 900,
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
    prizeAmount: 3600,
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
    prizeAmount: 18000,
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
    const ops = freerollTemplates.map((template) => ({
      updateOne: {
        filter: { id: template.id },
        update: {
          $set: template,
          // ✅ Guarantee 3 lobby objects with metadata
          $setOnInsert: {
            lobbies: [
              { id: `${template.id}-lobby1`, name: "Lobby 1", players: [], status: "waiting" },
              { id: `${template.id}-lobby2`, name: "Lobby 2", players: [], status: "waiting" },
              { id: `${template.id}-lobby3`, name: "Lobby 3", players: [], status: "waiting" }
            ]
          }
        },
        upsert: true
      }
    }));

    await Tournament.bulkWrite(ops, { ordered: false });
    console.log("✅ Seeded/Updated Freeroll tournaments with persistent lobbies");
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