const fs = require('fs');
const path = require('path');
let redisClient = null;

/**
 * Attach a Redis client instance
 */
function setRedis(client) {
  redisClient = client;
}

/**
 * Save a single match state to Redis (preferred) or local file (fallback)
 */
async function saveMatchState(matchId, matchState) {
  console.log(`🧪 Calling saveMatchState for ${matchId}`);
  console.log(`🧪 matchState payload:`, matchState);

  if (redisClient) {
    try {
      await redisClient.set(`match:${matchId}`, JSON.stringify(matchState));
      console.log(`💾 Saved matchState to Redis for ${matchId}`, matchState);

      const keys = await redisClient.keys('match:*');
      console.log('🧪 Redis keys after save:', keys);
    } catch (err) {
      console.error(`⚠️ Redis save failed for ${matchId}: ${err.message}`);
    }
  } else {
    try {
      const dataDir = path.join(__dirname, '..', 'data');
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir);
      }
      const filePath = path.join(dataDir, `${matchId}.json`);
      fs.writeFileSync(filePath, JSON.stringify(matchState, null, 2));
      console.log(`📝 Match state saved locally for ${matchId}`);
    } catch (err) {
      console.error(`⚠️ Local save failed for ${matchId}: ${err.message}`);
    }
  }
}

/**
 * Load a single match state by ID
 */
async function loadMatchState(matchId) {
  if (redisClient) {
    try {
      const data = await redisClient.get(`match:${matchId}`);
      return data ? JSON.parse(data) : null;
    } catch (err) {
      console.error(`⚠️ Redis load failed for ${matchId}: ${err.message}`);
      return null;
    }
  } else {
    try {
      const filePath = path.join(__dirname, '..', 'data', `${matchId}.json`);
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath);
        return JSON.parse(raw);
      }
      return null;
    } catch (err) {
      console.error(`⚠️ Local load failed for ${matchId}: ${err.message}`);
      return null;
    }
  }
}

/**
 * Load all match states for a given tournament
 */
async function loadMatchStatesByTournament(tournamentId) {
  const matchStates = [];

  if (redisClient) {
    try {
      // ⚠️ keys() is fine for small sets; for large sets consider SCAN
      const keys = await redisClient.keys('match:*');
      for (const key of keys) {
        const raw = await redisClient.get(key);
        if (!raw) continue;

        const parsed = JSON.parse(raw);
        if (parsed.tournamentId === tournamentId) {
          matchStates.push(parsed);
        }
      }
    } catch (err) {
      console.error(`⚠️ Redis bulk load failed: ${err.message}`);
    }
  } else {
    try {
      const dataDir = path.join(__dirname, '..', 'data');
      if (!fs.existsSync(dataDir)) return matchStates;

      const files = fs.readdirSync(dataDir);
      for (const file of files) {
        if (!file.endsWith('.json')) continue;

        const filePath = path.join(dataDir, file);
        const raw = fs.readFileSync(filePath);
        const parsed = JSON.parse(raw);

        if (parsed.tournamentId === tournamentId) {
          matchStates.push(parsed);
        }
      }
    } catch (err) {
      console.error(`⚠️ Local bulk load failed: ${err.message}`);
    }
  }

  return matchStates;
}

module.exports = {
  saveMatchState,
  loadMatchState,
  loadMatchStatesByTournament,
  setRedis,
};