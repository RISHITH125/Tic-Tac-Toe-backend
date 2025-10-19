import express from "express";
import { authenticate, refreshToken} from "../controllers/auth.controller.js";


const authrouter = express.Router();

authrouter.post('/signin', authenticate);
authrouter.post('/refresh', refreshToken);

export default authrouter;
