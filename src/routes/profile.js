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
        const comments = await Comment.find({ post: post._id, parent: null })
            .populate('author', 'username displayName avatar')
            .sort({ created_at: 1 })
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

// Delete profile
router.post('/profile/delete', async (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบ' });

    try {
        const userId = req.session.user.id;

        // Delete all user's posts
        await Post.deleteMany({ author: userId });

        // Delete all user's comments
        await Comment.deleteMany({ author: userId });

        // Delete the user account
        await User.findByIdAndDelete(userId);

        // Destroy session
        req.session.destroy();

        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'เกิดข้อผิดพลาด' });
    }
});

// Get user profile by username (API)
router.get('/api/profile/:username', async (req, res) => {
    try {
        const user = await User.findOne({ username: req.params.username });
        if (!user) return res.status(404).json({ error: 'ไม่พบผู้ใช้' });

        const posts = await Post.find({ author: user._id })
            .populate('author', 'username displayName avatar')
            .sort({ created_at: -1 })
            .limit(10);

        const postsWithComments = await Promise.all(posts.map(async (post) => {
            const comments = await Comment.find({ post: post._id, parent: null })
                .populate('author', 'username displayName avatar')
                .sort({ created_at: 1 })
                .limit(3);
            const commentCount = await Comment.countDocuments({ post: post._id });
            return { ...post.toObject(), comments, commentCount };
        }));

        res.json({
            success: true,
            user: {
                username: user.username,
                displayName: user.displayName,
                bio: user.bio,
                avatar: user.avatar,
                created_at: user.created_at
            },
            posts: postsWithComments
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'เกิดข้อผิดพลาด' });
    }
});

module.exports = router;
