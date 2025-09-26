require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const { createAdapter } = require('@socket.io/redis-adapter');
const { createClient } = require('redis');
const cors = require('cors');
const Stripe = require('stripe');
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
if (!process.env.STRIPE_SECRET_KEY) {
  console.error('❌ STRIPE_SECRET_KEY is missing from environment');
} else {
  console.log(`🔐 Stripe key loaded: ${process.env.STRIPE_SECRET_KEY.slice(0, 10)}...`);
}

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

// Stripe webhook requires raw body BEFORE express.json
app.post('/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('❌ Webhook signature error:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const matchId = session.success_url?.split('matchId=')[1];
    console.log(`💰 Payment confirmed for match ${matchId}`);

    io.to(matchId).emit('matchStart', {
      rom: 'NHL_95.bin',
      core: 'genesis_plus_gx',
      goalieMode: 'manual_goalie',
      matchId,
    });
  }

  res.status(200).send();
});

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Retro Rumble Arena backend is live 🐺");
});

app.get("/ping", (req, res) => {
  res.send("pong");
});

let redis;
if (process.env.REDIS_URL) {
  const pubClient = createClient({ url: process.env.REDIS_URL });
  const subClient = pubClient.duplicate();
  redis = pubClient;

  (async () => {
    try {
      await pubClient.connect();
      await subClient.connect();
      io.adapter(createAdapter(pubClient, subClient));
      console.log('🔌 Redis adapter connected');
    } catch (err) {
      console.error('⚠️ Redis failed — continuing without adapter:', err.message);
    }
  })();
} else {
  console.log('⚠️ No REDIS_URL provided — skipping Redis adapter');
}

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
  console.log(`🚀 Backend running on port ${PORT}`);
});

if (process.env.MONGO_URI) {
  mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  }).then(() => {
    console.log('✅ Connected to MongoDB');
  }).catch((err) => {
    console.error('⚠️ MongoDB connection failed:', err.message);
  });
} else {
  console.log('⚠️ No MONGO_URI provided — skipping MongoDB connection');
}

const playerSchema = new mongoose.Schema({
  username: String,
  email: String,
  country: String,
});
const Player = mongoose.model('Player', playerSchema);

async function saveMatchState(matchId, state) {
  if (!redis) return;
  try {
    await redis.set(`match:${matchId}`, JSON.stringify(state));
    console.log(`💾 Match state saved for ${matchId}`);
  } catch (err) {
    console.error(`⚠️ Failed to save match state: ${err.message}`);
  }
}

async function loadMatchState(matchId) {
  if (!redis) return null;
  try {
    const data = await redis.get(`match:${matchId}`);
    if (data) {
      console.log(`📥 Match state loaded for ${matchId}`);
      return JSON.parse(data);
    } else {
      console.log(`⚠️ No match state found for ${matchId}`);
      return null;
    }
  } catch (err) {
    console.error(`⚠️ Failed to load match state: ${err.message}`);
    return null;
  }
}

io.on('connection', (socket) => {
  console.log(`✅ Socket connected: ${socket.id}`);

  socket.onAny((event, payload) => {
    console.log(`📡 Received socket event: ${event}`, payload);
  });

  socket.on("registerRoom", ({ room }) => {
    console.log(`📥 registerRoom received:`, room);
    socket.join(room);
    console.log(`📡 Socket ${socket.id} joined room: ${room}`);
    console.log(`📦 Current socket rooms:`, Array.from(socket.rooms));
  });

  socket.on("joinTournament", (room) => {
    console.log(`📡 Socket ${socket.id} joining tournament room: ${room}`);
    socket.join(room);
  });

  socket.on('testPing', (data) => {
    console.log('🧪 testPing received:', data);
    socket.emit('testPong', { message: 'pong from backend' });
  });

  socket.on('resyncRequest', async ({ matchId }) => {
    const state = await loadMatchState(matchId);
    if (state) {
      console.log(`🔁 Resyncing match state for ${matchId}`);
      socket.emit('resyncMatch', state);
    }
  });

  socket.on('disconnect', () => {
    console.log(`❌ Socket disconnected: ${socket.id}`);
  });
});

app.post('/register-player', async (req, res) => {
  const { username, email, country, socketId } = req.body;
  console.log('📨 Incoming registration payload:', req.body);

  if (!username?.trim() || !email?.trim()) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const trimmedUsername = username.trim();
  const trimmedEmail = email.trim();
  const trimmedCountry = country?.trim();

  try {
    const existing = await Player.findOne({ email: trimmedEmail });

    const roomExists = io.sockets.adapter.rooms.has(trimmedEmail);
    console.log(`📦 Room exists for ${trimmedEmail}:`, roomExists);
    console.log('📦 All active rooms:', Array.from(io.sockets.adapter.rooms.keys()));

    const emitPayload = {
      username: existing ? existing.username : trimmedUsername,
      status: existing ? 'existing' : 'new',
    };

    if (existing) {
      console.log(`⚠️ Duplicate registration attempt: ${trimmedEmail}`);
      if (roomExists) {
        io.to(trimmedEmail).emit('registrationConfirmed', emitPayload);
        console.log(`📤 Emitting registrationConfirmed to room: ${trimmedEmail}`);
      } else if (socketId) {
        io.to(socketId).emit('registrationConfirmed', emitPayload);
        console.log(`📤 Fallback emit to socketId: ${socketId}`);
      } else {
        console.warn(`⚠️ No room or socketId available — emit skipped`);
      }
      return res.status(409).json({ error: 'Player already registered' });
    }

    const newPlayer = new Player({
      username: trimmedUsername,
      email: trimmedEmail,
      country: trimmedCountry,
    });

    await newPlayer.save();
    console.log(`📝 Player saved: ${trimmedUsername} (${trimmedEmail})`);

    if (roomExists) {
      io.to(trimmedEmail).emit('registrationConfirmed', emitPayload);
      console.log(`📤 Emitting registrationConfirmed to room: ${trimmedEmail}`);
    } else if (socketId) {
      io.to(socketId).emit('registrationConfirmed', emitPayload);
      console.log(`📤 Fallback emit to socketId: ${socketId}`);
    } else {
      console.warn(`⚠️ No room or socketId available — emit skipped`);
    }

    return res.status(200).json({ message: 'Player registered successfully' });
  } catch (err) {
    console.error('❌ Registration error:', err.message);
    return res.status(500).json({ error: 'Failed to register player' });
  }
});

app.post("/test-room", (req, res) => {
  const { room } = req.body;
  console.log(`📤 Manual emit to room: ${room}`);
  io.to(room).emit("registrationConfirmed", {
    username: "WolfTest",
    status: "new",
  });
  res.send("Emit sent");
});

app.post("/start-match", async (req, res) => {
  const { tournamentId, rom, core } = req.body;

  if (!tournamentId || !rom || !core) {
    return res.status(400).json({ error: "Missing tournamentId, rom, or core" });
  }

  console.log(`🎮 Starting match for tournament ${tournamentId}`);
  const matchState = {
    rom,
    core,
    goalieMode: "manual_goalie",
    matchId: tournamentId,
  };

  await saveMatchState(tournamentId, matchState);
  io.to(tournamentId).emit("matchStart", matchState);
  res.send("Match start emitted");
});


app.post("/api/create-checkout-session", async (req, res) => {
  const { matchId, entryFee, gameName } = req.body;

  if (!matchId || !entryFee || !gameName) {
    console.warn('⚠️ Missing required fields for checkout session');
    return res.status(400).json({ error: "Missing matchId, entryFee, or gameName" });
  }

  try {
    console.log(`🔐 Stripe key prefix: ${process.env.STRIPE_SECRET_KEY?.slice(0, 10)}...`);
    console.log(`📦 Checkout payload:`, { matchId, entryFee, gameName });

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: { name: `${gameName} Entry` },
          unit_amount: entryFee * 100,
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: `https://retrorumblearena.com/success?matchId=${matchId}`,
      cancel_url: `https://retrorumblearena.com/cancel`,
    });

    console.log(`🧾 Stripe session created: ${session.id}`);
    return res.json({ url: session.url });
  } catch (err) {
    console.error('❌ Stripe session error:', {
      message: err.message,
      type: err.type,
      code: err.code,
      param: err.param,
      raw: err.raw,
    });

    return res.status(500).json({
      error: 'Stripe session creation failed',
      details: err.message,
    });
  }
});