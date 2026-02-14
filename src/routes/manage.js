const express = require('express');
const Project = require('../models/Project');
const User = require('../models/User');
const Visit = require('../models/Visit');

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

    const [projects, totalUsers, todayVisit, allVisits] = await Promise.all([
        Project.find().sort({ sort_order: 1, created_at: -1 }),
        User.countDocuments(),
        Visit.findOne({ date: today }),
        Visit.find().sort({ date: 1 })
    ]);

    const totalVisits = allVisits.reduce((sum, v) => sum + v.count, 0);

    res.render('manage', {
        user: req.session.user,
        projects,
        totalUsers,
        todayVisits: todayVisit ? todayVisit.count : 0,
        totalVisits,
        visits: JSON.stringify(allVisits)
    });
});

// Add project
router.post('/manage/add', isAdmin, async (req, res) => {
    const { title, description, tags, demo } = req.body;

    const tagArray = tags ? (Array.isArray(tags) ? tags : [tags]) : ['No Tag'];

    await Project.create({
        title: title || 'Project',
        description: description || 'A brief description of project. What it does, what technologies were used, and what problem it solves.',
        tags: tagArray,
        demo
    });
    res.redirect('/manage');
});

// Edit project
router.post('/manage/edit/:id', isAdmin, async (req, res) => {
    const { title, description, tags, demo } = req.body;

    const tagArray = tags ? (Array.isArray(tags) ? tags : [tags]) : ['No Tag'];

    await Project.findByIdAndUpdate(req.params.id, {
        title: title || 'Project',
        description: description || 'A brief description of project. What it does, what technologies were used, and what problem it solves.',
        tags: tagArray,
        demo,
        updated_at: new Date()
    });
    res.redirect('/manage');
});

// Reorder projects
router.post('/manage/reorder', isAdmin, async (req, res) => {
    try {
        const { order } = req.body;
        if (!Array.isArray(order)) return res.status(400).json({ error: 'Invalid' });

        const updates = order.map((id, index) =>
            Project.findByIdAndUpdate(id, { sort_order: index })
        );
        await Promise.all(updates);
        res.json({ success: true });
    } catch (err) {
        console.error('Reorder error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Dashboard daily stats API
router.get('/manage/stats/:date', isAdmin, async (req, res) => {
    try {
        const date = req.params.date;
        const visit = await Visit.findOne({ date });
        const usersOnDate = await User.countDocuments({ created_at: { $lte: new Date(date + 'T23:59:59.999Z') } });
        const projectsOnDate = await Project.countDocuments({ created_at: { $lte: new Date(date + 'T23:59:59.999Z') } });

        res.json({
            date,
            visits: visit ? visit.count : 0,
            users: usersOnDate,
            projects: projectsOnDate
        });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Delete project
router.post('/manage/delete/:id', isAdmin, async (req, res) => {
    await Project.findByIdAndDelete(req.params.id);
    res.redirect('/manage');
});

module.exports = router;
