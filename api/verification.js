require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const path = require('path');
const serverless = require('serverless-http');

const app = express();

mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log('✅ Connected to MongoDB Atlas'))
  .catch((err) => console.error('❌ MongoDB connection error:', err));

const userSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: String,
  email: { type: String, required: true, unique: true },
  phone: String,
  status: { type: String, default: 'active' }
});
const User = mongoose.model('User', userSchema);

const adminSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true }
});
const Admin = mongoose.model('Admin', adminSchema);

app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

const authenticateToken = (req, res, next) => {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Authentication token missing.' });
  if (token !== process.env.ADMIN_TOKEN) {
    return res.status(403).json({ message: 'Invalid token.' });
  }
  next();
};

app.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const adminUser = await Admin.findOne({ username });
    if (!adminUser) return res.status(401).json({ message: 'Invalid username or password.' });

    const isMatch = await bcrypt.compare(password, adminUser.password);
    if (isMatch) return res.status(200).json({ token: process.env.ADMIN_TOKEN });
    return res.status(401).json({ message: 'Invalid username or password.' });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

app.post('/generate-tickets', authenticateToken, async (req, res) => {
  try {
    const ticketHolders = req.body.ticketHolders;
    if (!ticketHolders || ticketHolders.length === 0) {
      return res.status(400).json({ error: 'No ticket holders provided.' });
    }
    const emails = ticketHolders.map((h) => h.email);
    const existingUsers = await User.find({ email: { $in: emails } });
    if (existingUsers.length > 0) {
      const dup = existingUsers.map((u) => u.email);
      return res.status(409).json({ error: `Duplicate email(s): ${dup.join(', ')}` });
    }
    const newTickets = ticketHolders.map((h) => ({
      id: uuidv4(),
      name: h.name,
      email: h.email,
      phone: h.phone,
      status: 'active'
    }));
    await User.insertMany(newTickets);
    res.status(200).json({ tickets: newTickets });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error during ticket generation' });
  }
});

app.get('/tickets', authenticateToken, async (req, res) => {
  try {
    const tickets = await User.find({}).sort({ name: 1 });
    res.status(200).json({ tickets });
  } catch (err) {
    res.status(500).json({ message: 'Error fetching tickets' });
  }
});

app.get('/verify/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findOne({ id });
    if (!user) return res.status(404).json({ status: 'not-found' });
    if (user.status !== 'active') return res.status(200).json({ status: 'used' });
    user.status = 'used';
    await user.save();
    res.status(200).json({ status: 'authentic', data: { name: user.name, email: user.email, phone: user.phone } });
  } catch (err) {
    res.status(500).json({ status: 'error' });
  }
});

app.post('/reset-ticket/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findOne({ id });
    if (!user) return res.status(404).json({ message: 'Ticket not found.' });
    if (user.status === 'active') return res.status(400).json({ message: 'Already active' });
    user.status = 'active';
    await user.save();
    res.status(200).json({ message: 'Ticket reset' });
  } catch (err) {
    res.status(500).json({ message: 'Error resetting ticket' });
  }
});

app.delete('/delete-ticket/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await User.deleteOne({ id });
    if (result.deletedCount === 0) return res.status(404).json({ message: 'Not found' });
    res.status(200).json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Error deleting ticket' });
  }
});

module.exports = app;
module.exports.handler = serverless(app);
