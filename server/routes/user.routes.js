import express from 'express';
import { verifyToken } from '../middlewares/auth.middleware.js';
import { getUserProfile } from '../controllers/user.controller.js';
import { getLeaderboard } from '../controllers/user.controller.js';

const clientRouter = express.Router();
clientRouter.get('/profile', verifyToken, getUserProfile);
clientRouter.get('/leaderboard', getLeaderboard);
export default clientRouter;
