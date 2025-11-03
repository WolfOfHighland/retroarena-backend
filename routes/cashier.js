const express = require('express');
const router = express.Router();
const https = require('https');
const Player = require('../models/Player');

// POST /api/cashier/create-xsolla-token
router.post('/create-xsolla-token', async (req, res) => {
  const { username, amount } = req.body;

  const payload = JSON.stringify({
    user: { id: username },
    settings: {
      currency: 'USD',
      external_payment: false,
      ui: { mode: 'desktop' }
    },
    purchase: {
      virtual_currency: {
        quantity: amount,
        currency: 'USD'
      }
    }
  });

  const options = {
    hostname: 'api.xsolla.com',
    path: `/merchant/v2/merchants/${process.env.XSOLLA_PROJECT_ID}/token`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
      'Authorization': 'Basic ' + Buffer.from(`${process.env.XSOLLA_API_KEY}:`).toString('base64')
    }
  };

  const request = https.request(options, (response) => {
    let data = '';
    response.on('data', chunk => data += chunk);
    response.on('end', () => {
      try {
        const parsed = JSON.parse(data);
        if (parsed.token) {
          res.json({ token: parsed.token });
        } else {
          console.error('❌ Unexpected Xsolla response:', parsed);
          res.status(500).json({ error: 'Invalid response from Xsolla' });
        }
      } catch (err) {
        console.error('❌ Failed to parse Xsolla response:', err.message);
        res.status(500).json({ error: 'Failed to parse response' });
      }
    });
  });

  request.on('error', (err) => {
    console.error('❌ Xsolla token request failed:', err.message);
    res.status(500).json({ error: 'Request failed' });
  });

  request.write(payload);
  request.end();
});

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