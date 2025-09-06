// api/verification.js
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const serverless = require('serverless-http');
const path = require('path');

const app = express();

// DB connection
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

// Schemas
const userSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: String,
  email: { type: String, required: true, unique: true },
  phone: String,
  status: { type: String, default: 'active' },
});
const User = mongoose.model('User', userSchema);

const adminSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
});
const Admin = mongoose.model('Admin', adminSchema);

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Token auth
const authenticateToken = (req, res, next) => {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Authentication token missing.' });
  if (token !== process.env.ADMIN_TOKEN) {
    return res.status(403).json({ message: 'Invalid token.' });
  }
  next();
};

// --- routes (same as your original verification_api.js) ---
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const adminUser = await Admin.findOne({ username });
    if (!adminUser) return res.status(401).json({ message: 'Invalid username or password.' });

    const isMatch = await bcrypt.compare(password, adminUser.password);
    if (isMatch) {
      return res.status(200).json({ token: process.env.ADMIN_TOKEN });
    }
    return res.status(401).json({ message: 'Invalid username or password.' });
  } catch (err) {
    return res.status(500).json({ message: 'Server error' });
  }
});

// ... keep your /api/generate-tickets, /api/tickets, /api/verify/:id,
// /api/reset-ticket/:id, /api/delete-ticket/:id endpoints unchanged ...

// Export handler for Vercel
module.exports = app;
module.exports.handler = serverless(app);
