const mongoose = require('mongoose');

const CommentSchema = new mongoose.Schema({
    post: { type: mongoose.Schema.Types.ObjectId, ref: 'Post', required: true },
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    parent: { type: mongoose.Schema.Types.ObjectId, ref: 'Comment', default: null },
    content: { type: String, trim: true, default: '' },
    image: { type: String, default: '' },
    isAnonymous: { type: Boolean, default: false },
    likes: { type: Number, default: 0 },
    likedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    replyCount: { type: Number, default: 0 },
    created_at: { type: Date, default: Date.now }
});

CommentSchema.index({ post: 1, parent: 1, created_at: 1 });
CommentSchema.index({ parent: 1, created_at: 1 });
CommentSchema.index({ post: 1 });

module.exports = mongoose.models.Comment || mongoose.model('Comment', CommentSchema, 'comments');
