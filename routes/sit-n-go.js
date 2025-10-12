const express = require('express');
const router = express.Router();
const Tournament = require('../models/Tournament');

// POST /sit-n-go/join/:tournamentId
router.post('/join/:tournamentId', async (req, res) => {
  const { tournamentId } = req.params;
  const { playerId } = req.body;

  if (!playerId || typeof playerId !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid playerId' });
  }

  try {
    const tournament = await Tournament.findOne({ id: tournamentId });

    if (!tournament) {
      return res.status(404).json({ error: 'Tournament not found' });
    }

    if (tournament.startTime !== null) {
      return res.status(400).json({ error: 'This is not a Sit‑n‑Go tournament' });
    }

    if (!Array.isArray(tournament.registeredPlayers)) {
      tournament.registeredPlayers = [];
    }

    if (tournament.registeredPlayers.includes(playerId)) {
      return res.status(400).json({ error: 'Player already registered' });
    }

    tournament.registeredPlayers.push(playerId);
    await tournament.save();

    return res.status(200).json({ message: 'Player joined Sit‑n‑Go', tournament });
  } catch (err) {
    console.error('❌ Sit‑n‑Go join error:', err.message);
    return res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/sit-n-go
router.get('/', async (req, res) => {
  try {
    const tournaments = await Tournament.find({
      $or: [
        { startTime: null },
        { startTime: { $exists: false } }
      ],
      status: { $in: ['scheduled', 'pending', 'created'] },
      type: { $in: ['sit-n-go', 'sitngo'] },
    });

    const enriched = tournaments.map(t => ({
      id: t._id.toString(),
      name: t.name,
      entryFee: t.entryFee,
      registeredPlayers: t.registeredPlayers || [],
      prizeType: t.prizeType,
      prizeAmount: t.prizeAmount,
      game: t.game,
      goalieMode: t.goalieMode,
      elimination: t.elimination,
      maxPlayers: Number(t.maxPlayers),
    }));

    return res.status(200).json(enriched);
  } catch (err) {
    console.error('❌ Sit‑n‑Go fetch error:', err.message);
    return res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;