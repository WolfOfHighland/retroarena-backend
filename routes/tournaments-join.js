const express = require('express');
const router = express.Router();
const Tournament = require('../models/Tournament');

// POST /api/tournaments/join/:id
router.post('/join/:id', async (req, res) => {
  try {
    const tournament = await Tournament.findOne({ id: req.params.id });
    if (!tournament) return res.status(404).json({ error: 'Tournament not found' });

    const { playerId } = req.body;
    if (!playerId) return res.status(400).json({ error: 'Missing playerId' });

    const alreadyJoined = tournament.registeredPlayers?.includes(playerId);
    if (alreadyJoined) return res.status(200).json({ message: 'Already registered' });

    tournament.registeredPlayers.push(playerId);
    await tournament.save();

    console.log(`✅ Player ${playerId} registered for ${tournament.name}`);
    res.status(200).json({ message: 'Registered successfully' });
  } catch (err) {
    console.error('❌ Tournament register error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;