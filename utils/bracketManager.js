function generateBracket(players, matchSize = 2) {
  const bracket = [];
  for (let i = 0; i < players.length; i += matchSize) {
    const matchPlayers = players.slice(i, i + matchSize);
    if (matchPlayers.length === matchSize) {
      bracket.push(matchPlayers);
    }
  }
  return bracket;
}

function fillWithBye(players) {
  const filled = [...players];
  const hasBye = filled.includes('BYE');
  if (filled.length % 2 !== 0 && !hasBye) {
    filled.push('BYE');
  }
  return filled;
}

function createMatchState(matchId, players, config = {}) {
  return {
    matchId,
    rom: config.rom || 'NHL_95.bin',
    core: config.core || 'genesis_plus_gx',
    goalieMode: config.goalieMode || 'manual_goalie',
    periodLength: config.periodLength || 5,
    players,
  };
}

function advanceWinners(winners, matchSize = 2) {
  const nextRoundPlayers = fillWithBye(winners);
  return generateBracket(nextRoundPlayers, matchSize);
}

module.exports = {
  generateBracket,
  fillWithBye,
  createMatchState,
  advanceWinners,
};