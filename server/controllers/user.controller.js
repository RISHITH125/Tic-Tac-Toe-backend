import User from "../models/User";

export const getUserProfile = async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-passwordHash');
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.status(200).json({
            status: 'success',
            session:{
                token:req.headers.authorization.split(' ')[1],
                user_id: user._id,
                username: user.username
            }
            
        });
    } catch (error) {
        console.error('❌ Error fetching user profile:', error);
        return res.status(500).json({ error: 'Internal Server Error', details: error && error.message });   
    }
};

