import User from "../models/User.js";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();
const JWT_SECRET = process.env.JWT_SECRET;

export const authenticate = async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' });
    }
    try {
        const user = await User.findOne({ username });
        if (!user) {
            // create new user
            const newUser = new User({ username, passwordHash: password });
            await newUser.save();
            const token = jwt.sign({ id: newUser._id, username: newUser.username }, JWT_SECRET, { expiresIn: '7d' });
            console.log('✅ New user created:', username);
            return res.status(201).json({ status: 'success', session:{
                token:token,
                user_id: newUser._id,
                username: newUser.username
            } });
        }
        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            return res.status(401).json({ error: 'Invalid username or password' });
        }   
        const token = jwt.sign({ id: user._id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
        console.log('✅ User authenticated:', username);
        return res.status(200).json({ status: 'success', session: {
            token: token,
            user_id: user._id,
            username: user.username
        } });
    }
    catch (error) {
        console.error('❌ Error during authentication:', error);
        return res.status(500).json({ error: 'Internal Server Error', details: error && error.message });
    }
};

export const refreshToken = (req, res) => {
    const { token } = req.body;
    if (!token) {
        return res.status(400).json({ error: 'Token is required' });
    }
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const newToken = jwt.sign({ id: decoded.id, username: decoded.username }, JWT_SECRET, { expiresIn: '7d' });
        return res.status(200).json({ status: 'success', token: newToken });
    }   
    catch (error) {
        console.error('❌ Error during token refresh:', error);
        return res.status(500).json({ error: 'Internal Server Error', details: error && error.message });
    }
};
