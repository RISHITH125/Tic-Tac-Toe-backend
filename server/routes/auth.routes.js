import express from "express";
import { authenticate, refreshToken} from "../controllers/auth.controller.js";


const router = express.Router();

router.post('/signin', authenticate);
router.post('/refresh', refreshToken);

export default router;
