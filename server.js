require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const { createAdapter } = require('@socket.io/redis-adapter');
const { createClient } = require('redis');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

app.use(cors());
app.use(express.json());

// ✅ Health check route
app.get("/ping", (req, res) => {
  res.send("pong");
});

// ✅ Redis connection using environment variable
const pubClient = createClient({ url: process.env.REDIS_URL });
const subClient = pubClient.duplicate();
const redis = pubClient;

(async () => {
  try {
    await pubClient.connect();
    await subClient.connect();
    io.adapter(createAdapter(pubClient, subClient));
    console.log('🔌 Redis adapter connected');

    const PORT = process.env.PORT || 10000;
    server.listen(PORT, () => {
      console.log(`🚀 Backend running on port ${PORT}`);
    });
  } catch (err) {
    console.error('❌ Redis adapter failed to connect:', err.message);
    process.exit(1);
  }
})();

mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/retroarena', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => {
  console.log('✅ Connected to MongoDB');
}).catch((err) => {
  console.error('❌ MongoDB connection error:', err.message);
});

const playerSchema = new mongoose.Schema({
  username: String,
  email: String,
  country: String,
});
const Player = mongoose.model('Player', playerSchema);

async function saveMatchState(matchId, state) {
  await redis.set(`match:${matchId}`, JSON.stringify(state));
  console.log(`💾 Match state saved for ${matchId}`);
}

async function loadMatchState(matchId) {
  const data = await redis.get(`match:${matchId}`);
  if (data) {
    console.log(`📥 Match state loaded for ${matchId}`);
    return JSON.parse(data);
  } else {
    console.log(`⚠️ No match state found for ${matchId}`);
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

  socket.on('testPing', (data) => {
    console.log('🧪 testPing received:', data);
    socket.emit('testPong', { message: 'pong from backend' });
  });

  socket.on('resyncRequest', async ({ matchId }) => {
    const state = await loadMatchState(matchId);
    if (state) {
      socket.emit('resyncMatch', state);
    }
  });

  socket.on('disconnect', () => {
    console.log(`❌ Socket disconnected: ${socket.id}`);
  });
});

app.post('/register-player', async (req, res) => {
  const { username, email, country } = req.body;
  console.log('📨 Incoming registration payload:', req.body);

  if (!username?.trim() || !email?.trim()) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const trimmedUsername = username.trim();
  const trimmedEmail = email.trim();
  const trimmedCountry = country?.trim();

  try {
    const existing = await Player.findOne({ email: trimmedEmail });

    if (existing) {
      console.log(`⚠️ Duplicate registration attempt: ${trimmedEmail}`);
      io.to(trimmedEmail).emit('registrationConfirmed', {
        username: existing.username,
        status: 'existing',
      });
      console.log(`📤 Emitting registrationConfirmed to room: ${trimmedEmail}`);
      return res.status(409).json({ error: 'Player already registered' });
    }

    const newPlayer = new Player({
      username: trimmedUsername,
      email: trimmedEmail,
      country: trimmedCountry,
    });

    await newPlayer.save();
    console.log(`📝 Player saved: ${trimmedUsername} (${trimmedEmail})`);

    io.to(trimmedEmail).emit('registrationConfirmed', {
      username: trimmedUsername,
      status: 'new',
    });
    console.log(`📤 Emitting registrationConfirmed to room: ${trimmedEmail}`);

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

// ✅ New route to trigger match start
app.post("/start-match", (req, res) => {
  const { tournamentId, rom, core } = req.body;

  if (!tournamentId || !rom || !core) {
    return res.status(400).json({ error: "Missing tournamentId, rom, or core" });
  }

  console.log(`🎮 Starting match for tournament ${tournamentId}`);
  io.to(tournamentId).emit("matchStart", { rom, core });
  res.send("Match start emitted");
});