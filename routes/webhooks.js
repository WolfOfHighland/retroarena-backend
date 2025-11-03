const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const Player = require('../models/Player');

console.log('📬 Xsolla webhook route mounted at /webhooks/xsolla-webhook');

router.post('/xsolla-webhook', express.text({ type: '*/*' }), async (req, res) => {
  const rawBody = req.body;
  const signature = req.headers['authorization']?.replace('Signature ', '');
  const secret = process.env.XSOLLA_SECRET_KEY;

  const expectedSignature = crypto
    .createHash('sha1')
    .update(rawBody + secret)
    .digest('hex');

  if (signature !== expectedSignature) {
    console.error('❌ Invalid Xsolla signature');
    return res.status(403).send('Invalid signature');
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch (err) {
    console.error('❌ Failed to parse Xsolla payload:', err.message);
    return res.status(400).send('Invalid JSON');
  }

  const username = payload?.user?.id;
  const amount = payload?.payment?.amount;

  if (!username || !amount) {
    console.warn('⚠️ Missing username or amount in payload');
    return res.status(400).send('Invalid payload');
  }

  try {
    const player = await Player.findOne({ username });
    if (!player) {
      console.warn(`⚠️ Player not found: ${username}`);
      return res.status(404).send('Player not found');
    }

    player.balance += amount;
    await player.save();
    console.log(`✅ Credited $${amount} to ${username}`);
    res.status(200).send('OK');
  } catch (err) {
    console.error('❌ Error updating player balance:', err.message);
    res.status(500).send('Internal server error');
  }
});

module.exports = router;