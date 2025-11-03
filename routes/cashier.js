const express = require('express');
const router = express.Router();
const Player = require('../models/Player');

// POST /api/cashier/deposit
router.post('/deposit', async (req, res) => {
  const { playerId, amount } = req.body;
  const player = await Player.findOne({ username: playerId });
  if (!player) return res.status(404).json({ error: 'Player not found' });

  player.balance += amount;
  await player.save();
  res.status(200).json({ message: 'Deposit successful', balance: player.balance });
});

// POST /api/cashier/withdraw
router.post('/withdraw', async (req, res) => {
  const { playerId, amount } = req.body;
  const player = await Player.findOne({ username: playerId });
  if (!player) return res.status(404).json({ error: 'Player not found' });

  if (player.balance < amount) return res.status(400).json({ error: 'Insufficient funds' });

  player.balance -= amount;
  await player.save();
  res.status(200).json({ message: 'Withdrawal successful', balance: player.balance });
});

module.exports = router;