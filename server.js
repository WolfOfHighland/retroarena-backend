// server.js

require('dotenv').config(); // ✅ Load .env variables first

const express = require('express');
const cors = require('cors');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY); // ✅ Now this works

const app = express();
app.use(cors());
app.use(express.json());

// Example route
app.post('/create-checkout-session', async (req, res) => {
  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: req.body.items,
      mode: 'payment',
      success_url: 'https://retrorumblearena.com/success',
      cancel_url: 'https://retrorumblearena.com/cancel',
    });
    res.json({ id: session.id });
  } catch (err) {
    console.error('Stripe error:', err);
    res.status(500).json({ error: 'Checkout failed' });
  }
});

app.listen(3000, () => {
  console.log('Backend running on port 3000');
});