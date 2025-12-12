// server.js - complete backend (local file uploads)
const express = require('express');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const bodyParser = require('body-parser');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();
console.log('server.js loaded — starting up');

const PORT = 3000;

// ---------- Database config (adjust if needed) ----------
const DB_HOST = 'localhost';
const DB_USER = 'nri_user';
const DB_PASSWORD = 'nri_pass_123';
const DB_NAME = 'nri_portal';

// ---------- Ensure uploads folder exists ----------
const UPLOADS_DIR = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    console.log('Created uploads directory:', UPLOADS_DIR);
}

// ---------- Multer (disk storage) ----------
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB per file
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOADS_DIR),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname) || '.jpg';
        cb(null, `prop_${uuidv4()}${ext}`);
    }
});
const upload = multer({
    storage,
    limits: { fileSize: MAX_FILE_BYTES },
    fileFilter: (req, file, cb) => {
        // allow common image extensions
        const allowed = /\.(jpe?g|png|webp)$/i;
        if (!allowed.test(file.originalname)) {
            return cb(new Error('Only JPG/PNG/WEBP files allowed'));
        }
        cb(null, true);
    }
});

// ---------- Express + middlewares ----------
app.use(express.static(path.join(__dirname, 'public'))); // serve index.html and uploads
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cors());

app.use(session({
    secret: 'secret_key_change_this',
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 1000 * 60 * 60 * 24 } // 1 day
}));

// ---------- MySQL pool ----------
const pool = mysql.createPool({
    host: DB_HOST,
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// ---------- Helpers ----------
function requireLogin(req, res, next) {
    if (req.session && req.session.user) return next();
    return res.status(401).json({ error: 'Not authorized' });
}

// Normalizes DB photo values: can be JSON text, an array, or null
function normalizePhotos(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value);
            return Array.isArray(parsed) ? parsed : [];
        } catch (e) {
            return [];
        }
    }
    return [];
}

// ---------- Routes ----------

// Serve root login page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Signup
app.post('/api/signup', async (req, res) => {
    try {
        const { full_name, email, phone, country, role, username, password } = req.body;
        if (!full_name || !email || !username || !password) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const password_hash = await bcrypt.hash(password, 10);

        const conn = await pool.getConnection();
        try {
            await conn.beginTransaction();

            const [userResult] = await conn.query(
                'INSERT INTO user_details (full_name, email, phone, country, role) VALUES (?, ?, ?, ?, ?)',
                [full_name, email, phone || null, country || null, role || 'both']
            );

            const user_id = userResult.insertId;

            await conn.query(
                'INSERT INTO auth_users (user_id, username, password_hash) VALUES (?, ?, ?)',
                [user_id, username, password_hash]
            );

            await conn.commit();

            req.session.user = { user_id, full_name, email, username };
            return res.json({ success: true });
        } catch (err) {
            await conn.rollback();
            console.error('Signup DB error:', err);
            return res.status(500).json({ error: 'Database error (duplicate username/email?)' });
        } finally {
            conn.release();
        }
    } catch (err) {
        console.error('Signup server error:', err);
        return res.status(500).json({ error: 'Server error' });
    }
});

// Login
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) return res.status(400).json({ error: 'Missing username or password' });

        const conn = await pool.getConnection();
        try {
            const [rows] = await conn.query(
                `SELECT a.password_hash, u.user_id, u.full_name, u.email
         FROM auth_users a JOIN user_details u ON a.user_id = u.user_id
         WHERE a.username = ? LIMIT 1`,
                [username]
            );
            if (rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' });

            const user = rows[0];
            const match = await bcrypt.compare(password, user.password_hash);
            if (!match) return res.status(401).json({ error: 'Invalid credentials' });

            req.session.user = { user_id: user.user_id, full_name: user.full_name, email: user.email, username };
            return res.json({ success: true });
        } finally {
            conn.release();
        }
    } catch (err) {
        console.error('Login error:', err);
        return res.status(500).json({ error: 'Server error' });
    }
});

// Logout
app.get('/api/logout', (req, res) => {
    req.session.destroy(() => res.json({ success: true }));
});

// Who am I
app.get('/api/me', (req, res) => {
    if (req.session && req.session.user) return res.json({ user: req.session.user });
    return res.json({ user: null });
});

// Add property (disk storage)
app.post('/api/properties/add', requireLogin, upload.array('photos', 10), async (req, res) => {
    try {
        const owner_id = req.session.user.user_id;
        const { title, description, price, city } = req.body;

        if (!title) return res.status(400).json({ error: 'Title is required' });
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: 'You must upload at least one photo' });
        }

        // build relative URLs for saved files
        const photoUrls = req.files.map(f => `/uploads/${path.basename(f.path)}`);

        const conn = await pool.getConnection();
        try {
            await conn.beginTransaction();

            const [result] = await conn.query(
                'INSERT INTO properties (owner_id, title, description, price, city, photos) VALUES (?, ?, ?, ?, ?, ?)',
                [owner_id, title, description || null, price || null, city || null, JSON.stringify(photoUrls)]
            );

            const property_id = result.insertId;
            await conn.commit();

            return res.json({ success: true, property_id, photos: photoUrls });
        } catch (err) {
            await conn.rollback();
            console.error('DB insert property error:', err);
            return res.status(500).json({ error: 'Error saving property' });
        } finally {
            conn.release();
        }
    } catch (err) {
        console.error('Add property server error (disk):', err);
        if (err instanceof multer.MulterError) return res.status(400).json({ error: err.message });
        return res.status(500).json({ error: 'Server error' });
    }
});

app.get('/api/users', async (req, res) => {
    try {
        const conn = await pool.getConnection();
        try {
            const [rows] = await conn.query(
                `SELECT u.user_id, u.full_name, u.email, u.phone, u.country, u.role, u.created_at,
                a.auth_id, a.username
         FROM user_details u
         LEFT JOIN auth_users a ON a.user_id = u.user_id
         ORDER BY u.created_at DESC`
            );

            const users = rows.map(r => ({
                user_id: r.user_id,
                full_name: r.full_name,
                email: r.email,
                phone: r.phone,
                country: r.country,
                role: r.role,
                created_at: r.created_at,
                auth: r.auth_id ? { auth_id: r.auth_id, username: r.username } : null
            }));

            return res.json({ users });
        } finally {
            conn.release();
        }
    } catch (err) {
        console.error('List users error:', err);
        return res.status(500).json({ error: 'Server error' });
    }
});

app.get('/api/property/:id/contact', requireLogin, async (req, res) => {
    try {
        const property_id = req.params.id;
        const conn = await pool.getConnection();
        try {
            const [rows] = await conn.query(
                `SELECT u.phone FROM properties p JOIN user_details u ON p.owner_id = u.user_id WHERE p.property_id = ? LIMIT 1`,
                [property_id]
            );
            if (rows.length === 0) return res.status(404).json({ error: 'Property not found' });
            return res.json({ phone: rows[0].phone || 'No phone provided' });
        } finally {
            conn.release();
        }
    } catch (err) {
        console.error('Contact fetch error:', err);
        return res.status(500).json({ error: 'Server error' });
    }
});

app.get('/health', (req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
});
