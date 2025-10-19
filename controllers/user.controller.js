import User from "../models/User.js";
import LeaderBoard from "../models/LeaderBoard.js";
export const getUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-passwordHash");
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    res.status(200).json({
      status: "success",
      session: {
        token: req.headers.authorization.split(" ")[1],
        user_id: user._id,
        username: user.username,
      },
    });
  } catch (error) {
    console.error("❌ Error fetching user profile:", error);
    return res
      .status(500)
      .json({
        error: "Internal Server Error",
        details: error && error.message,
      });
  }
};

export const getLeaderboard = async (req, res) => {
  try {
    const userRating = await LeaderBoard.findOne({ userId: req.user_id });
    const topPlayers = await LeaderBoard.find().sort({ wins: -1 }).limit(10);
    if (!userRating) {
      return res.status(200).json({status:"success", leaderboard: topPlayers, userRating: null});
    }
    res.status(200).json({
      status: "success",
      leaderboard: topPlayers,
      userRating: userRating,
    });
  } catch (error) {
    console.error("❌ Error fetching leaderboard:", error);
    return res
      .status(500)
      .json({
        error: "Internal Server Error",
        details: error && error.message,
      });
  }
};
