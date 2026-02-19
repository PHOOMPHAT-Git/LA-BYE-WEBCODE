const express = require('express');
const User = require('../models/User');
const Post = require('../models/Post');
const Comment = require('../models/Comment');
const router = express.Router();

async function enrichPostsWithComments(posts) {
    if (!posts.length) return [];

    const postIds = posts.map(p => p._id);

    const [allComments, commentCounts] = await Promise.all([
        Comment.find({ post: { $in: postIds }, parent: null })
            .populate('author', 'username displayName avatar')
            .sort({ created_at: 1 })
            .lean(),
        Comment.aggregate([
            { $match: { post: { $in: postIds } } },
            { $group: { _id: '$post', count: { $sum: 1 } } }
        ])
    ]);

    const countMap = {};
    commentCounts.forEach(c => { countMap[c._id.toString()] = c.count; });

    const commentMap = {};
    allComments.forEach(c => {
        const pid = c.post.toString();
        if (!commentMap[pid]) commentMap[pid] = [];
        if (commentMap[pid].length < 3) commentMap[pid].push(c);
    });

    return posts.map(post => ({
        ...post,
        comments: commentMap[post._id.toString()] || [],
        commentCount: countMap[post._id.toString()] || 0
    }));
}

// Profile page
router.get('/profile', async (req, res) => {
    if (!req.session.user) return res.redirect('/login');

    const user = await User.findById(req.session.user.id).lean();
    if (!user) return res.redirect('/login');

    const posts = await Post.find({ author: user._id })
        .populate('author', 'username displayName avatar')
        .sort({ created_at: -1 })
        .lean();

    const postsWithComments = await enrichPostsWithComments(posts);

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

        await Promise.all([
            Post.deleteMany({ author: userId }),
            Comment.deleteMany({ author: userId }),
            User.findByIdAndDelete(userId)
        ]);

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
        const user = await User.findOne({ username: req.params.username }).lean();
        if (!user) return res.status(404).json({ error: 'ไม่พบผู้ใช้' });

        const posts = await Post.find({ author: user._id })
            .populate('author', 'username displayName avatar')
            .sort({ created_at: -1 })
            .limit(10)
            .lean();

        const postsWithComments = await enrichPostsWithComments(posts);

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
