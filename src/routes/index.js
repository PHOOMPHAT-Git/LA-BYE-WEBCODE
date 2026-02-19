const express = require('express');
const Post = require('../models/Post');
const Comment = require('../models/Comment');
const User = require('../models/User');
const router = express.Router();

const POSTS_PER_PAGE = 10;

async function enrichPostsWithComments(posts) {
    if (!posts.length) return [];

    const postIds = posts.map(p => p._id);

    // Run comments and counts in parallel
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

// Feed page
router.get('/', async (req, res) => {
    const posts = await Post.find()
        .populate('author', 'username displayName avatar')
        .sort({ created_at: -1 })
        .limit(POSTS_PER_PAGE)
        .lean();

    const postsWithComments = await enrichPostsWithComments(posts);
    const hasMore = posts.length === POSTS_PER_PAGE;

    // API request for load more
    if (req.query.page) {
        return res.json({ posts: postsWithComments, hasMore });
    }

    res.render('index', { user: req.session.user, posts: postsWithComments, hasMore });
});

// API: Load more posts
router.get('/api/posts', async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const skip = (page - 1) * POSTS_PER_PAGE;

    const posts = await Post.find()
        .populate('author', 'username displayName avatar')
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(POSTS_PER_PAGE)
        .lean();

    const postsWithComments = await enrichPostsWithComments(posts);
    const hasMore = posts.length === POSTS_PER_PAGE;
    res.json({ posts: postsWithComments, hasMore });
});

// Create post
router.post('/post/create', async (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบ' });

    // Rate limit: 3 seconds between posts
    const now = Date.now();
    if (req.session._lastPostAt && now - req.session._lastPostAt < 3000) {
        return res.status(429).json({ error: 'กรุณารอสักครู่ก่อนโพสต์อีกครั้ง' });
    }
    req.session._lastPostAt = now;

    const { content, image, isAnonymous } = req.body;
    if (!content && !image) return res.status(400).json({ error: 'กรุณาเขียนข้อความหรือแนบรูป' });

    await Post.create({
        author: req.session.user.id,
        content: content || '',
        image: image || '',
        isAnonymous: isAnonymous === true || isAnonymous === 'true'
    });

    res.json({ success: true });
});

// Delete post
router.post('/post/:id/delete', async (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบ' });

    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ error: 'ไม่พบโพสต์' });

    const isAdmin = req.session.user.email === 'phomphat385@gmail.com';
    if (post.author.toString() !== req.session.user.id && !isAdmin) {
        return res.status(403).json({ error: 'ไม่มีสิทธิ์ลบโพสต์นี้' });
    }

    await Promise.all([
        Comment.deleteMany({ post: post._id }),
        Post.findByIdAndDelete(req.params.id)
    ]);
    res.json({ success: true });
});

// Edit post
router.post('/post/:id/edit', async (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบ' });

    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ error: 'ไม่พบโพสต์' });

    const isAdmin = req.session.user.email === 'phomphat385@gmail.com';
    if (post.author.toString() !== req.session.user.id && !isAdmin) {
        return res.status(403).json({ error: 'ไม่มีสิทธิ์แก้ไขโพสต์นี้' });
    }

    post.content = req.body.content || '';
    post.updated_at = Date.now();
    await post.save();
    res.json({ success: true });
});

// Like/unlike post - atomic operation
router.post('/post/:id/like', async (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบ' });

    const userId = req.session.user.id;

    // Try to add like (if not already liked)
    const addResult = await Post.findOneAndUpdate(
        { _id: req.params.id, likedBy: { $ne: userId } },
        { $push: { likedBy: userId }, $inc: { likes: 1 } },
        { new: true }
    );

    if (addResult) {
        return res.json({ likes: addResult.likes, liked: true });
    }

    // Already liked → remove like
    const removeResult = await Post.findOneAndUpdate(
        { _id: req.params.id, likedBy: userId },
        { $pull: { likedBy: userId }, $inc: { likes: -1 } },
        { new: true }
    );

    if (!removeResult) {
        return res.status(404).json({ error: 'ไม่พบโพสต์' });
    }

    res.json({ likes: Math.max(0, removeResult.likes), liked: false });
});

module.exports = router;
