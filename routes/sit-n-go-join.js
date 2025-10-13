const express = require('express');
const router = express.Router();
const Tournament = require('../models/Tournament');

// POST /api/sit-n-go/join/:id
router.post('/join/:id', async (req, res) => {
  try {
    const tournament = await Tournament.findOne({ id: req.params.id });
    if (!tournament) return res.status(404).json({ error: 'Tournament not found' });

    const { playerId } = req.body;
    if (!playerId) return res.status(400).json({ error: 'Missing playerId' });

    const alreadyJoined = tournament.registeredPlayers?.includes(playerId);
    if (alreadyJoined) return res.status(200).json({ message: 'Already joined' });

    tournament.registeredPlayers.push(playerId);
    await tournament.save();

    console.log(`✅ Player ${playerId} joined ${tournament.name}`);
    res.status(200).json({ message: 'Joined successfully' });
  } catch (err) {
    console.error('❌ Join error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;