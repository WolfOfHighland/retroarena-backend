const fs = require('fs');
const path = require('path');
const { redis } = require('../server');

function saveMatchState(matchId, matchState) {
  if (redis) {
    redis.set(`match:${matchId}`, JSON.stringify(matchState))
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
  if (redis) {
    try {
      const data = await redis.get(`match:${matchId}`);
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

module.exports = { saveMatchState, loadMatchState };