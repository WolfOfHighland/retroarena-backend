// GET /api/freeroll
router.get('/freeroll', async (req, res) => {
  try {
    const tournaments = await Tournament.find({
      type: 'sit-n-go',
      entryFee: 0,
      status: 'scheduled',
      startTime: null
    });

    const enriched = tournaments.map(t => {
      const max = getMaxPlayers(t.maxPlayers);
      const reg = Array.isArray(t.registeredPlayers) ? t.registeredPlayers.length : 0;
      const rake = t.rakePercent ?? 0.10;
      const netEntry = t.entryFee * (1 - rake);
      const prizeAmount = netEntry * max;

      return {
        id: t.id || t._id.toString(),
        name: t.name,
        entryFee: t.entryFee,
        registeredPlayers: t.registeredPlayers || [],
        prizeType: t.prizeType,
        prizeAmount,
        rakeAmount: t.entryFee * rake,
        game: t.game,
        goalieMode: t.goalieMode,
        elimination: t.elimination,
        maxPlayers: max,
        status: t.status || 'scheduled'
      };
    });

    res.status(200).json(enriched);
  } catch (err) {
    console.error('❌ Freeroll fetch error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});