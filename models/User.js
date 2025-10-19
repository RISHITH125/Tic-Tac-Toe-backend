import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const UserSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true, trim:true },
    passwordHash: { type: String, required: true },
}, { timestamps: true });

UserSchema.pre('save', async function(next) {
    if (this.isModified('passwordHash')) {
        const salt = await bcrypt.genSalt(10);
        this.passwordHash = await bcrypt.hash(this.passwordHash, salt);
    }
    next();
});

UserSchema.methods.comparePassword = async function(password) {
    return bcrypt.compare(password, this.passwordHash);
}

const User = mongoose.model('User', UserSchema);
export default User;