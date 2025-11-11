const User = require('../models/User');

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
    round: config.round || 1,
    matchIndex: config.matchIndex || 0,
  };
}

function advanceWinners(winners, matchSize = 2) {
  const filled = fillWithBye(winners);
  const bracket = [];

  for (let i = 0; i < filled.length; i += matchSize) {
    const pair = filled.slice(i, i + matchSize);

    if (pair.includes('BYE')) {
      const autoWinner = pair.find(p => p !== 'BYE');
      if (autoWinner) {
        bracket.push([autoWinner]); // auto-advance
      }
    } else {
      bracket.push(pair);
    }
  }

  return bracket;
}

// 🧠 BracketManager class for multi-round orchestration
class BracketManager {
  constructor(io, tournament) {
    this.io = io;
    this.tournament = tournament;
    this.winnersByRound = tournament.winnersByRound || {};
    this.round = Object.keys(this.winnersByRound).length || 1;
  }

  async recordResult(matchId, winnerId) {
    const roundKey = `r${this.round}`;
    if (!this.winnersByRound[roundKey]) {
      this.winnersByRound[roundKey] = [];
    }

    this.winnersByRound[roundKey].push(winnerId);
    this.tournament.winnersByRound = this.winnersByRound;
    await this.tournament.save();

    console.log(`🏆 Winner recorded for ${matchId}: ${winnerId}`);

    const expectedWinners = Math.ceil(this.tournament.maxPlayers / Math.pow(2, this.round));
    if (this.winnersByRound[roundKey].length === expectedWinners) {
      await this.advanceRound();
    }
  }

  async advanceRound() {
    const prevRoundKey = `r${this.round}`;
    const winners = this.winnersByRound[prevRoundKey];
    const nextBracket = advanceWinners(winners);

    this.round += 1;
    const nextRoundKey = `r${this.round}`;
    this.winnersByRound[nextRoundKey] = [];
    this.tournament.winnersByRound = this.winnersByRound;
    await this.tournament.save();

    if (nextBracket.length === 1 && nextBracket[0].length === 1) {
      const champion = nextBracket[0][0];
      console.log(`👑 Champion declared: ${champion}`);
      this.io.emit('tournamentChampion', {
        tournamentId: this.tournament.id,
        champion,
      });

      // 🎁 Reward champion with RRP
      try {
        const user = await User.findOne({ username: champion });
        if (user) {
          user.rrpBalance += 100;
          await user.save();
          console.log(`🎉 ${champion} rewarded with 100 RRP`);
        } else {
          console.warn("⚠️ Champion not found in User collection:", champion);
        }
      } catch (err) {
        console.error("❌ Error rewarding champion:", err);
      }

      return;
    }

    nextBracket.forEach((pair, index) => {
      const matchId = `${this.tournament.id}-r${this.round}-m${index}`;
      const matchState = createMatchState(matchId, pair, {
        rom: this.tournament.rom,
        core: this.tournament.core,
        goalieMode: this.tournament.goalieMode,
        periodLength: this.tournament.periodLength,
        round: this.round,
        matchIndex: index,
      });

      pair.forEach(playerId => {
        this.io.to(playerId).emit('matchStart', matchState);
      });

      console.log(`🎮 Emitted matchStart for ${matchId}`);
    });
  }
}

module.exports = {
  generateBracket,
  fillWithBye,
  createMatchState,
  advanceWinners,
  BracketManager,
};