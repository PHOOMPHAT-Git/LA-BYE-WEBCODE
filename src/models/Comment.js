const mongoose = require('mongoose');

const CommentSchema = new mongoose.Schema({
    post: { type: mongoose.Schema.Types.ObjectId, ref: 'Post', required: true },
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    content: { type: String, required: true, trim: true },
    isAnonymous: { type: Boolean, default: false },
    created_at: { type: Date, default: Date.now }
});

module.exports = mongoose.models.Comment || mongoose.model('Comment', CommentSchema, 'comments');
