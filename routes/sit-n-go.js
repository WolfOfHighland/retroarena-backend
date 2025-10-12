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
      .filter(t => (t.registeredPlayers?.length || 0) < (t.maxPlayers || 4))
      .slice(0, 3);

    console.log('🎯 Sit-n-Go route hit — returning 3 waiting tables');
    console.log('🧪 Waiting Sit-n-Go tournaments:', waiting.map(t => ({
      id: t.id,
      name: t.name,
      registered: t.registeredPlayers?.length || 0,
      max: t.maxPlayers || 4
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
      maxPlayers: Number(t.maxPlayers || 4),
      status: t.status || 'scheduled',
    }));

    res.status(200).json(enriched);
  } catch (err) {
    console.error('❌ Sit-n-Go fetch error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/sit-n-go/join/:tableId
router.post('/join/:tableId', async (req, res) => {
  const { tableId } = req.params;
  const { playerId } = req.body;

  try {
    const tournament = await Tournament.findOne({ id: tableId });

    if (!tournament) {
      return res.status(404).json({ error: 'Tournament not found' });
    }

    if (tournament.registeredPlayers.includes(playerId)) {
      return res.status(400).json({ error: 'Player already registered' });
    }

    tournament.registeredPlayers.push(playerId);

    if (tournament.registeredPlayers.length >= tournament.maxPlayers) {
      tournament.status = 'active';
    }

    await tournament.save();

    res.status(200).json({ message: 'Joined Sit-n-Go', tournament });
  } catch (err) {
    console.error('❌ Join error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;