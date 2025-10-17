import express from 'express';
import { verifyToken } from '../middlewares/auth.middleware.js';

import { quickMatch } from '../controllers/game.controller.js';

const router = express.Router();

router.post('/quick-match', verifyToken, quickMatch);

export default router;
