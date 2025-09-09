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
  country: { type: String }, // Optional for global reach
  registeredAt: { type: Date, default: Date.now },
});

const Player = mongoose.model('Player', PlayerSchema);

// ✅ Register player before checkout
app.post('/register-player', async (req, res) => {
  const { username, email, country } = req.body;

  // 🧪 Log incoming payload
  console.log("📨 Incoming registration payload:", req.body);

  if (!username?.trim() || !email?.trim()) {
    return res.status(400).json({ error: 'Missing or invalid username/email' });
  }

  try {
    const existing = await Player.findOne({ email: email.trim() });
    if (existing) {
      return res.status(409).json({ error: 'Player already registered' });
    }

    const newPlayer = new Player({ username: username.trim(), email: email.trim(), country });
    await newPlayer.save();
    console.log(`📝 Player saved: ${username} (${email})`);
    res.status(200).json({ message: 'Player registered successfully' });
  } catch (err) {
    console.error('❌ MongoDB save error:', err.message);
    res.status(500).json({ error: 'Failed to register player' });
  }
});