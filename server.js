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
const { saveMatchState, setRedis } = require('./utils/matchState');
const { emitTournamentSchedule, watchSitNGoTables } = require('./scheduler/emitTournamentSchedule');

const Player = require('./models/Player');
const Tournament = require('./models/Tournament');

const app = express();

// ✅ Allowed origins
const allowedOrigins = [
  "https://retrorumblearena.com",
  "https://www.retrorumblearena.com",
  "http://localhost:3000"
];
const vercelRegex = /\.vercel\.app$/;

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
const io = new Server(server, {
  cors: { origin: allowedOrigins, methods: ["GET", "POST"] },
});
module.exports.io = io;

const testJoinRoutes = require("./routes/testJoin")(io);
const leaderboardRoutes = require('./routes/leaderboard')(io);

app.use('/api', (req, _res, next) => {
  console.log(`➡️ API ${req.method} ${req.originalUrl}`);
  next();
});

// ✅ Redis setup
if (process.env.REDIS_URL) {
  const pubClient = createClient({ url: process.env.REDIS_URL });
  const subClient = pubClient.duplicate();
  setRedis(pubClient);

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

// ✅ MongoDB + seeding
if (process.env.MONGO_URI) {
  mongoose.connect(process.env.MONGO_URI, {
    dbName: 'retro_rumble',
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(async () => {
    console.log('✅ Connected to MongoDB');

    await Tournament.deleteMany({
      type: "scheduled",
      startTime: { $lt: new Date() },
      registeredPlayers: []
    });

    try {
      await seedOpeningDay();
      await seedSitNGo();
      await seedFreerolls();

      // ✅ Guarantee 3 lobby objects exist
      const tournaments = await Tournament.find({});
      for (const t of tournaments) {
        const needsInit =
          !Array.isArray(t.lobbies) ||
          t.lobbies.length !== 3 ||
          t.lobbies.some(l => !l || typeof l !== "object" || !Array.isArray(l.players));

        if (needsInit) {
          t.lobbies = [
            { id: `${t._id}-lobby1`, name: "Lobby 1", players: [], status: "waiting" },
            { id: `${t._id}-lobby2`, name: "Lobby 2", players: [], status: "waiting" },
            { id: `${t._id}-lobby3`, name: "Lobby 3", players: [], status: "waiting" }
          ];
          await t.save();
          console.log(`✅ Tournament ${t.id || t._id} initialized with 3 lobby objects`);
        }
      }

      console.log('✅ Seeding complete with persistent lobbies');
    } catch (err) {
      console.error('⚠️ Seeding error:', err);
    }

    emitTournamentSchedule(io);
    watchSitNGoTables(io);
  })
  .catch((err) => {
    console.error('⚠️ MongoDB connection failed:', err.message);
  });
} else {
  console.log('⚠️ No MONGO_URI provided — skipping MongoDB connection');
}

// ✅ Dynamic lobby assignment
function assignToLobby(tournament, playerId) {
  if (!Array.isArray(tournament.lobbies)) {
    tournament.lobbies = [];
  }

  const perLobbyCap = tournament.maxPlayersPerLobby > 0
    ? tournament.maxPlayersPerLobby
    : (tournament.maxPlayers > 0 ? tournament.maxPlayers : 2);

  let target = tournament.lobbies.find(l => (l.players?.length || 0) < perLobbyCap);

  if (!target) {
    const lobbyNumber = tournament.lobbies.length + 1;
    target = {
      id: `${tournament._id}-lobby${lobbyNumber}`,
      name: `Lobby ${lobbyNumber}`,
      players: [],
      status: "waiting"
    };
    tournament.lobbies.push(target);
  }

  target.players = Array.isArray(target.players) ? target.players : [];
  if (!target.players.includes(playerId)) target.players.push(playerId);
}

// ✅ Start condition helper
function shouldStartTournament(tournament) {
  if (tournament.type === "freeroll" || tournament.type === "sit-n-go") {
    return tournament.registeredPlayers.length >= tournament.maxPlayers;
  }
  if (tournament.type === "scheduled") {
    return tournament.startTime && new Date(tournament.startTime).getTime() <= Date.now();
  }
  return false;
}

// ✅ Freeroll join
app.post("/api/freeroll/register/:id", async (req, res) => {
  const tournamentId = req.params.id;
  const { playerId } = req.body;

  try {
    const tournament = await Tournament.findOne({ id: tournamentId });
    if (!tournament) return res.status(404).json({ error: "Tournament not found" });

    if (!tournament.registeredPlayers.includes(playerId)) {
      tournament.registeredPlayers.push(playerId);
      assignToLobby(tournament, playerId);
      await tournament.save();
    }

    if (shouldStartTournament(tournament)) {
      tournament.hasStarted = true;
      await tournament.save();
    }

    return res.json({
      matchId: tournament.hasStarted ? tournament.id : null,
      playersJoined: tournament.registeredPlayers.length,
      maxPlayers: tournament.maxPlayers || null,
    });
  } catch (err) {
    console.error("❌ Freeroll join error:", err.message);
    return res.status(500).json({ error: "Failed to join freeroll" });
  }
});

// ✅ Sit-n-Go join
app.post("/api/sit-n-go/join/:id", async (req, res) => {
  const tableId = req.params.id;
  const { playerId } = req.body;

  try {
    const table = await Tournament.findOne({ id: tableId });
    if (!table) return res.status(404).json({ error: "Sit-n-Go table not found" });

    if (!table.registeredPlayers.includes(playerId)) {
      table.registeredPlayers.push(playerId);
      assignToLobby(table, playerId);
      await table.save();
    }

    if (shouldStartTournament(table)) {
      table.hasStarted = true;
      await table.save();
    }

    return res.json({
      matchId: table.hasStarted ? table.id : null,
      playersJoined: table.registeredPlayers.length,
      maxPlayers: table.maxPlayers || null,
    });
  } catch (err) {
    console.error("❌ Sit-n-Go join error:", err.message);
    return res.status(500).json({ error: "Failed to join Sit-n-Go" });
  }
});

// ✅ Scheduled tournament join
app.post("/api/tournaments/join/:id", async (req, res) => {
  const tournamentId = req.params.id;
  const { playerId } = req.body;

  try {
    const tournament = await Tournament.findOne({ id: tournamentId });
    if (!tournament) return res.status(404).json({ error: "Tournament not found" });

    if (!tournament.registeredPlayers.includes(playerId)) {
      tournament.registeredPlayers.push(playerId);
      assignToLobby(tournament, playerId);
      await tournament.save();
    }

    if (shouldStartTournament(tournament)) {
      tournament.hasStarted = true;
      await tournament.save();
    }

    return res.json({
      matchId: tournament.hasStarted ? tournament.id : null,
      playersJoined: tournament.registeredPlayers.length,
      maxPlayers: tournament.maxPlayers || null,
    });
  } catch (err) {
    console.error("❌ Tournament join error:", err.message);
    return res.status(500).json({ error: "Failed to join tournament" });
  }
});

// ✅ Start match route
app.post("/start-match", async (req, res) => {
  const { tournamentId, rom, core } = req.body;
  if (!tournamentId || !rom || !core) {
    return res.status(400).json({ error: "Missing tournamentId, rom, or core" });
  }

  try {
    const tournament = await Tournament.findOne({ id: tournamentId });
    if (!tournament) return res.status(404).json({ error: "Tournament not found" });

    const matchState = {
      rom: `/roms/${rom}`,
      core,
      goalieMode: tournament.goalieMode || "manual",
      periodLength: tournament.periodLength || 5,
      matchId: tournamentId,
      tournamentId,
    };

    await saveMatchState(tournamentId, matchState);

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

// ✅ Tournament list routes (for frontend to fetch lobbies)
app.get("/api/tournaments", async (req, res) => {
  try {
    const tournaments = await Tournament.find().lean();
    const shaped = tournaments.map(t => ({
      id: t.id || t._id.toString(),
      name: t.name,
      startTime: t.startTime ?? null,
      entryFee: t.entryFee ?? 0,
      registeredPlayers: Array.isArray(t.registeredPlayers) ? t.registeredPlayers : [],
      maxPlayers: t.maxPlayers ?? null,
      prizeType: t.prizeType ?? "fixed",
      prizeAmount: t.prizeAmount ?? 0,
      game: t.game,
      goalieMode: t.goalieMode ?? "manual",
      periodLength: t.periodLength ?? 5,
      elimination: t.elimination ?? "single",
      isLive: t.isLive ?? false,
      hasStarted: t.hasStarted ?? false,
      type: t.type,
      lobbies: Array.isArray(t.lobbies) ? t.lobbies : []
    }));
    res.json(shaped);
  } catch (err) {
    console.error("❌ Failed to fetch tournaments:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// Specific feeds first
app.get("/api/tournaments/scheduled", async (req, res) => {
  const tournaments = await Tournament.find({ type: "scheduled" }).lean();
  res.json(tournaments);
});

app.get("/api/tournaments/freeroll", async (req, res) => {
  const tournaments = await Tournament.find({ type: "freeroll" }).lean();
  res.json(tournaments);
});

app.get("/api/tournaments/sit-n-go", async (req, res) => {
  const tournaments = await Tournament.find({ type: "sit-n-go" }).lean();
  res.json(tournaments);
});

// Catch-all by ID last (only once!)
app.get("/api/tournaments/:id", async (req, res) => {
  try {
    const t = await Tournament.findOne({ id: req.params.id }).lean();
    if (!t) return res.status(404).json({ error: "Tournament not found" });

    const shaped = {
      id: t.id || t._id.toString(),
      name: t.name,
      startTime: t.startTime ?? null,
      entryFee: t.entryFee ?? 0,
      registeredPlayers: Array.isArray(t.registeredPlayers) ? t.registeredPlayers : [],
      maxPlayers: t.maxPlayers ?? null,
      prizeType: t.prizeType ?? "fixed",
      prizeAmount: t.prizeAmount ?? 0,
      game: t.game,
      goalieMode: t.goalieMode ?? "manual",
      periodLength: t.periodLength ?? 5,
      elimination: t.elimination ?? "single",
      isLive: t.isLive ?? false,
      hasStarted: t.hasStarted ?? false,
      type: t.type,
      lobbies: Array.isArray(t.lobbies) ? t.lobbies : []
    };

    res.json(shaped);
  } catch (err) {
    console.error("❌ Failed to fetch tournament:", err.message);
    res.status(500).json({ error: "Server error" });
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