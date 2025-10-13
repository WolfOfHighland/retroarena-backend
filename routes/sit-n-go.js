const express = require('express');
const router = express.Router();
const Tournament = require('../models/Tournament');

// GET /api/sit-n-go
router.get('/', async (req, res) => {
  try {
    const tournaments = await Tournament.find({
      type: 'sit-n-go',
      status: 'scheduled'
    });

    const waiting = tournaments
      .filter(t => {
        const max = parseInt(t.maxPlayers) || 4;
        const reg = t.registeredPlayers?.length || 0;
        return reg < max;
      })
      .slice(0, 3);

    console.log('🎯 Sit-n-Go route hit — returning 3 waiting tables');
    console.log('🧪 Waiting Sit-n-Go tournaments:', waiting.map(t => ({
      id: t.id,
      name: t.name,
      registered: t.registeredPlayers?.length || 0,
      max: parseInt(t.maxPlayers) || 4
    })));

    const enriched = waiting.map(t => ({
      id: t.id || t._id.toString(),
      name: t.name,
      entryFee: t.entryFee,
      registeredPlayers: t.registeredPlayers || [],
      prizeType: t.prizeType,
      prizeAmount: t.prizeAmount,
      game: t.game,
      goalieMode: t.goalieMode,
      elimination: t.elimination,
      maxPlayers: parseInt(t.maxPlayers) || 4,
      status: t.status || 'scheduled',
    }));

    res.status(200).json(enriched);
  } catch (err) {
    console.error('❌ Sit-n-Go fetch error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;