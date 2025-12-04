require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const { createAdapter } = require('@socket.io/redis-adapter');
const { createClient } = require('redis');
const cors = require('cors');

const freerollJoinRoutes = require("./routes/freeroll-join");
const webhookRoutes = require('./routes/webhooks');
const freerollRoutes = require('./routes/freeroll');

const seedOpeningDay = require('./scripts/seedOpeningDay');
const seedSitNGo = require('./scripts/seedSitNGo');
const seedFreerolls = require('./scripts/freerollSeed');
const { saveMatchState, loadMatchState, setRedis } = require('./utils/matchState');
const { emitTournamentSchedule, scheduleAllTournaments, watchSitNGoTables } = require('./scheduler/emitTournamentSchedule');

const Player = require('./models/Player');
const Tournament = require('./models/Tournament');

const app = express();

// ✅ Define allowed origins once
const allowedOrigins = [
  "https://retrorumblearena.com",
  "https://www.retrorumblearena.com",
  "http://localhost:3000"
];
const vercelRegex = /\.vercel\.app$/;

// ✅ Express CORS middleware
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin) || vercelRegex.test(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  methods: ["GET", "POST", "OPTIONS"],
  credentials: true,
}));

app.use(express.json());

const server = http.createServer(app);

// ✅ Socket.IO CORS config (no regex here, just explicit list)
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
  },
});
module.exports.io = io;

const testJoinRoutes = require("./routes/testJoin")(io);
const leaderboardRoutes = require('./routes/leaderboard')(io);

// … rest of your routes …

app.use('/api', (req, _res, next) => {
  console.log(`➡️ API ${req.method} ${req.originalUrl}`);
  next();
});

// ✅ Redis setup
let redis;
if (process.env.REDIS_URL) {
  const pubClient = createClient({ url: process.env.REDIS_URL });
  const subClient = pubClient.duplicate();
  redis = pubClient;
  setRedis(redis);

  (async () => {
    try {
      await pubClient.connect();
      await subClient.connect();
      io.adapter(createAdapter(pubClient, subClient));
      console.log('🔌 Redis adapter connected');
    } catch (err) {
      console.error('⚠️ Redis failed:', err.message);
    }
  })();
} else {
  console.log('⚠️ No REDIS_URL provided — skipping Redis adapter');
}

// ✅ MongoDB setup
if (process.env.MONGO_URI) {
  mongoose.connect(process.env.MONGO_URI, { dbName: 'retro_rumble' })
    .then(async () => {
      console.log('✅ Connected to MongoDB');

      // Clean up any past tournaments that never filled
      await Tournament.deleteMany({
        startTime: { $lt: new Date() },
        registeredPlayers: []
      });

      // Seed scripts
      try {
        await seedOpeningDay();
        await seedSitNGo();
        await seedFreerolls();
        console.log('✅ Seeding complete');
      } catch (err) {
        console.error('⚠️ Seeding error:', err);
      }
    })
    .catch((err) => {
      console.error('⚠️ MongoDB connection failed:', err.message);
    });
} else {
  console.log('⚠️ No MONGO_URI provided — skipping MongoDB connection');
}
   // Kick off schedulers
emitTournamentSchedule(io);
watchSitNGoTables(io);
}).catch((err) => {
  console.error('⚠️ MongoDB connection failed:', err.message);
});
} else {
  console.log('⚠️ No MONGO_URI provided — skipping MongoDB connection');
}

app.post('/register-player', async (req, res) => {
  const { username, email, country, socketId } = req.body;
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
      if (roomExists) {
        io.to(trimmedEmail).emit('registrationConfirmed', emitPayload);
      } else if (socketId) {
        io.to(socketId).emit('registrationConfirmed', emitPayload);
      }
      return res.status(409).json({ error: 'Player already registered' });
    }

    const newPlayer = new Player({ username: trimmedUsername, email: trimmedEmail, country: trimmedCountry });
    await newPlayer.save();

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

// ✅ Freeroll join route with matchmaker logic
app.post("/api/freeroll/register/:id", async (req, res) => {
  const tournamentId = req.params.id;
  const { playerId } = req.body;

  try {
    const tournament = await Tournament.findOne({ id: tournamentId });
    if (!tournament) {
      return res.status(404).json({ error: "Tournament not found" });
    }

    if (!tournament.registeredPlayers.includes(playerId)) {
      tournament.registeredPlayers.push(playerId);
      await tournament.save();
    }

    const playersJoined = tournament.registeredPlayers.length;
    const maxPlayers = tournament.maxPlayers || null;

    if (maxPlayers && playersJoined >= maxPlayers) {
      return res.json({
        matchId: tournament.id,
        playersJoined,
        maxPlayers,
      });
    } else {
      return res.json({
        matchId: null,
        playersJoined,
        maxPlayers,
      });
    }
  } catch (err) {
    console.error("❌ Freeroll join error:", err.message);
    return res.status(500).json({ error: "Failed to join freeroll" });
  }
});

// ✅ Sit-n-Go join route with matchmaker logic
app.post("/api/sit-n-go/join/:id", async (req, res) => {
  const tableId = req.params.id;
  const { playerId } = req.body;

  try {
    const table = await Tournament.findOne({ id: tableId });
    if (!table) {
      return res.status(404).json({ error: "Sit-n-Go table not found" });
    }

    if (!table.registeredPlayers.includes(playerId)) {
      table.registeredPlayers.push(playerId);
      await table.save();
    }

    const playersJoined = table.registeredPlayers.length;
    const maxPlayers = table.maxPlayers || null;

    if (maxPlayers && playersJoined >= maxPlayers) {
      return res.json({
        matchId: table.id,
        playersJoined,
        maxPlayers,
      });
    } else {
      return res.json({
        matchId: null,
        playersJoined,
        maxPlayers,
      });
    }
  } catch (err) {
    console.error("❌ Sit-n-Go join error:", err.message);
    return res.status(500).json({ error: "Failed to join Sit-n-Go" });
  }
});

// ✅ Scheduled tournament join route with matchmaker logic
app.post("/api/tournaments/join/:id", async (req, res) => {
  const tournamentId = req.params.id;
  const { playerId } = req.body;

  try {
    const tournament = await Tournament.findOne({ id: tournamentId });
    if (!tournament) {
      return res.status(404).json({ error: "Tournament not found" });
    }

    if (!tournament.registeredPlayers.includes(playerId)) {
      tournament.registeredPlayers.push(playerId);
      await tournament.save();
    }

    const playersJoined = tournament.registeredPlayers.length;
    const maxPlayers = tournament.maxPlayers || null;

    if (maxPlayers && playersJoined >= maxPlayers) {
      return res.json({
        matchId: tournament.id,
        playersJoined,
        maxPlayers,
      });
    } else {
      return res.json({
        matchId: null,
        playersJoined,
        maxPlayers,
      });
    }
  } catch (err) {
    console.error("❌ Tournament join error:", err.message);
    return res.status(500).json({ error: "Failed to join tournament" });
  }
});

// ✅ Start match route with netplay wiring
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
      rom: `/roms/${rom}`,
      core,
      goalieMode: tournament.goalieMode || "manual",
      periodLength: tournament.periodLength || 5,
      matchId: tournamentId,
      tournamentId,
    };

    await saveMatchState(tournamentId, matchState);

    // ✅ Delay emit to ensure sockets join rooms
    setTimeout(() => {
      const players = tournament.registeredPlayers || [];
      players.forEach((playerId, index) => {
        const payload = {
          ...matchState,
          netplayMode: index === 0 ? "host" : "client",
          netplayHost: index === 0 ? undefined : "wss://retroarena-backend.onrender.com:55435",
          playerName: playerId,
        };
        io.to(playerId).emit("matchStart", payload);
        console.log(`📡 Emitted matchStart with netplay to ${playerId}`, payload);
      });
    }, 1000);

    return res.status(200).json({
      ok: true,
      message: "Match start emitted",
      matchState,
    });
  } catch (err) {
    console.error("❌ Failed to start match:", err.message);
    return res.status(500).json({ error: "Failed to start match" });
  }
});

// ✅ Route logging
app._router.stack
  .filter(r => r.route)
  .forEach(r => {
    const method = Object.keys(r.route.methods)[0].toUpperCase();
    const path = r.route.path;
    console.log(`🔍 Mounted route: ${method} ${path}`);
  });

const PORT = process.env.PORT || 10000;

server.listen(PORT, () => {
  console.log(`🚀 Server listening on port ${PORT}`);
  console.log(`==> Your service is live 🎉`);
  console.log(`==>`);
  console.log(`==> ///////////////////////////////////////////////////////////`);
  console.log(`==>`);
  console.log(`==> Available at your primary URL https://retroarena-backend.onrender.com`);
  console.log(`==>`);
  console.log(`==> ///////////////////////////////////////////////////////////`);
});