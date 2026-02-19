const express = require('express');
const mongoose = require('mongoose');
const User = require('../models/User');
const Post = require('../models/Post');
const Comment = require('../models/Comment');
const router = express.Router();

async function fetchUserPosts(authorId, userId, limit) {
    const userObjId = userId ? new mongoose.Types.ObjectId(userId) : null;

    const pipeline = [
        { $match: { author: authorId } },
        { $sort: { created_at: -1 } },
        ...(limit ? [{ $limit: limit }] : []),
        { $lookup: { from: 'users', localField: 'author', foreignField: '_id', as: '_author' } },
        { $unwind: '$_author' },
        { $addFields: {
            liked: userObjId ? { $in: [userObjId, '$likedBy'] } : false,
            author: {
                _id: '$_author._id',
                username: '$_author.username',
                displayName: '$_author.displayName',
                avatar: '$_author.avatar'
            }
        }},
        { $project: { likedBy: 0, _author: 0, __v: 0 } }
    ];

    const posts = await Post.aggregate(pipeline);
    if (!posts.length) return [];

    const postIds = posts.map(p => p._id);

    const [allComments, commentCounts] = await Promise.all([
        Comment.aggregate([
            { $match: { post: { $in: postIds }, parent: null } },
            { $sort: { created_at: 1 } },
            { $lookup: { from: 'users', localField: 'author', foreignField: '_id', as: '_author' } },
            { $unwind: '$_author' },
            { $addFields: {
                liked: userObjId ? { $in: [userObjId, '$likedBy'] } : false,
                author: {
                    _id: '$_author._id',
                    username: '$_author.username',
                    displayName: '$_author.displayName',
                    avatar: '$_author.avatar'
                }
            }},
            { $project: { likedBy: 0, _author: 0, __v: 0 } },
            { $group: { _id: '$post', comments: { $push: '$$ROOT' } } },
            { $project: { comments: { $slice: ['$comments', 3] } } }
        ]),
        Comment.aggregate([
            { $match: { post: { $in: postIds } } },
            { $group: { _id: '$post', count: { $sum: 1 } } }
        ])
    ]);

    const countMap = {};
    commentCounts.forEach(c => { countMap[c._id.toString()] = c.count; });

    const commentMap = {};
    allComments.forEach(g => { commentMap[g._id.toString()] = g.comments; });

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

    const postsWithComments = await fetchUserPosts(user._id, req.session.user.id, null);

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

        const userId = req.session.user ? req.session.user.id : null;
        const postsWithComments = await fetchUserPosts(user._id, userId, 10);

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
