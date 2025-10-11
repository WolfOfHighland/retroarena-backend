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
const { scheduleAllTournaments, scheduleTournamentStart } = require('./scheduler/tournaments');

if (!process.env.STRIPE_SECRET_KEY) {
  console.error('❌ STRIPE_SECRET_KEY is missing from environment');
} else {
  console.log(`🔐 Stripe key loaded: ${process.env.STRIPE_SECRET_KEY.slice(0, 10)}...`);
}

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});
module.exports.io = io; // export io for scheduler

// --- Stripe webhook (raw body required) ---
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

// --- Middleware ---
app.use(cors({
  origin: [
    "https://retrorumblearena.com",
    "https://www.retrorumblearena.com",
    /\.vercel\.app$/,                   // Vercel previews
    "http://localhost:3000"             // local dev
  ],
  credentials: true,
}));
app.use(express.json());

// --- API logger ---
app.use('/api', (req, _res, next) => {
  console.log(`➡️ API ${req.method} ${req.originalUrl}`);
  next();
});

// --- Health checks ---
app.get("/", (_req, res) => res.send("Retro Rumble Arena backend is live 🐺"));
app.get("/api/ping", (_req, res) => res.send("pong"));
app.get("/ping", (_req, res) => res.send("pong"));

// --- Redis setup ---
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

// --- MongoDB setup ---
if (process.env.MONGO_URI) {
  mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  }).then(() => console.log('✅ Connected to MongoDB'))
    .catch((err) => console.error('⚠️ MongoDB connection failed:', err.message));
} else {
  console.log('⚠️ No MONGO_URI provided — skipping MongoDB connection');
}

// --- Redis helpers ---
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

// --- Socket.IO handlers ---
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

// --- Routes ---
// Register player
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

// Test room emit
app.post("/test-room", (req, res) => {
  const { room } = req.body;
  io.to(room).emit("registrationConfirmed", { username: "WolfTest", status: "new" });
  res.send("Emit sent");
});

// Start match
app.post("/start-match", async (req, res) => {
  const { tournamentId, rom, core } = req.body;
  if (!tournamentId || !rom || !core) {
    return res.status(400).json({ error: "Missing tournamentId, rom, or core" });
  }

  try {
    // Look up the tournament in Mongo
    const tournament = await Tournament.findOne({ id: tournamentId });
    if (!tournament) {
      return res.status(404).json({ error: "Tournament not found" });
    }

    // Build match state using tournament settings
    const matchState = {
      rom,
      core,
      goalieMode: tournament.goalieMode || "manual", // fallback to manual
      periodLength: tournament.periodLength,         // include other rules if needed
      matchId: tournamentId,
    };

    // Persist match state
    await saveMatchState(tournamentId, matchState);

    // Emit to all clients in this tournament room
    io.to(tournamentId).emit("matchStart", matchState);

    res.json({ ok: true, message: "Match start emitted", matchState });
  } catch (err) {
    console.error("❌ start-match error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Stripe checkout session
app.post("/api/create-checkout-session", async (req, res) => {
  const { matchId, entryFee, gameName } = req.body;
  if (!matchId || !entryFee || !gameName) {
    return res.status(400).json({ error: "Missing matchId, entryFee, or gameName" });
  }

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: { name: `${gameName} Entry` },
            unit_amount: entryFee * 100,
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: `https://retrorumblearena.com/success?matchId=${matchId}`,
      cancel_url: `https://retrorumblearena.com/cancel`,
    });

    console.log(`🧾 Stripe session created: ${session.id}`);
    return res.json({ url: session.url });
  } catch (err) {
    console.error("❌ Stripe session error triggered");
    console.error("❌ Stripe session error details:", {
      message: err.message,
      type: err.type,
      code: err.code,
      param: err.param,
      raw: err.raw,
    });

    return res.status(500).json({
      error: "Stripe session creation failed",
      details: err.message,
    });
  }
});

// Sit-n-Go join
app.post("/sit-n-go/join", async (req, res) => {
  const { username, email } = req.body;
  if (!username || !email) {
    return res.status(400).json({ error: "Missing username or email" });
  }

  try {
    await redis.rPush("sitngoQueue", JSON.stringify({ username, email }));
    const queueLength = await redis.lLen("sitngoQueue");
    console.log(`📥 Sit-n-Go join received: ${username} (${email}) — queue length: ${queueLength}`);

    if (queueLength >= 2) {
      const [p1Raw, p2Raw] = await redis.lPopCount("sitngoQueue", 2);
      if (p1Raw && p2Raw) {
        const p1 = JSON.parse(p1Raw);
        const p2 = JSON.parse(p2Raw);

        const matchData = {
          rom: "NHL_95.bin",
          core: "genesis_plus_gx",
          goalieMode: "manual_goalie",
          matchId: `sitngo-${Date.now()}`,
          players: [p1, p2],
        };

        io.to(p1.email).emit("matchStart", matchData);
        io.to(p2.email).emit("matchStart", matchData);

        console.log(`⚡ Sit-n-Go match started: ${p1.username} vs ${p2.username}`);
        return res.json({ status: "matched", matchId: matchData.matchId });
      }
    }

    res.json({ status: "queued" });
  } catch (err) {
    console.error("❌ Sit-n-Go Redis error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Sit-n-Go status
app.get("/sit-n-go/status", async (_req, res) => {
  try {
    const queueLength = await redis.lLen("sitngoQueue");
    res.json({ queueLength });
  } catch (err) {
    console.error("❌ Sit-n-Go status error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// --- Tournament API (fix for "Cannot GET /api/tournaments") ---
app.get("/api/tournaments", async (_req, res) => {
  try {
    const tournaments = await Tournament.find({});
    res.json(tournaments);
  } catch (err) {
    console.error("❌ Failed to fetch tournaments:", err);
    res.status(500).json({ error: "Failed to fetch tournaments" });
  }
});

// ✅ Server start (always last, outside of routes)
const PORT = process.env.PORT || 10000;
server.listen(PORT, async () => {
  console.log(`🚀 Backend running on port ${PORT}`);
  try {
    await scheduleAllTournaments(io); // pass io into scheduler
  } catch (err) {
    console.error("⚠️ Failed to schedule tournaments:", err.message);
  }
});