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

// Models
const Player = require('./models/Player');
const Tournament = require('./models/Tournament');

// Scheduler
const {
  scheduleAllTournaments,
  scheduleTournamentStart,
  watchSitNGoTables,
} = require('./scheduler/tournaments');

// Express setup
const app = express();
app.use(cors({
  origin: [
    "https://retrorumblearena.com",
    "https://www.retrorumblearena.com",
    /\.vercel\.app$/,
    "http://localhost:3000"
  ],
  credentials: true,
}));
app.use(express.json());

// API logger
app.use('/api', (req, _res, next) => {
  console.log(`➡️ API ${req.method} ${req.originalUrl}`);
  next();
});
app.use('/api/sit-n-go', require('./routes/sit-n-go'));
// Health checks
app.get("/", (_req, res) => res.send("Retro Rumble Arena backend is live 🐺"));
app.get("/api/ping", (_req, res) => res.send("pong"));
app.get("/ping", (_req, res) => res.send("pong"));

// HTTP + Socket.IO setup
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});
module.exports.io = io;

// Redis setup
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

// MongoDB setup
if (process.env.MONGO_URI) {
  mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  }).then(() => {
    console.log('✅ Connected to MongoDB');
    scheduleAllTournaments(io);
    watchSitNGoTables(io);
  }).catch((err) => {
    console.error('⚠️ MongoDB connection failed:', err.message);
  });
} else {
  console.log('⚠️ No MONGO_URI provided — skipping MongoDB connection');
}

// Stripe key check
if (!process.env.STRIPE_SECRET_KEY) {
  console.error('❌ STRIPE_SECRET_KEY is missing from environment');
} else {
  console.log(`🔐 Stripe key loaded: ${process.env.STRIPE_SECRET_KEY.slice(0, 10)}...`);
}

// Stripe webhook
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

// Redis helpers
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
    }
    console.log(`⚠️ No match state found for ${matchId}`);
    return null;
  } catch (err) {
    console.error(`⚠️ Failed to load match state: ${err.message}`);
    return null;
  }
}

// ✅ Route wiring
const matchRoutes = require('./routes/match');
const sitngoRoutes = require('./routes/sit-n-go');
const tournamentRoutes = require('./routes/tournaments');

// ✅ Mount each route explicitly
app.use('/api/match', matchRoutes);         // Now lives at /api/match/...
app.use('/api/sit-n-go', sitngoRoutes);     // Lives at /api/sit-n-go
app.use('/api/tournaments', tournamentRoutes);

// Socket.IO handlers
io.on('connection', (socket) => {
  console.log(`✅ Socket connected: ${socket.id}`);

  socket.onAny((event, payload) => {
    console.log(`📡 Received socket event: ${event}`, payload);
  });

  socket.on("registerRoom", ({ room }) => {
    console.log(`📥 registerRoom received:`, room);
    socket.join(room);
    console.log(`📡 Socket ${socket.id} joined room: ${room}`);
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

// Custom routes
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

    const emitPayload = {
      username: existing ? existing.username : trimmedUsername,
      status: existing ? 'existing' : 'new',
    };

    if (existing) {
      console.log(`⚠️ Duplicate registration attempt: ${trimmedEmail}`);
      if (roomExists) {
        io.to(trimmedEmail).emit('registrationConfirmed', emitPayload);
      } else if (socketId) {
        io.to(socketId).emit('registrationConfirmed', emitPayload);
      }
      return res.status(409).json({ error: 'Player already registered' });
    }

    const newPlayer = new Player({ username: trimmedUsername, email: trimmedEmail, country: trimmedCountry });
    await newPlayer.save();
    console.log(`📝 Player saved: ${trimmedUsername} (${trimmedEmail})`);

    if (roomExists) {
      io.to(trimmedEmail).emit('registrationConfirmed', emitPayload);
    } else if (socketId) {
      io.to(socketId).emit('registrationConfirmed', emitPayload);
    }

    return res.status(200).json({ message: 'Player registered successfully' });
  } catch (err) {
    console.error('❌ Registration error:', err.message);
    return res.status(500).json({ error: 'Failed to register player' });
  }
});

app.post("/test-room", (req, res) => {
  const { room } = req.body;
  io.to(room).emit("registrationConfirmed", { username: "WolfTest", status: "new" });
  res.send("Emit sent");
});

app.post("/start-match", async (req, res) => {
  const { tournamentId, rom, core } = req.body;

  if (!tournamentId || !rom || !core) {
    return res.status(400).json({ error: "Missing tournamentId, rom, or core" });
  }

  try {
    const tournament = await Tournament.findOne({ id: tournamentId });

    if (!tournament) {
      return res.status(404).json({ error: "Tournament not found" });
    }

    const matchState = {
      rom,
      core,
      goalieMode: tournament.goalieMode || "manual",
      periodLength: tournament.periodLength || 5,
      matchId: tournamentId,
    };

    await saveMatchState(tournamentId, matchState);
    io.to(tournamentId).emit("matchStart", matchState);

    return res.status(200).json({
      ok: true,
      message: "Match start emitted",
      matchState,
    });
  } catch (err) {
    console.error("❌ start-match error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});
const PORT = process.env.PORT;
server.listen(PORT, () => {
  console.log(`🚀 Server listening on port ${PORT}`);
});