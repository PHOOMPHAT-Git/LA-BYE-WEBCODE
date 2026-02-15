const express = require('express');
const Comment = require('../models/Comment');
const Post = require('../models/Post');
const router = express.Router();

// Add comment
router.post('/comment/create', async (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบ' });

    const { postId, content, isAnonymous } = req.body;
    if (!content || !postId) return res.status(400).json({ error: 'กรุณาเขียนความคิดเห็น' });

    const post = await Post.findById(postId);
    if (!post) return res.status(404).json({ error: 'ไม่พบโพสต์' });

    const comment = await Comment.create({
        post: postId,
        author: req.session.user.id,
        content,
        isAnonymous: isAnonymous === true || isAnonymous === 'true'
    });

    const populated = await comment.populate('author', 'username displayName avatar');

    res.json({
        success: true,
        comment: {
            _id: populated._id,
            content: populated.content,
            isAnonymous: populated.isAnonymous,
            author: populated.author,
            created_at: populated.created_at
        }
    });
});

// Delete comment
router.post('/comment/:id/delete', async (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบ' });

    const comment = await Comment.findById(req.params.id);
    if (!comment) return res.status(404).json({ error: 'ไม่พบความคิดเห็น' });

    const isAdmin = req.session.user.email === 'phomphat385@gmail.com';
    if (comment.author.toString() !== req.session.user.id && !isAdmin) {
        return res.status(403).json({ error: 'ไม่มีสิทธิ์ลบความคิดเห็นนี้' });
    }

    await Comment.findByIdAndDelete(req.params.id);
    res.json({ success: true });
});

// Get all comments for a post
router.get('/comments/:postId', async (req, res) => {
    const comments = await Comment.find({ post: req.params.postId })
        .populate('author', 'username displayName avatar')
        .sort({ created_at: 1 });

    res.json({ comments });
});

module.exports = router;
