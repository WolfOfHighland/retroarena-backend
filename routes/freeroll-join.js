// POST /api/freeroll/register/:id
router.post('/freeroll/register/:id', async (req, res) => {
  const { playerId } = req.body;
  const { id } = req.params;

  if (!playerId || playerId.startsWith('guest')) {
    return res.status(403).json({ error: 'Guests cannot register' });
  }

  try {
    const tournament = await Tournament.findOne({ id, entryFee: 0 });
    if (!tournament) return res.status(404).json({ error: 'Freeroll not found' });

    if (tournament.registeredPlayers.includes(playerId)) {
      return res.status(400).json({ error: 'Already registered' });
    }

    tournament.registeredPlayers.push(playerId);
    await tournament.save();

    res.status(200).json({ message: 'Joined freeroll', tournament });
  } catch (err) {
    console.error(`❌ Freeroll join error for ${id}:`, err.message);
    res.status(500).json({ error: 'Server error' });
  }
});