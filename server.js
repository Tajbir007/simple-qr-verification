// To run this file, you need to install the required packages:
// npm install

import dotenv from 'dotenv';
dotenv.config();

import crypto from 'crypto';
import express from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import mongoose from 'mongoose';
import path from 'path';
import bcrypt from 'bcryptjs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === 'production';

// Number of reverse proxies in front of the app (see README "Deployment"). Without it,
// req.ip is the proxy's address and every visitor shares one rate-limit bucket.
app.set('trust proxy', Number(process.env.TRUST_PROXY) || false);

// ----- Database Configuration (MongoDB Atlas) -----
const mongoURI = process.env.MONGO_URI;

// Defuse query operators ($ne, $gt, ...) smuggled into query filters from request data
mongoose.set('sanitizeFilter', true);

// connect to MongoDB
mongoose.connect(mongoURI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
})
.then(() => console.log(' Connected to MongoDB Atlas'))
.catch(err => console.error(' MongoDB connection error:', err));

// ----- Define Schema -----
const userSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    name: String,
    email: { type: String, required: true, unique: true },
    phone: String,
    status: { type: String, default: 'active' }, // 'active' or 'used'
    segments: { type: String, required: true }, // e.g., 'VIP', 'General', etc.
    institute: String, // Name of the institute
    group: { type: String, required: true }, // e.g., 'Junior', 'Senior', etc.
    class: String,  // e.g., '1', '2', etc.
    foodReceived: { type: Boolean, default: false }, // true when QR is scanned a 2nd time
    isEnabled: { type: Boolean, default: true } // false when a ticket is deactivated
});

const User = mongoose.model('User', userSchema);
const adminSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true }
});
const Admin = mongoose.model('Admin', adminSchema);

// Admin sessions live server-side so logout really invalidates them. Only a hash of the
// cookie token is stored, and MongoDB's TTL index deletes expired sessions.
const sessionSchema = new mongoose.Schema({
    tokenHash: { type: String, required: true, unique: true },
    username: String,
    expiresAt: { type: Date, required: true, expires: 0 }
});
const Session = mongoose.model('Session', sessionSchema);

// ----- Security headers -----
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            scriptSrc: ["'self'", 'https://cdn.tailwindcss.com'],
            // 'unsafe-inline' styles: the Tailwind CDN script injects its CSS as a <style> tag
            styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
            fontSrc: ["'self'", 'https://fonts.gstatic.com'],
            frameAncestors: ["'none'"],
            // Only force HTTPS in production, so plain-HTTP testing on a LAN address still works
            upgradeInsecureRequests: isProd ? [] : null
        }
    }
}));

// ----- Rate limiting -----
// ponytail: counters are in memory (per process, reset on restart); move to a shared store
// if the app ever runs on more than one instance.
const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 300, // per IP; sized for the dashboard's 5s polling plus several door scanners behind one NAT
    message: { message: 'Too many requests. Please try again later.' }
});
// Login: only failed attempts count, throttled per IP and (more loosely) per username so a
// distributed guessing attack against one account is slowed down as well.
const loginLimit = {
    windowMs: 15 * 60 * 1000,
    skipSuccessfulRequests: true,
    message: { message: 'Too many login attempts. Please try again later.' }
};
const loginIpLimiter = rateLimit({ ...loginLimit, limit: 10 });
const loginUserLimiter = rateLimit({
    ...loginLimit,
    limit: 20,
    keyGenerator: (req) => `user:${String(req.body?.username).slice(0, 100)}`
});

// middleware
app.use(express.json({ limit: '100kb' }));

// ----- CSRF protection -----
// The session cookie is SameSite=Strict; on top of that, refuse state-changing API requests
// that the browser says come from another origin.
const isSameOrigin = (req) => {
    const site = req.headers['sec-fetch-site'];
    if (site) return site === 'same-origin';
    const origin = req.headers.origin;
    if (!origin) return true; // not a browser, so no ambient cookie to abuse
    try {
        return new URL(origin).host === req.headers.host;
    } catch {
        return false;
    }
};
app.use('/api', apiLimiter, (req, res, next) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && !isSameOrigin(req)) {
        return res.status(403).json({ message: 'Cross-site request blocked.' });
    }
    next();
});

// ----- Sessions -----
const SESSION_COOKIE = isProd ? '__Host-session' : 'session';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const cookieOptions = { httpOnly: true, secure: isProd, sameSite: 'strict', path: '/' };
const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');
// Compared against when the username is unknown, so response time does not reveal which usernames exist
const DUMMY_HASH = bcrypt.hashSync(crypto.randomBytes(16).toString('hex'), 10);

const getSessionToken = (req) => req.headers.cookie?.split(';')
    .map(cookie => cookie.trim())
    .find(cookie => cookie.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(SESSION_COOKIE.length + 1);

const getSession = async (req) => {
    const token = getSessionToken(req);
    if (!token) return null;
    const session = await Session.findOne({ tokenHash: hashToken(token) });
    return session && session.expiresAt > new Date() ? session : null;
};

// ----- authentication middleware -----
const authenticateToken = async (req, res, next) => {
    if (!(await getSession(req))) {
        return res.status(401).json({ message: 'Authentication required.' });
    }
    next();
};

// Same check for the admin page itself: no valid session, no dashboard
const requireAdminPage = async (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (!(await getSession(req))) return res.redirect('/login');
    next();
};

// Serve pages without requiring the .html extension
app.get('/login', (_req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// The admin page lives outside public/ so express.static can never serve it unauthenticated
app.get(['/admin', '/admin.html'], apiLimiter, requireAdminPage, (_req, res) => {
    res.sendFile(path.join(__dirname, 'private', 'admin.html'));
});

app.get('/admin.js', apiLimiter, requireAdminPage, (_req, res) => {
    res.sendFile(path.join(__dirname, 'private', 'admin.js'));
});

app.get('/index', (_req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
app.use(express.static(path.join(__dirname, 'public')));

// ----- Login API Endpoint -----
// Method: POST
// Route: /api/login
app.post('/api/login', loginIpLimiter, loginUserLimiter, async (req, res) => {
    try {
        const { username, password } = req.body ?? {};
        if (typeof username !== 'string' || typeof password !== 'string' ||
            !username || !password || username.length > 100 || password.length > 200) {
            return res.status(400).json({ message: 'Username and password are required.' });
        }

        const adminUser = await Admin.findOne({ username });

        // Compare the plain text password with the hashed password in the database
        const isMatch = await bcrypt.compare(password, adminUser?.password ?? DUMMY_HASH);

        if (!adminUser || !isMatch) {
            console.warn(`Failed admin login from ${req.ip}`);
            return res.status(401).json({ message: 'Invalid username or password.' });
        }

        // A fresh random token on every login; the browser only ever holds it in an HttpOnly cookie
        const token = crypto.randomBytes(32).toString('hex');
        await Session.create({
            tokenHash: hashToken(token),
            username,
            expiresAt: new Date(Date.now() + SESSION_TTL_MS)
        });
        res.cookie(SESSION_COOKIE, token, { ...cookieOptions, maxAge: SESSION_TTL_MS });
        console.log(`Admin login: ${username} from ${req.ip}`);
        res.status(200).json({ message: 'Login successful.' });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'An internal server error occurred.' });
    }
});

// ----- Logout API Endpoint -----
// Method: POST
// Route: /api/logout
app.post('/api/logout', async (req, res) => {
    try {
        const token = getSessionToken(req);
        if (token) await Session.deleteOne({ tokenHash: hashToken(token) });
        res.clearCookie(SESSION_COOKIE, cookieOptions);
        res.status(200).json({ message: 'Logged out.' });
    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({ message: 'An internal server error occurred.' });
    }
});

// ----- Ticket holder validation -----
const MAX_TICKETS_PER_REQUEST = 200;
const TICKET_FIELD_MAX_LENGTH = { name: 100, email: 254, phone: 30, segments: 100, group: 50, institute: 200, class: 50 };
const REQUIRED_TICKET_FIELDS = ['email', 'segments', 'group'];
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Every field must be a plain string of sane length (so no objects/operators reach the database)
const isValidTicketHolder = (holder) =>
    holder !== null && typeof holder === 'object' &&
    Object.entries(TICKET_FIELD_MAX_LENGTH).every(([field, maxLength]) => {
        const value = holder[field];
        if (value === undefined || value === null || value === '') return !REQUIRED_TICKET_FIELDS.includes(field);
        return typeof value === 'string' && value.length <= maxLength;
    }) &&
    EMAIL_PATTERN.test(holder.email);


// ----- Ticket Generation API Endpoint -----
// Method: POST
// Route: /api/generate-tickets
app.post('/api/generate-tickets', authenticateToken, async (req, res) => {
    try {
        const ticketHolders = req.body?.ticketHolders;
        if (!Array.isArray(ticketHolders) || ticketHolders.length === 0) {
            return res.status(400).json({ error: 'No ticket holders provided.' });
        }
        if (ticketHolders.length > MAX_TICKETS_PER_REQUEST || !ticketHolders.every(isValidTicketHolder)) {
            return res.status(400).json({ error: 'Invalid ticket holder data.' });
        }

        // Check for duplicate emails
        const emails = ticketHolders.map(holder => holder.email);
        if (new Set(emails).size !== emails.length) {
            return res.status(409).json({ error: 'The same email appears more than once. Tickets not generated.' });
        }
        // emails are validated strings, so this $in is ours and may pass sanitizeFilter
        const existingUsers = await User.find({ email: mongoose.trusted({ $in: emails }) });

        if (existingUsers.length > 0) {
            const duplicateEmails = existingUsers.map(user => user.email);
            return res.status(409).json({
                error: `Duplicate email(s) found: ${duplicateEmails.join(', ')}. Tickets not generated.`
            });
        }

        const newTickets = ticketHolders.map(holder => ({
            id: crypto.randomUUID(),
            name: holder.name,
            email: holder.email,
            phone: holder.phone,
            status: 'active',
            segments: holder.segments,
            group: holder.group,
            institute: holder.institute,
            class: holder.class,
            foodReceived: false
        }));

        await User.insertMany(newTickets);

        res.status(200).json({
            message: 'Tickets generated successfully.',
            tickets: newTickets.map(t => ({
                id: t.id,
                name: t.name,
                email: t.email,
                phone: t.phone,
                status: t.status,
                segments: t.segments,
                group: t.group,
                institute: t.institute,
                class: t.class,
                foodReceived: t.foodReceived }))
        });

    } catch (error) {
        console.error('Error during ticket generation:', error);
        res.status(500).json({ error: 'Ticket generation failed.' });
    }
});

// ----- View All Tickets API Endpoint -----
// Method: GET
// Route: /api/tickets
app.get('/api/tickets', authenticateToken, async (_req, res) => {
    try {
        const tickets = await User.find({}).sort({ name: 1 });
        res.status(200).json({
            tickets: tickets.map(t => ({
                id: t.id,
                name: t.name,
                email: t.email,
                phone: t.phone,
                status: t.status,
                segments: t.segments,
                institute: t.institute, // Check that this field is present
                class: t.class, // Check that this field is present
                group: t.group, // Check that this field is present
                foodReceived: t.foodReceived,
                isEnabled: t.isEnabled
            })) });
    } catch (error) {
        console.error('Error fetching tickets:', error);
        res.status(500).json({ message: 'An internal server error occurred while fetching tickets.' });
    }
});


// ----- Ticket Verification API Endpoint -----
// Method: GET
// Route: /api/verify/:id
app.get('/api/verify/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const user = await User.findOne({ id });

        if (!user) {
            return res.status(404).json({ status: 'not-found', message: 'Ticket not found.' });
        }

        if (!user.isEnabled) {
            return res.status(403).json({
                status: 'disabled',
                message: 'This ticket is currently deactivated and cannot be verified.'
            });
        }

        if (user.status !== 'active') {
            // 2nd scan — mark food as received
            if (!user.foodReceived) {
                user.foodReceived = true;
                await user.save();
            }
            return res.status(200).json({
                status: 'used',
                foodReceived: user.foodReceived,
                message: user.foodReceived
                    ? 'This ticket has already been used. Food received ✓'
                    : 'This ticket has already been used.'
            });
        }

        // Valid ticket, update status to "used"
        user.status = 'used';
        await user.save();

        return res.status(200).json({
            status: 'authentic',
            data: { name: user.name, email: user.email, phone: user.phone, segments: user.segments, institute: user.institute, class: user.class, group: user.group }
        });

    } catch (error) {
        console.error('Database query error:', error);
        res.status(500).json({ status: 'error', message: 'An internal server error occurred.' });
    }
});

// ----- Reset Ticket API Endpoint -----
// Method: POST
// Route: /api/reset-ticket/:id
app.post('/api/reset-ticket/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const user = await User.findOne({ id });

        if (!user) {
            return res.status(404).json({ message: 'Ticket not found.' });
        }

        if (user.status === 'active' && user.isEnabled) {
            return res.status(400).json({ message: 'Ticket is already active.' });
        }

        user.status = 'active';
        user.foodReceived = false;
        user.isEnabled = true;
        await user.save();

        res.status(200).json({ message: 'Ticket has been reset and is now active again.' });
    } catch (error) {
        console.error('Error resetting ticket:', error);
        res.status(500).json({ message: 'An internal server error occurred while resetting the ticket.' });
    }
});
// ----- Reset All Tickets API Endpoint -----
// Method: POST
// Route: /api/reset-all-tickets
app.post('/api/reset-all-tickets', authenticateToken, async (_req, res) => {
    try {
        const result = await User.updateMany({}, {
            status: 'active',
            foodReceived: false,
            isEnabled: true
        });

        res.status(200).json({
            message: 'All tickets have been reset.',
            updatedCount: result.modifiedCount
        });
    } catch (error) {
        console.error('Error resetting all tickets:', error);
        res.status(500).json({ message: 'An internal server error occurred while resetting all tickets.' });
    }
});
// ----- Delete Ticket API Endpoint -----
// Method: DELETE
// Route: /api/delete-ticket/:id
app.delete('/api/delete-ticket/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;

    try {
        const result = await User.deleteOne({ id });

        if (result.deletedCount === 0) {
            return res.status(404).json({ message: 'Ticket not found.' });
        }

        res.status(200).json({ message: 'Ticket deleted successfully.' });

    } catch (error) {
        console.error('Error deleting ticket:', error);
        res.status(500).json({ message: 'Internal server error.' });
    }
});

// ----- Fallback error handler -----
// Anything not caught above (malformed JSON, oversized body, ...) gets a generic answer
// instead of Express's default page, which prints a stack trace outside production.
app.use((err, _req, res, _next) => {
    const isClientError = err.status >= 400 && err.status < 500;
    if (!isClientError) console.error('Unhandled error:', err);
    res.status(isClientError ? err.status : 500)
        .json({ message: isClientError ? 'Invalid request.' : 'An internal server error occurred.' });
});

// server listening
app.listen(port, () => {
    console.log(` Verification API listening at http://localhost:${port}`);
    console.log(`👉 Open http://localhost:${port}/login.html to access admin dashboard`);
    console.log(`👉 Open http://localhost:${port}/index.html to verify a ticket`);
});