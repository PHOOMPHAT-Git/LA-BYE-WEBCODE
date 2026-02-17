const express = require('express');
const Post = require('../models/Post');
const Comment = require('../models/Comment');
const User = require('../models/User');
const router = express.Router();

const POSTS_PER_PAGE = 10;

// Feed page
router.get('/', async (req, res) => {
    const posts = await Post.find()
        .populate('author', 'username displayName avatar')
        .sort({ created_at: -1 })
        .limit(POSTS_PER_PAGE)
        .lean();

    const postIds = posts.map(p => p._id);

    // Batch: get all top-level comments for these posts (limit 3 per post)
    const allComments = await Comment.find({ post: { $in: postIds }, parent: null })
        .populate('author', 'username displayName avatar')
        .sort({ created_at: 1 })
        .lean();

    // Batch: get comment counts
    const commentCounts = await Comment.aggregate([
        { $match: { post: { $in: postIds } } },
        { $group: { _id: '$post', count: { $sum: 1 } } }
    ]);
    const countMap = {};
    commentCounts.forEach(c => { countMap[c._id.toString()] = c.count; });

    // Map comments to posts (limit 3 per post)
    const commentMap = {};
    allComments.forEach(c => {
        const pid = c.post.toString();
        if (!commentMap[pid]) commentMap[pid] = [];
        if (commentMap[pid].length < 3) commentMap[pid].push(c);
    });

    const postsWithComments = posts.map(post => ({
        ...post,
        comments: commentMap[post._id.toString()] || [],
        commentCount: countMap[post._id.toString()] || 0
    }));

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

    const postIds = posts.map(p => p._id);

    const allComments = await Comment.find({ post: { $in: postIds }, parent: null })
        .populate('author', 'username displayName avatar')
        .sort({ created_at: 1 })
        .lean();

    const commentCounts = await Comment.aggregate([
        { $match: { post: { $in: postIds } } },
        { $group: { _id: '$post', count: { $sum: 1 } } }
    ]);
    const countMap = {};
    commentCounts.forEach(c => { countMap[c._id.toString()] = c.count; });

    const commentMap = {};
    allComments.forEach(c => {
        const pid = c.post.toString();
        if (!commentMap[pid]) commentMap[pid] = [];
        if (commentMap[pid].length < 3) commentMap[pid].push(c);
    });

    const postsWithComments = posts.map(post => ({
        ...post,
        comments: commentMap[post._id.toString()] || [],
        commentCount: countMap[post._id.toString()] || 0
    }));

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

    await Comment.deleteMany({ post: post._id });
    await Post.findByIdAndDelete(req.params.id);
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

// Like/unlike post
router.post('/post/:id/like', async (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบ' });

    const userId = req.session.user.id;
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ error: 'ไม่พบโพสต์' });

    const alreadyLiked = post.likedBy.some(id => id.toString() === userId);

    if (alreadyLiked) {
        post.likedBy.pull(userId);
        post.likes = Math.max(0, post.likes - 1);
    } else {
        post.likedBy.push(userId);
        post.likes = post.likes + 1;
    }

    await post.save();
    res.json({ likes: post.likes, liked: !alreadyLiked });
});

module.exports = router;
