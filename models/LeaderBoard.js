import mongoose from 'mongoose';

const LeaderBoardSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true, trim: true },
    wins: { type: Number, default: 0 },
    losses: { type: Number, default: 0 },
    draws: { type: Number, default: 0 },
    totalPoints: { type: Number, default: 0 },
}, { timestamps: true });

const LeaderBoard = mongoose.model('LeaderBoard', LeaderBoardSchema);
export default LeaderBoard;