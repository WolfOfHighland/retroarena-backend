require('dotenv').config(); // ✅ Load .env variables first

const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const http = require('http');
const { Server } = require('socket.io');

const app = express();
app.use(cors());
app.use(express.json());

// ✅ Connect to MongoDB with error handling
const mongoURI = process.env.MONGO_URI;
if (!mongoURI) {
  console.error('❌ MONGO_URI is not defined in environment variables');
  process.exit(1);
}

mongoose.connect(mongoURI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('✅ Connected to MongoDB'))
.catch((err) => {
  console.error('❌ MongoDB connection error:', err.message);
  process.exit(1);
});

// ✅ Define Player schema and model
const PlayerSchema = new mongoose.Schema({
  username: { type: String, required: true },
  email: { type: String, required: true },
  registeredAt: { type: Date, default: Date.now },
});

const Player = mongoose.model('Player', PlayerSchema);

// ✅ Register player before checkout
app.post('/register-player', async (req, res) => {
  const username = req.body.username?.trim();
  const email = req.body.email?.trim();

  if (!username || !email) {
    return res.status(400).json({ error: 'Missing or invalid username/email' });
  }

  try {
    const newPlayer = new Player({ username, email });
    await newPlayer.save();
    console.log(`📝 Player saved: ${username} (${email})`);
    res.status(200).json({ message: 'Player registered successfully' });
  } catch (err) {
    console.error('❌ MongoDB save error:', err.message);
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

    console.log(`💳 Stripe session created: ${session.id}`);
    res.json({ url: session.url });
  } catch (err) {
    console.error('❌ Stripe error:', err.message);
    res.status(500).json({ error: 'Checkout failed' });
  }
});

// ✅ Root route for sanity check
app.get('/', (req, res) => {
  res.send('Retro Rumble Backend is Live 🐺');
});

// 🔌 Setup Socket.IO
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

io.on('connection', (socket) => {
  console.log(`✅ Socket connected: ${socket.id}`);

  // Example: emit tournament updates
  // socket.emit('tournamentUpdate', { status: 'ready' });

  socket.on('disconnect', () => {
    console.log(`⚠️ Socket disconnected: ${socket.id}`);
  });
});

// ✅ Start server with Socket.IO support
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Backend running on port ${PORT}`);
});