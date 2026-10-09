// To run this file, you need to install the required packages:
// npm install express mongoose uuid dotenv bcryptjs

import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import mongoose from 'mongoose';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

// ----- Database Configuration (MongoDB Atlas) -----
const mongoURI = process.env.MONGO_URI;

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

// middleware
app.use(express.json());

// Serve pages without requiring the .html extension
app.get('/login', (_req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/admin', (_req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/index', (_req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
app.use(express.static(path.join(__dirname, 'public')));

// ----- authentication middleware -----
const authenticateToken = (req, res, next) => {
    const token = req.headers['authorization']?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'Authentication token missing.' });
    if (token !== 'secret-admin-token') { // This token should be kept secret
        return res.status(403).json({ message: 'Invalid token.' });
    }
    next();
};
// ----- Login API Endpoint -----
// Method: POST
// Route: /api/login
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const adminUser = await Admin.findOne({ username });

        if (!adminUser) {
            return res.status(401).json({ message: 'Invalid username or password.' });
        }

        // Compare the plain text password with the hashed password in the database
        const isMatch = await bcrypt.compare(password, adminUser.password);

        if (isMatch) {
            res.status(200).json({ message: 'Login successful.', token: 'secret-admin-token' });
        } else {
            res.status(401).json({ message: 'Invalid username or password.' });
        }
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'An internal server error occurred.' });
    }
});


// ----- Ticket Generation API Endpoint -----
// Method: POST
// Route: /api/generate-tickets
app.post('/api/generate-tickets', authenticateToken, async (req, res) => {
    try {
        const ticketHolders = req.body.ticketHolders;
        if (!ticketHolders || ticketHolders.length === 0) {
            return res.status(400).json({ error: 'No ticket holders provided.' });
        }

        // Check for duplicate emails
        const emails = ticketHolders.map(holder => holder.email);
        const existingUsers = await User.find({ email: { $in: emails } });

        if (existingUsers.length > 0) {
            const duplicateEmails = existingUsers.map(user => user.email);
            return res.status(409).json({
                error: `Duplicate email(s) found: ${duplicateEmails.join(', ')}. Tickets not generated.`
            });
        }

        const newTickets = ticketHolders.map(holder => ({
            id: uuidv4(),
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
        res.status(500).json({ error: `Ticket generation failed: ${error.message}` });
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


// server listening
app.listen(port, () => {
    console.log(` Verification API listening at http://localhost:${port}`);
    console.log(`👉 Open http://localhost:${port}/login.html to access admin dashboard`);
    console.log(`👉 Open http://localhost:${port}/index.html to verify a ticket`);
});