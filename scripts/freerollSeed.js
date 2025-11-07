// POST /api/freeroll/seed
router.post('/freeroll/seed', async (req, res) => {
  try {
    const now = Date.now();
    const freerolls = [
      {
        id: `freeroll-auto-2-${now}`,
        name: 'NHL 95 Auto (2‑max)',
        maxPlayers: 2,
        prizeAmount: 900,
        elimination: 'single',
        goalieMode: 'auto'
      },
      {
        id: `freeroll-manual-4-${now}`,
        name: 'NHL 95 Manual (4‑max)',
        maxPlayers: 4,
        prizeAmount: 3600,
        elimination: 'single',
        goalieMode: 'manual'
      },
      {
        id: `freeroll-manual-10-${now}`,
        name: 'NHL 95 Manual (10‑max Double Elim)',
        maxPlayers: 10,
        prizeAmount: 18000,
        elimination: 'double',
        goalieMode: 'manual'
      }
    ];

    for (const f of freerolls) {
      await new Tournament({
        ...f,
        type: 'sit-n-go',
        entryFee: 0,
        prizeType: 'dynamic',
        rom: 'NHL_95.bin',
        core: 'genesis_plus_gx',
        registeredPlayers: [],
        status: 'scheduled',
        startTime: null,
        game: 'NHL 95',
        rakePercent: 0.10
      }).save();
    }

    res.status(201).json({ message: 'Freerolls seeded' });
  } catch (err) {
    console.error('❌ Freeroll seed error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});