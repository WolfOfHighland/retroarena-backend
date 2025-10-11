const fs = require('fs');
const path = require('path');

function saveMatchState(tournamentId, matchState) {
  const filePath = path.join(__dirname, '..', 'data', `${tournamentId}.json`);
  fs.writeFileSync(filePath, JSON.stringify(matchState, null, 2));
  console.log(`📝 Match state saved for ${tournamentId}`);
}

module.exports = { saveMatchState };