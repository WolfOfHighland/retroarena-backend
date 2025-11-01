const express = require('express');
const router = express.Router();
const Tournament = require('../models/Tournament');

// Helper to safely parse maxPlayers
const getMaxPlayers = (val) => {
  if (typeof val === 'number') return val;
  const parsed = Number(val);
  return Number.isNaN(parsed) ? 4 : parsed;
};

// GET /api/sit-n-go
router.get('/', async (req, res) => {
  try {
    const tournaments = await Tournament.find({
      type: 'sit-n-go',
      status: 'scheduled'
    });

    const waiting = tournaments
      .filter(t => {
        const max = getMaxPlayers(t.maxPlayers);
        const reg = Array.isArray(t.registeredPlayers) ? t.registeredPlayers.length : 0;
        return reg < max;
      })
      .slice(0, 3);

    console.log('🎯 Sit-n-Go route hit — returning 3 waiting tables');
    console.log('🧪 Waiting Sit-n-Go tournaments:', waiting.map(t => ({
      id: t.id,
      name: t.name,
      registered: Array.isArray(t.registeredPlayers) ? t.registeredPlayers.length : 0,
      max: getMaxPlayers(t.maxPlayers)
    })));

    const enriched = waiting.map(t => {
      const rake = t.rakePercent ?? 0.10;
      const netEntry = t.entryFee * (1 - rake);
      const prizeAmount = netEntry * getMaxPlayers(t.maxPlayers);

      return {
        id: t.id || t._id.toString(),
        name: t.name,
        entryFee: t.entryFee,
        registeredPlayers: Array.isArray(t.registeredPlayers) ? t.registeredPlayers : [],
        prizeType: t.prizeType,
        prizeAmount,
        game: t.game,
        goalieMode: t.goalieMode,
        elimination: t.elimination,
        maxPlayers: getMaxPlayers(t.maxPlayers),
        status: t.status || 'scheduled'
      };
    });

    console.log('🧪 Final enriched payload:', enriched);

    res.status(200).json(enriched);
  } catch (err) {
    console.error('❌ Sit-n-Go fetch error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/sit-n-go/clone/:id
router.post('/clone/:id', async (req, res) => {
  try {
    const original = await Tournament.findOne({ id: req.params.id });
    if (!original) return res.status(404).json({ error: 'Original tournament not found' });

    const clone = new Tournament({
      id: `${original.id}-clone-${Date.now()}`,
      name: original.name,
      type: original.type || 'sit-n-go',
      maxPlayers: original.maxPlayers,
      entryFee: original.entryFee,
      prizeType: original.prizeType,
      prizeAmount: original.prizeAmount,
      elimination: original.elimination,
      goalieMode: original.goalieMode,
      periodLength: original.periodLength,
      rom: original.rom || 'NHL_95.bin',
      core: original.core || 'genesis_plus_gx',
      registeredPlayers: [],
      status: 'scheduled',
      game: original.game,
      rakePercent: original.rakePercent ?? 0.10
    });

    await clone.save();

    console.log(`🧬 Clone created: ${clone.id}`);
    res.status(201).json({ message: 'Clone created', clone });
  } catch (err) {
    console.error('❌ Clone error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/sit-n-go/recalculate-prizes
router.post('/recalculate-prizes', async (req, res) => {
  try {
    const tournaments = await Tournament.find({
      type: 'sit-n-go',
      status: 'scheduled'
    });

    let updatedCount = 0;

    for (const t of tournaments) {
      const rake = t.rakePercent ?? 0.10;
      const netEntry = t.entryFee * (1 - rake);
      const max = getMaxPlayers(t.maxPlayers);
      const newPrize = netEntry * max;

      if (t.prizeAmount !== newPrize) {
        t.prizeAmount = newPrize;
        await t.save();
        updatedCount++;
        console.log(`💰 Updated prize pool for ${t.id} to $${newPrize}`);
      }
    }

    res.status(200).json({ message: `Updated ${updatedCount} tournaments.` });
  } catch (err) {
    console.error('❌ Prize recalculation error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ✅ POST /api/sit-n-go/create-test
router.post('/create-test', async (req, res) => {
  try {
    const testTournament = new Tournament({
      id: `nhl95-auto-2-max-test-${Date.now()}`,
      name: 'NHL 95 Auto (2‑max)',
      type: 'sit-n-go',
      maxPlayers: 2,
      entryFee: 0,
      prizeType: 'dynamic',
      prizeAmount: 0,
      elimination: 'single',
      goalieMode: 'auto',
      periodLength: 5,
      rom: 'NHL_95.bin',
      core: 'genesis_plus_gx',
      registeredPlayers: [],
      status: 'scheduled',
      game: 'NHL 95',
      rakePercent: 0.10
    });

    await testTournament.save();
    console.log(`🧪 Test tournament created: ${testTournament.id}`);
    res.status(201).json({ message: 'Test tournament created', tournament: testTournament });
  } catch (err) {
    console.error('❌ Test tournament creation error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;