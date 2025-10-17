import express from 'express';
import { verifyToken } from '../middlewares/auth.middleware.js';
import { getUserProfile } from '../controllers/user.controller.js';

const router = express.Router();
router.get('/profile', verifyToken, getUserProfile);
export default router;
