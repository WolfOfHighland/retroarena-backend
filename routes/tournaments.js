const express = require('express');
const router = express.Router();
const Tournament = require('../models/Tournament');

// GET /api/tournaments
router.get('/', async (req, res) => {
  try {
    const tournaments = await Tournament.find({
      startTime: { $ne: null } // filters out Sit-n-Go templates
    });

    const enriched = tournaments.map(t => ({
      ...t.toObject(),
      type: 'scheduled' // injects type for frontend filtering
    }));

    res.status(200).json(enriched);
  } catch (err) {
    console.error('❌ Failed to fetch tournaments:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/tournaments/register/:tournamentId
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
    console.error('❌ Registration error:', err.message);
    return res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;