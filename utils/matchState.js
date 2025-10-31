const fs = require('fs');
const path = require('path');
let redisClient = null;

function setRedis(client) {
  redisClient = client;
}

function saveMatchState(matchId, matchState) {
  if (redisClient) {
    redisClient.set(`match:${matchId}`, JSON.stringify(matchState))
      .then(() => {
        console.log(`💾 Saved matchState to Redis for ${matchId}`, matchState);
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

module.exports = { saveMatchState, loadMatchState, setRedis };