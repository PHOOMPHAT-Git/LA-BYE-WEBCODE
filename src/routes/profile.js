const express = require('express');
const User = require('../models/User');
const Post = require('../models/Post');
const Comment = require('../models/Comment');
const router = express.Router();

// Profile page
router.get('/profile', async (req, res) => {
    if (!req.session.user) return res.redirect('/login');

    const user = await User.findById(req.session.user.id);
    if (!user) return res.redirect('/login');

    const posts = await Post.find({ author: user._id })
        .populate('author', 'username displayName avatar')
        .sort({ created_at: -1 });

    const postsWithComments = await Promise.all(posts.map(async (post) => {
        const comments = await Comment.find({ post: post._id })
            .populate('author', 'username displayName avatar')
            .sort({ created_at: -1 })
            .limit(3);
        const commentCount = await Comment.countDocuments({ post: post._id });
        return { ...post.toObject(), comments, commentCount };
    }));

    res.render('profile', { user: req.session.user, profileUser: user, posts: postsWithComments });
});

// Update profile
router.post('/profile/update', async (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบ' });

    const { displayName, bio, avatar } = req.body;

    const updateData = { updated_at: new Date() };
    if (typeof displayName === 'string') updateData.displayName = displayName.trim();
    if (typeof bio === 'string') updateData.bio = bio.trim();
    if (typeof avatar === 'string') updateData.avatar = avatar;

    const user = await User.findByIdAndUpdate(req.session.user.id, updateData, { new: true });

    // Update session
    req.session.user.displayName = user.displayName;
    req.session.user.avatar = user.avatar;

    res.json({ success: true });
});

module.exports = router;
