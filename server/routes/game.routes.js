import express from 'express';
import { verifyToken } from '../middlewares/auth.middleware.js';

import { quickMatch } from '../controllers/game.controller.js';

const gamerouter = express.Router();

gamerouter.post('/quick-match', verifyToken, quickMatch);

export default gamerouter;
