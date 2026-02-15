const express = require('express');
const session = require('express-session');
const { MongoStore } = require('connect-mongo');
const path = require('path');
require('dotenv').config();

const connectDB = require('./src/config/db');
const Visit = require('./src/models/Visit');
const indexRoutes = require('./src/routes/index');
const authRoutes = require('./src/routes/auth');
const manageRoutes = require('./src/routes/manage');
const commentRoutes = require('./src/routes/comment');
const profileRoutes = require('./src/routes/profile');

const app = express();
const PORT = process.env.PORT || 3000;

// Connect to MongoDB
connectDB();

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views/pages'));

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Session (24 hours) - stored in MongoDB
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: new MongoStore({
        mongoUrl: process.env.WEBSITE_MONGO_URI
    }),
    cookie: {
        maxAge: 24 * 60 * 60 * 1000
    }
}));

// Track homepage visits only
app.use(async (req, res, next) => {
    if (req.method === 'GET' && req.path === '/') {
        const today = new Date().toISOString().slice(0, 10);
        Visit.findOneAndUpdate({ date: today }, { $inc: { count: 1 } }, { upsert: true }).catch(() => {});
    }
    next();
});

// Routes
app.use('/', indexRoutes);
app.use('/', authRoutes);
app.use('/', manageRoutes);
app.use('/', commentRoutes);
app.use('/', profileRoutes);

// Start server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
