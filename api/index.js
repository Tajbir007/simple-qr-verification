// Vercel serverless function entry point
const express = require('express');
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');

const app = express();

// ----- Database Configuration (MongoDB Atlas) -----
const mongoURI = process.env.MONGO_URI;

// Connect to MongoDB
mongoose.connect(mongoURI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
})
.then(() => console.log('✅ Connected to MongoDB Atlas'))
.catch(err => console.error('❌ MongoDB connection error:', err));

// ----- Define Schema -----
const userSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    name: String,
    email: { type: String, required: true, unique: true },
    phone: String,
    status: { type: String, default: 'active' } // 'active' or 'used'
});

const User = mongoose.model('User', userSchema);
const adminSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true }
});
const Admin = mongoose.model('Admin', adminSchema);

// middleware
app.use(express.json());

// ----- authentication middleware -----
const authenticateToken = (req, res, next) => {
    const token = req.headers['authorization']?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'Authentication token missing.' });
    if (token !== 'secret-admin-token') {
        return res.status(403).json({ message: 'Invalid token.' });
    }
    next();
};

// ----- Login API Endpoint -----
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const adminUser = await Admin.findOne({ username });

        if (!adminUser) {
            return res.status(401).json({ message: 'Invalid username or password.' });
        }
        
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
app.post('/api/generate-tickets', authenticateToken, async (req, res) => {
    try {
        const ticketHolders = req.body.ticketHolders;
        if (!ticketHolders || ticketHolders.length === 0) {
            return res.status(400).json({ error: 'No ticket holders provided.' });
        }

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
            status: 'active'
        }));

        await User.insertMany(newTickets);

        res.status(200).json({
            message: 'Tickets generated successfully.',
            tickets: newTickets.map(t => ({ id: t.id, name: t.name, email: t.email, phone: t.phone, status: t.status }))
        });

    } catch (error) {
        console.error('Error during ticket generation:', error);
        res.status(500).json({ error: 'An internal server error occurred during ticket generation.' });
    }
});

// ----- View All Tickets API Endpoint -----
app.get('/api/tickets', authenticateToken, async (req, res) => {
    try {
        const tickets = await User.find({}).sort({ name: 1 });
        res.status(200).json({ tickets: tickets.map(t => ({ id: t.id, name: t.name, email: t.email, phone: t.phone, status: t.status })) });
    } catch (error) {
        console.error('Error fetching tickets:', error);
        res.status(500).json({ message: 'An internal server error occurred while fetching tickets.' });
    }
});

// ----- Ticket Verification API Endpoint -----
app.get('/api/verify/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const user = await User.findOne({ id });

        if (!user) {
            return res.status(404).json({ status: 'not-found', message: 'Ticket not found.' });
        }

        if (user.status !== 'active') {
            return res.status(200).json({ status: 'used', message: 'This ticket has already been used.' });
        }

        user.status = 'used';
        await user.save();

        return res.status(200).json({
            status: 'authentic',
            data: { name: user.name, email: user.email, phone: user.phone}
        });

    } catch (error) {
        console.error('Database query error:', error);
        res.status(500).json({ status: 'error', message: 'An internal server error occurred.' });
    }
});

// ----- Reset Ticket API Endpoint -----
app.post('/api/reset-ticket/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const user = await User.findOne({ id });

        if (!user) {
            return res.status(404).json({ message: 'Ticket not found.' });
        }

        if (user.status === 'active') {
            return res.status(400).json({ message: 'Ticket is already active.' });
        }

        user.status = 'active';
        await user.save();

        res.status(200).json({ message: 'Ticket has been reset and is now active again.' });
    } catch (error) {
        console.error('Error resetting ticket:', error);
        res.status(500).json({ message: 'An internal server error occurred while resetting the ticket.' });
    }
});

// ----- Delete Ticket API Endpoint -----
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

// Export the app for Vercel
module.exports = app;