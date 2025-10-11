// routes/tournaments.js
const express = require('express');
const router = express.Router();
const Tournament = require('../models/Tournament');

router.post('/register/:tournamentId', async (req, res) => {
  const { tournamentId } = req.params;
  const { playerId } = req.body;

  try {
    const tournament = await Tournament.findOne({ id: tournamentId });

    if (!tournament) {
      return res.status(404).json({ error: 'Tournament not found' });
    }

    if (tournament.registeredPlayers.includes(playerId)) {
      return res.status(400).json({ error: 'Player already registered' });
    }

    tournament.registeredPlayers.push(playerId);
    await tournament.save();

    return res.status(200).json({ message: 'Registered for tournament', tournament });
  } catch (err) {
    console.error('Registration error:', err.message);
    return res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;