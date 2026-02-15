const express = require('express');
const Post = require('../models/Post');
const Comment = require('../models/Comment');
const User = require('../models/User');
const router = express.Router();

// Feed page
router.get('/', async (req, res) => {
    const posts = await Post.find()
        .populate('author', 'username displayName avatar')
        .sort({ created_at: -1 });

    // Get comment counts and recent comments for each post
    const postsWithComments = await Promise.all(posts.map(async (post) => {
        const comments = await Comment.find({ post: post._id })
            .populate('author', 'username displayName avatar')
            .sort({ created_at: -1 })
            .limit(3);
        const commentCount = await Comment.countDocuments({ post: post._id });
        return { ...post.toObject(), comments, commentCount };
    }));

    res.render('index', { user: req.session.user, posts: postsWithComments });
});

// Create post
router.post('/post/create', async (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบ' });

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
