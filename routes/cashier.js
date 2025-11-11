const express = require('express');
const router = express.Router();
const https = require('https');
const User = require('../models/User');

// ✅ POST /api/cashier/create-xsolla-token
router.post('/create-xsolla-token', async (req, res) => {
  try {
    const { username, amount } = req.body;
    if (!username || !amount) {
      return res.status(400).json({ error: 'Missing username or amount' });
    }

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
  } catch (err) {
    console.error('❌ Xsolla route crash:', err.stack || err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ✅ POST /api/cashier/deposit (adds RRC)
router.post('/deposit', async (req, res) => {
  const { userId, amount } = req.body;
  const user = await User.findOne({ username: userId });
  if (!user) return res.status(404).json({ error: 'User not found' });

  user.rrcBalance += amount;
  await user.save();
  res.status(200).json({ message: 'Deposit successful', rrcBalance: user.rrcBalance });
});

// ✅ POST /api/cashier/withdraw (subtracts RRC)
router.post('/withdraw', async (req, res) => {
  const { userId, amount } = req.body;
  const user = await User.findOne({ username: userId });
  if (!user) return res.status(404).json({ error: 'User not found' });

  if (user.rrcBalance < amount) return res.status(400).json({ error: 'Insufficient funds' });

  user.rrcBalance -= amount;
  await user.save();
  res.status(200).json({ message: 'Withdrawal successful', rrcBalance: user.rrcBalance });
});

// ✅ POST /api/cashier/earn (adds RRP)
router.post('/earn', async (req, res) => {
  const { userId, amount } = req.body;
  const user = await User.findOne({ username: userId });
  if (!user) return res.status(404).json({ error: 'User not found' });

  user.rrpBalance += amount;
  await user.save();
  res.status(200).json({ message: 'RRP earned', rrpBalance: user.rrpBalance });
});

// ✅ GET /api/cashier/balance?username=Wolf
router.get('/balance', async (req, res) => {
  const { username } = req.query;
  if (!username) return res.status(400).json({ error: 'Missing username' });

  if (username.startsWith('guest')) {
    return res.status(200).json({ rrcBalance: 0, rrpBalance: 0 });
  }

  const user = await User.findOne({ username });
  if (!user) return res.status(404).json({ error: 'User not found' });

  res.status(200).json({
    rrcBalance: user.rrcBalance,
    rrpBalance: user.rrpBalance
  });
});

module.exports = router;