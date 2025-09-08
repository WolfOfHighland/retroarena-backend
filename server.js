require('dotenv').config(); // ✅ Load .env variables first

const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY); // ✅ Stripe works

const app = express();
app.use(cors());
app.use(express.json());

// ✅ Connect to MongoDB
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});
mongoose.connection.once('open', () => {
  console.log('✅ Connected to MongoDB');
});

// ✅ Define Player schema
const PlayerSchema = new mongoose.Schema({
  username: String,
  email: String,
  registeredAt: { type: Date, default: Date.now },
});

const Player = mongoose.model('Player', PlayerSchema);

// ✅ Register player before checkout
app.post('/register-player', async (req, res) => {
  const { username, email } = req.body;

  if (!username || !email) {
    return res.status(400).json({ error: 'Missing username or email' });
  }

  try {
    const newPlayer = new Player({ username, email });
    await newPlayer.save();
    console.log(`📝 Player saved: ${username} (${email})`);
    res.status(200).json({ message: 'Player registered successfully' });
  } catch (err) {
    console.error('MongoDB error:', err);
    res.status(500).json({ error: 'Failed to register player' });
  }
});

// ✅ Stripe Checkout route
app.post('/create-checkout-session', async (req, res) => {
  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: req.body.items,
      mode: 'payment',
      success_url: 'https://retrorumblearena.com/success',
      cancel_url: 'https://retrorumblearena.com/cancel',
    });
    res.json({ url: session.url }); // ✅ Return full redirect URL
  } catch (err) {
    console.error('Stripe error:', err);
    res.status(500).json({ error: 'Checkout failed' });
  }
});

// ✅ Optional: Root route for sanity check
app.get('/', (req, res) => {
  res.send('Retro Rumble Backend is Live 🐺');
});

app.listen(3000, () => {
  console.log('Backend running on port 3000');
});