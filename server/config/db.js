import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

// dont forget to put the production URI in .env file
const MONGODB__URI = "mongodb://localhost:27017/TicTacToeDB";
const connectDB = async () => {
    try {
        await mongoose.connect(MONGODB__URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        console.log("✅ MongoDB connected");
    } catch (error) {
        console.error("❌ MongoDB connection error:", error);
        process.exit(1);
    }
};
export default connectDB;