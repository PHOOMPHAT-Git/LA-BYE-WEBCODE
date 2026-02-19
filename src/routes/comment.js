const express = require('express');
const Comment = require('../models/Comment');
const Post = require('../models/Post');
const router = express.Router();

// Add comment (or reply)
router.post('/comment/create', async (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบ' });

    // Rate limit: 3 seconds between comments
    const now = Date.now();
    if (req.session._lastCommentAt && now - req.session._lastCommentAt < 3000) {
        return res.status(429).json({ error: 'กรุณารอสักครู่ก่อนแสดงความคิดเห็นอีกครั้ง' });
    }
    req.session._lastCommentAt = now;

    const { postId, parentId, content, image, isAnonymous } = req.body;
    if (!content && !image) return res.status(400).json({ error: 'กรุณาเขียนความคิดเห็นหรือแนบรูป' });
    if (!postId) return res.status(400).json({ error: 'ไม่พบโพสต์' });

    const post = await Post.findById(postId);
    if (!post) return res.status(404).json({ error: 'ไม่พบโพสต์' });

    const commentData = {
        post: postId,
        author: req.session.user.id,
        content: content || '',
        image: image || '',
        isAnonymous: isAnonymous === true || isAnonymous === 'true'
    };

    if (parentId) {
        const parentComment = await Comment.findById(parentId);
        if (!parentComment) return res.status(404).json({ error: 'ไม่พบความคิดเห็นที่จะตอบกลับ' });
        commentData.parent = parentId;
        parentComment.replyCount = (parentComment.replyCount || 0) + 1;
        await parentComment.save();
    }

    const comment = await Comment.create(commentData);
    const populated = await comment.populate('author', 'username displayName avatar');

    res.json({
        success: true,
        comment: {
            _id: populated._id,
            content: populated.content,
            image: populated.image,
            isAnonymous: populated.isAnonymous,
            author: populated.author,
            parent: populated.parent,
            likes: 0,
            likedBy: [],
            replyCount: 0,
            created_at: populated.created_at
        }
    });
});

// Like/unlike comment - atomic operation
router.post('/comment/:id/like', async (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบ' });

    const userId = req.session.user.id;

    // Try to add like
    const addResult = await Comment.findOneAndUpdate(
        { _id: req.params.id, likedBy: { $ne: userId } },
        { $push: { likedBy: userId }, $inc: { likes: 1 } },
        { new: true }
    );

    if (addResult) {
        return res.json({ likes: addResult.likes, liked: true });
    }

    // Already liked → remove
    const removeResult = await Comment.findOneAndUpdate(
        { _id: req.params.id, likedBy: userId },
        { $pull: { likedBy: userId }, $inc: { likes: -1 } },
        { new: true }
    );

    if (!removeResult) {
        return res.status(404).json({ error: 'ไม่พบความคิดเห็น' });
    }

    res.json({ likes: Math.max(0, removeResult.likes), liked: false });
});

// Delete comment (and its replies)
router.post('/comment/:id/delete', async (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบ' });

    const comment = await Comment.findById(req.params.id);
    if (!comment) return res.status(404).json({ error: 'ไม่พบความคิดเห็น' });

    const isAdmin = req.session.user.email === 'phomphat385@gmail.com';
    if (comment.author.toString() !== req.session.user.id && !isAdmin) {
        return res.status(403).json({ error: 'ไม่มีสิทธิ์ลบความคิดเห็นนี้' });
    }

    // Decrease parent's replyCount
    if (comment.parent) {
        await Comment.findByIdAndUpdate(comment.parent, { $inc: { replyCount: -1 } });
    }

    // Delete all nested replies recursively
    async function deleteReplies(parentId) {
        const replies = await Comment.find({ parent: parentId });
        for (const reply of replies) {
            await deleteReplies(reply._id);
            await Comment.findByIdAndDelete(reply._id);
        }
    }
    await deleteReplies(req.params.id);
    await Comment.findByIdAndDelete(req.params.id);
    res.json({ success: true });
});

// Get all top-level comments for a post
router.get('/comments/:postId', async (req, res) => {
    const sortType = req.query.sort || 'oldest';
    let sortOption;
    if (sortType === 'newest') sortOption = { created_at: -1 };
    else if (sortType === 'popular') sortOption = { likes: -1, created_at: -1 };
    else sortOption = { created_at: 1 };

    const comments = await Comment.find({ post: req.params.postId, parent: null })
        .populate('author', 'username displayName avatar')
        .sort(sortOption)
        .lean();

    res.json({ comments });
});

// Get replies for a comment
router.get('/comment/:id/replies', async (req, res) => {
    const replies = await Comment.find({ parent: req.params.id })
        .populate('author', 'username displayName avatar')
        .sort({ created_at: 1 })
        .lean();

    res.json({ replies });
});

module.exports = router;
