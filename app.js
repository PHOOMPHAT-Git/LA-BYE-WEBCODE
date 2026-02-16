const express = require('express');
const session = require('express-session');
const { MongoStore } = require('connect-mongo');
const path = require('path');
require('dotenv').config();

const connectDB = require('./src/config/db');
const indexRoutes = require('./src/routes/index');
const authRoutes = require('./src/routes/auth');

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

// Routes
app.use('/', profileRoutes);
app.use('/', commentRoutes);
app.use('/', authRoutes);
app.use('/', indexRoutes);

// Start server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
