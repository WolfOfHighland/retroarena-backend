const fs = require('fs');
const path = require('path');
let redisClient = null;

function setRedis(client) {
  redisClient = client;
}

function saveMatchState(matchId, matchState) {
  console.log(`🧪 Calling saveMatchState for ${matchId}`);
  console.log(`🧪 matchState payload:`, matchState);

  if (redisClient) {
    redisClient.set(`match:${matchId}`, JSON.stringify(matchState))
      .then(() => {
        console.log(`💾 Saved matchState to Redis for ${matchId}`, matchState);
        return redisClient.keys('match:*');
      })
      .then(keys => {
        console.log('🧪 Redis keys after save:', keys);
      })
      .catch(err => {
        console.error(`⚠️ Redis save failed for ${matchId}: ${err.message}`);
      });
  } else {
    const filePath = path.join(__dirname, '..', 'data', `${matchId}.json`);
    fs.writeFileSync(filePath, JSON.stringify(matchState, null, 2));
    console.log(`📝 Match state saved locally for ${matchId}`);
  }
}

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
    const filePath = path.join(__dirname, '..', 'data', `${matchId}.json`);
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath);
      return JSON.parse(raw);
    }
    return null;
  }
}

async function loadMatchStatesByTournament(tournamentId) {
  const matchStates = [];

  if (redisClient) {
    try {
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
    const dataDir = path.join(__dirname, '..', 'data');
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
  }

  return matchStates;
}

module.exports = {
  saveMatchState,
  loadMatchState,
  loadMatchStatesByTournament,
  setRedis
};