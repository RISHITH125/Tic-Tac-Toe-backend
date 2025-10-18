
class GameState {
    // players: { X: usernameOrObj, O: usernameOrObj }
    constructor(players, roomId) {
        this.id = roomId;

        this.board = Array(9).fill(null); // 3x3 Tic Tac Toe board

        // expect an object with X and O keys
        this.player = {
            X: players?.X ?? null,
            O: players?.O ?? null,
        };

        this.currentTurn = 'X'; // 'X' starts first by default
        this.status = 'ongoing'; // can be 'ongoing', 'draw', 'X_won', 'O_won'
        this.winnerSymbol = null;
        this.winner_username = null;
        this.looser_symbol = null;
        this.looser_username = null;
    }

    // return plain data for serialization
    toJSON() {
        return {
            id: this.id,
            board: this.board,
            player: this.player,
            currentTurn: this.currentTurn,
            status: this.status
        };
    }
    checkWinner() {
        const winningCombinations = [
            [0, 1, 2],
            [3, 4, 5],
            [6, 7, 8],
            [0, 3, 6],
            [1, 4, 7],
            [2, 5, 8],
            [0, 4, 8],
            [2, 4, 6],
        ];
        for (const combination of winningCombinations) {
            const [a, b, c] = combination;
            if (this.board[a] && this.board[a] === this.board[b] && this.board[a] === this.board[c]) {
                this.status = `${this.board[a]}_won`;
                this.winnerSymbol = this.board[a];
                this.winner_username = this.player[this.winnerSymbol];
                this.looser_symbol = this.winnerSymbol === 'X' ? 'O' : 'X';
                this.looser_username = this.player[this.looser_symbol];
                return this.status;
            }
        }
        if (this.board.every(cell => cell)) {
            this.status = 'draw';
        }
        return this.status;
    }

    makeMove(playerSymbol, position ) {
        if (this.status !== 'ongoing') {
            throw new Error('Game has already ended.');
        }
        if (this.board[position] !== null) {
            throw new Error('Invalid move.');
        }
        this.board[position] = playerSymbol;
        this.currentTurn = this.currentTurn === 'X' ? 'O' : 'X';
        
        this.checkWinner();
    }

    resetGame() {
        this.board = Array(9).fill(null);
        this.currentTurn = 'X';
        this.status = 'ongoing';
    }
}

export default GameState;