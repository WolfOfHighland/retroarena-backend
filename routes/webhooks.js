const express = require('express');
const router = express.Router();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const Player = require('../models/Player');
console.log('📬 Stripe webhook route mounted at /webhooks/stripe-webhook');

// Stripe requires raw body for signature verification
router.post('/stripe-webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'payment_intent.succeeded') {
    const paymentIntent = event.data.object;
    const username = paymentIntent.metadata?.username;
    const amount = paymentIntent.amount_received / 100;

    if (!username) {
      console.warn('No username found in payment metadata');
      return res.status(400).send('Missing username metadata');
    }

    try {
      const player = await Player.findOne({ username });
      if (!player) {
        console.warn(`Player not found for username: ${username}`);
        return res.status(404).send('Player not found');
      }

      player.balance += amount;
      await player.save();
      console.log(`Credited $${amount} to ${username}`);
    } catch (err) {
      console.error('Error updating player balance:', err.message);
      return res.status(500).send('Internal server error');
    }
  }

  res.json({ received: true });
});

module.exports = router;