const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true, trim: true },
    displayName: { type: String, trim: true, default: '' },
    email: { type: String, required: true, unique: true, trim: true, lowercase: true },
    password: { type: String, required: true },
    bio: { type: String, trim: true, default: '' },
    avatar: { type: String, default: '' },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now }
});

module.exports = mongoose.models.User || mongoose.model('User', UserSchema, 'users');
