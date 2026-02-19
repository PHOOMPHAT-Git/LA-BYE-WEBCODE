const express = require('express');
const bcrypt = require('bcrypt');
const User = require('../models/User');

const router = express.Router();

// Register page
router.get('/register', (req, res) => {
    if (req.session.user) return res.redirect('/');
    res.render('register', { error: null });
});

// Register handler
router.post('/register', async (req, res) => {
    // Rate limit: 5 seconds between attempts
    const now = Date.now();
    if (req.session._lastRegisterAt && now - req.session._lastRegisterAt < 5000) {
        return res.render('register', { error: 'กรุณารอสักครู่ก่อนลองอีกครั้ง' });
    }
    req.session._lastRegisterAt = now;

    const { username, email, password, confirmPassword } = req.body;

    if (!username || !email || !password || !confirmPassword) {
        return res.render('register', { error: 'กรุณากรอกข้อมูลให้ครบทุกช่อง' });
    }

    if (password.length < 6) {
        return res.render('register', { error: 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร' });
    }

    if (password !== confirmPassword) {
        return res.render('register', { error: 'รหัสผ่านไม่ตรงกัน' });
    }

    try {
        const existingUser = await User.findOne({
            $or: [{ email }, { username }]
        });

        if (existingUser) {
            const field = existingUser.email === email ? 'อีเมล' : 'ชื่อผู้ใช้';
            return res.render('register', { error: `${field}นี้ถูกใช้งานแล้ว` });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const user = await User.create({
            username,
            displayName: username,
            email,
            password: hashedPassword
        });

        req.session.user = {
            id: user._id,
            username: user.username,
            displayName: user.displayName,
            email: user.email,
            avatar: user.avatar
        };

        req.session.save((err) => {
            if (err) {
                console.error('Session save error:', err);
                return res.render('register', { error: 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง' });
            }
            res.redirect('/');
        });
    } catch (err) {
        console.error('Register error:', err);
        res.render('register', { error: 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง' });
    }
});

// Login page
router.get('/login', (req, res) => {
    if (req.session.user) return res.redirect('/');
    res.render('login', { error: null });
});

// Login handler
router.post('/login', async (req, res) => {
    // Rate limit: 3 seconds between attempts
    const now = Date.now();
    if (req.session._lastLoginAt && now - req.session._lastLoginAt < 3000) {
        return res.render('login', { error: 'กรุณารอสักครู่ก่อนลองอีกครั้ง' });
    }
    req.session._lastLoginAt = now;

    const { email, password } = req.body;

    if (!email || !password) {
        return res.render('login', { error: 'กรุณากรอกข้อมูลให้ครบทุกช่อง' });
    }

    try {
        const user = await User.findOne({ email });

        if (!user) {
            return res.render('login', { error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' });
        }

        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
            return res.render('login', { error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' });
        }

        req.session.user = {
            id: user._id,
            username: user.username,
            displayName: user.displayName || user.username,
            email: user.email,
            avatar: user.avatar
        };

        req.session.save((err) => {
            if (err) {
                console.error('Session save error:', err);
                return res.render('login', { error: 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง' });
            }
            res.redirect('/');
        });
    } catch (err) {
        console.error('Login error:', err);
        res.render('login', { error: 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง' });
    }
});

// Logout
router.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/');
    });
});

module.exports = router;
