require('dotenv').config(); // ✅ Load .env variables first

// 🧪 Sanity check for environment variables
console.log("✅ STRIPE key loaded:", !!process.env.STRIPE_SECRET_KEY);
console.log("✅ Mongo URI loaded:", !!process.env.MONGO_URI);
console.log("✅ PORT loaded:", process.env.PORT);

const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const http = require('http');
const { Server } = require('socket.io');

const app = express();

// ✅ CORS whitelist for frontend domains
const allowedOrigins = [
  'https://retrorumblearena.com',
  'https://www.retrorumblearena.com',
  'http://localhost:3000',
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('❌ CORS: Origin not allowed'));
    }
  },
  methods: ['GET', 'POST'],
  credentials: true,
}));

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
.then(() => {
  console.log('✅ Connected to MongoDB');
  Player.init(); // Ensure indexes are built
})
.catch((err) => {
  console.error('❌ MongoDB connection error:', err.message);
  process.exit(1);
});

// ✅ Define Player schema and model
const PlayerSchema = new mongoose.Schema({
  username: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  country: { type: String },
  registeredAt: { type: Date, default: Date.now },
});

const Player = mongoose.model('Player', PlayerSchema);

// ✅ Register player before checkout
app.post('/register-player', async (req, res) => {
  const { username, email, country } = req.body;

  console.log("📨 Incoming registration payload:", req.body);

  if (!username?.trim() || !email?.trim()) {
    return res.status(400).json({ error: 'Missing or invalid username/email' });
  }

  try {
    const existing = await Player.findOne({ email: email.trim() });
    if (existing) {
      return res.status(409).json({ error: 'Player already registered' });
    }

    const newPlayer = new Player({
      username: username.trim(),
      email: email.trim(),
      country: country?.trim(),
    });

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

// 🔌 Setup HTTP server and Socket.IO
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true,
  },
  path: "/socket.io",
  transports: ["polling", "websocket"],
  pingTimeout: 30000,
  pingInterval: 25000,
  allowEIO3: true,
});

io.on('connection', (socket) => {
  console.log(`✅ Socket connected: ${socket.id}`);

  socket.on('disconnect', (reason) => {
    console.warn(`⚠️ Socket disconnected: ${socket.id} — Reason: ${reason}`);
    if (reason === 'transport close') {
      console.log('🔄 Likely reconnecting due to Render cold start or network drop');
    }
  });

  // Future: emit tournament updates
  // socket.emit('tournamentUpdate', { status: 'ready' });
});

// ✅ Start server with Socket.IO support
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Backend running on port ${PORT}`);
});