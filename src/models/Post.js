const mongoose = require('mongoose');

const PostSchema = new mongoose.Schema({
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    content: { type: String, trim: true, default: '' },
    image: { type: String, default: '' },
    isAnonymous: { type: Boolean, default: false },
    likes: { type: Number, default: 0 },
    likedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    commentCount: { type: Number, default: 0 },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now }
});

module.exports = mongoose.models.Post || mongoose.model('Post', PostSchema, 'posts');
