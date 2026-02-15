const express = require('express');
const Post = require('../models/Post');
const User = require('../models/User');
const Visit = require('../models/Visit');
const Comment = require('../models/Comment');

const router = express.Router();

const ADMIN_EMAIL = 'phomphat385@gmail.com';

function isAdmin(req, res, next) {
    if (!req.session.user || req.session.user.email !== ADMIN_EMAIL) {
        return res.redirect('/');
    }
    next();
}

// Manage page
router.get('/manage', isAdmin, async (req, res) => {
    const today = new Date().toISOString().slice(0, 10);

    const [posts, totalUsers, todayVisit, allVisits, totalComments] = await Promise.all([
        Post.find().populate('author', 'username displayName').sort({ created_at: -1 }),
        User.countDocuments(),
        Visit.findOne({ date: today }),
        Visit.find().sort({ date: 1 }),
        Comment.countDocuments()
    ]);

    const totalVisits = allVisits.reduce((sum, v) => sum + v.count, 0);

    res.render('manage', {
        user: req.session.user,
        posts,
        totalUsers,
        todayVisits: todayVisit ? todayVisit.count : 0,
        totalVisits,
        totalComments,
        visits: JSON.stringify(allVisits)
    });
});

// Delete post (admin)
router.post('/manage/post/delete/:id', isAdmin, async (req, res) => {
    await Comment.deleteMany({ post: req.params.id });
    await Post.findByIdAndDelete(req.params.id);
    res.redirect('/manage');
});

// Dashboard daily stats API
router.get('/manage/stats/:date', isAdmin, async (req, res) => {
    try {
        const date = req.params.date;
        const visit = await Visit.findOne({ date });
        const usersOnDate = await User.countDocuments({ created_at: { $lte: new Date(date + 'T23:59:59.999Z') } });
        const postsOnDate = await Post.countDocuments({ created_at: { $lte: new Date(date + 'T23:59:59.999Z') } });

        res.json({
            date,
            visits: visit ? visit.count : 0,
            users: usersOnDate,
            posts: postsOnDate
        });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;
