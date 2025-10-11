const express = require('express');
const router = express.Router();
const Tournament = require('../models/Tournament');

// POST /sit-n-go/join/:tournamentId
router.post('/join/:tournamentId', async (req, res) => {
  const { tournamentId } = req.params;
  const { playerId } = req.body;

  try {
    const tournament = await Tournament.findOne({ id: tournamentId });

    if (!tournament) {
      return res.status(404).json({ error: 'Tournament not found' });
    }

    if (tournament.startTime !== null) {
      return res.status(400).json({ error: 'This is not a Sit‑n‑Go tournament' });
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

module.exports = router;