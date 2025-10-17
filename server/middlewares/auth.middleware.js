import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();
const JWT_SECRET = process.env.JWT_SECRET;
export const verifyToken = (req, res, next) => {
    const authHeader = req.headers.authorization ;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(403).json({ message: "No token provided. Authorization denied." });
    }
    const token = authHeader.split(' ')[1];
    try{
        const decode = jwt.verify(token,JWT_SECRET);
        req.user = decode;
        next();
    } catch (err) {
        return res.status(403).json({ message: "Invalid token. Authorization denied." });
    }
};
