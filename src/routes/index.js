const express = require('express');
const mongoose = require('mongoose');
const Post = require('../models/Post');
const Comment = require('../models/Comment');
const User = require('../models/User');
const router = express.Router();

const POSTS_PER_PAGE = 10;

// Simple in-memory cache
const cache = { feed: null, feedAt: 0 };
const CACHE_TTL = 5000; // 5 seconds

function invalidateCache() { cache.feed = null; }

async function fetchPosts(query, sort, limit, skip, userId) {
    const userObjId = userId ? new mongoose.Types.ObjectId(userId) : null;

    // Single aggregation: posts + author + comments + counts
    const pipeline = [
        { $match: query },
        { $sort: sort },
        ...(skip ? [{ $skip: skip }] : []),
        { $limit: limit },
        // Lookup author
        { $lookup: { from: 'users', localField: 'author', foreignField: '_id', as: '_author' } },
        { $unwind: '$_author' },
        // Compute liked boolean + strip likedBy
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

    // Parallel: top-level comments (limited) + total counts
    const [allComments, commentCounts] = await Promise.all([
        Comment.aggregate([
            { $match: { post: { $in: postIds }, parent: null } },
            { $sort: { created_at: 1 } },
            // Lookup author for comments
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
            // Group by post and limit 3 per post
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

// Feed page
router.get('/', async (req, res) => {
    const userId = req.session.user ? req.session.user.id : null;

    // Use cache for non-logged-in feed (first page)
    let postsWithComments;
    if (!userId && !req.query.page && cache.feed && Date.now() - cache.feedAt < CACHE_TTL) {
        postsWithComments = cache.feed;
    } else {
        postsWithComments = await fetchPosts({}, { created_at: -1 }, POSTS_PER_PAGE, 0, userId);
        if (!userId && !req.query.page) {
            cache.feed = postsWithComments;
            cache.feedAt = Date.now();
        }
    }

    const hasMore = postsWithComments.length === POSTS_PER_PAGE;

    if (req.query.page) {
        return res.json({ posts: postsWithComments, hasMore });
    }

    res.render('index', { user: req.session.user, posts: postsWithComments, hasMore });
});

// API: Load more posts (cursor-based)
router.get('/api/posts', async (req, res) => {
    const userId = req.session.user ? req.session.user.id : null;
    const before = req.query.before; // last post's created_at timestamp

    let query = {};
    if (before) {
        query.created_at = { $lt: new Date(before) };
    } else {
        // Fallback: skip-based for backwards compatibility
        const page = parseInt(req.query.page) || 1;
        const skip = (page - 1) * POSTS_PER_PAGE;
        const posts = await fetchPosts({}, { created_at: -1 }, POSTS_PER_PAGE, skip, userId);
        return res.json({ posts, hasMore: posts.length === POSTS_PER_PAGE });
    }

    const posts = await fetchPosts(query, { created_at: -1 }, POSTS_PER_PAGE, 0, userId);
    res.json({ posts, hasMore: posts.length === POSTS_PER_PAGE });
});

// Create post
router.post('/post/create', async (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบ' });

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

    invalidateCache();
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
    invalidateCache();
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
    invalidateCache();
    res.json({ success: true });
});

// Like/unlike post - atomic operation
router.post('/post/:id/like', async (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบ' });

    const userId = req.session.user.id;

    const addResult = await Post.findOneAndUpdate(
        { _id: req.params.id, likedBy: { $ne: userId } },
        { $push: { likedBy: userId }, $inc: { likes: 1 } },
        { new: true, projection: { likes: 1 } }
    );

    if (addResult) {
        invalidateCache();
        return res.json({ likes: addResult.likes, liked: true });
    }

    const removeResult = await Post.findOneAndUpdate(
        { _id: req.params.id, likedBy: userId },
        { $pull: { likedBy: userId }, $inc: { likes: -1 } },
        { new: true, projection: { likes: 1 } }
    );

    if (!removeResult) {
        return res.status(404).json({ error: 'ไม่พบโพสต์' });
    }

    invalidateCache();
    res.json({ likes: Math.max(0, removeResult.likes), liked: false });
});

module.exports = router;
