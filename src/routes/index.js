const express = require('express');
const Project = require('../models/Project');
const router = express.Router();

router.get('/', async (req, res) => {
    const projects = await Project.find().sort({ sort_order: 1, created_at: -1 });
    res.render('index', { user: req.session.user, projects });
});

router.post('/project/:id/like', async (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: 'Login required' });

    const userId = req.session.user.id;
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ error: 'Not found' });

    const alreadyLiked = project.likedBy.some(id => id.toString() === userId);

    if (alreadyLiked) {
        project.likedBy.pull(userId);
        project.likes = Math.max(0, project.likes - 1);
    } else {
        project.likedBy.push(userId);
        project.likes = project.likes + 1;
    }

    await project.save();
    res.json({ likes: project.likes, liked: !alreadyLiked });
});

module.exports = router;