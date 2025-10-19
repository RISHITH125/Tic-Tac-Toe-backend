import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

// dont forget to put the production URI in .env file
const MONGODB__URI = process.env.MONGODB_URI 
const connectDB = async () => {
    try {
        await mongoose.connect(MONGODB__URI);
        console.log("✅ MongoDB connected");
    } catch (error) {
        console.error("❌ MongoDB connection error:", error);
        process.exit(1);
    }
};
export default connectDB;