// Vercel serverless function entry point
const express = require('express');
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');

const app = express();

// ----- Database Configuration (MongoDB Atlas) -----
const mongoURI = process.env.MONGO_URI;

if (!mongoURI) {
  console.error('❌ MONGO_URI environment variable is not set');
}

// Connect to MongoDB with better error handling
const connectDB = async () => {
  try {
    await mongoose.connect(mongoURI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to MongoDB Atlas');
  } catch (err) {
    console.error('❌ MongoDB connection error:', err);
    // Don't throw error to allow server to start
  }
};

connectDB();

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

// Add CORS middleware to allow frontend to connect
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  next();
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    message: 'API is running',
    mongoConnected: mongoose.connection.readyState === 1
  });
});

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
        
        // Check if database is connected
        if (mongoose.connection.readyState !== 1) {
          return res.status(500).json({ message: 'Database not connected. Please try again later.' });
        }
        
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

// Rest of your API endpoints remain the same...
// [Include all the other endpoints from your original verification_api.js file here]
