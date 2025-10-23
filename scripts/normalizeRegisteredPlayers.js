require("dotenv").config();
const mongoose = require("mongoose");
const Tournament = require("../models/Tournament");

async function normalizePlayers() {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    const tournaments = await Tournament.find({});
    let updated = 0;

    for (const t of tournaments) {
      if (Array.isArray(t.registeredPlayers)) {
        const normalized = t.registeredPlayers.map(p =>
          typeof p === "string" ? { id: p } : p
        );

        // Only update if normalization changed something
        const changed = JSON.stringify(t.registeredPlayers) !== JSON.stringify(normalized);
        if (changed) {
          t.registeredPlayers = normalized;
          await t.save();
          console.log(`✅ Normalized ${t.id}`);
          updated++;
        }
      }
    }

    console.log(`🎯 Finished normalization. Updated ${updated} tournaments.`);
  } catch (err) {
    console.error("❌ Normalization failed:", err);
  } finally {
    await mongoose.disconnect();
  }
}

normalizePlayers();