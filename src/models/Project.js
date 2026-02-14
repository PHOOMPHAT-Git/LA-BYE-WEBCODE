const mongoose = require('mongoose');

const ProjectSchema = new mongoose.Schema({
    title: { type: String, trim: true, default: 'Project' },
    description: { type: String, trim: true, default: 'A brief description of your first project. What it does, what technologies were used, and what problem it solves.' },
    tags: [{ type: String, trim: true }],
    demo: { type: String, trim: true, default: '' },
    sort_order: { type: Number, default: 0 },
    likes: { type: Number, default: 0 },
    likedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now }
});

module.exports = mongoose.models.Project || mongoose.model('Project', ProjectSchema, 'projects');
