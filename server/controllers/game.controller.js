import User from "../models/User.js";
import { socketHandler } from "../socket/game.socket.js";


export const quickMatch = async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-passwordHash');
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        try{
            await socketHandler(user._id.toString());
            console.log(`🔔 Quick match requested by user: ${user.username} (${user._id})`);
            return res.status(200).json({ status: 'success', message: 'Quick match initiated. Check your socket connection for updates.' });
        }
        catch(err){
            console.error('❌ Error initiating quick match via socket:', err);
            return res.status(500).json({ error: 'Internal Server Error', details: err && err.message });
        }
    }
    catch(err){
        console.error('❌ Error fetching user data:', err);
        return res.status(500).json({ error: 'Internal Server Error', details: err && err.message });
    }
}