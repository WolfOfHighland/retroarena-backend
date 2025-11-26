const User = require('../models/User');
const { saveMatchState } = require('../utils/matchStateUtils'); // <-- import your utils

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

    // Count matches in this round to know when to advance
    const currentBracket = generateBracket(this.winnersByRound[roundKey]);
    const expectedWinners = currentBracket.length;

    if (this.winnersByRound[roundKey].length >= expectedWinners) {
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

    // Champion check
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

    // Emit next round matches
    nextBracket.forEach((pair, index) => {
      const matchId = `${this.tournament.id}-r${this.round}-m${index}`;
      const matchState = createMatchState(matchId, pair, {
        rom: this.tournament.rom,
        core: this.tournament.core,
        goalieMode: this.tournament.goalieMode,
        periodLength: this.tournament.periodLength,
        round: this.round,
        matchIndex: index,
        tournamentId: this.tournament.id, // <-- ensure tournamentId is included
      });

      // 🔑 Persist match state immediately
      saveMatchState(matchId, matchState);

      pair.forEach(playerId => {
        if (playerId !== 'BYE') {
          this.io.to(playerId).emit('matchStart', matchState);
        }
      });

      console.log(`🎮 Emitted & saved matchStart for ${matchId}`);
    });
  }
}