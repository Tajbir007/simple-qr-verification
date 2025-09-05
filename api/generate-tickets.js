import { v4 as uuidv4 } from 'uuid';
import mongoose from 'mongoose';

let conn = null;

const userSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: String,
  email: String,
  phone: String
});

let User;

async function connectDB() {
  if (conn == null) {
    conn = await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    User = conn.model('User', userSchema);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    await connectDB();

    const { ticketHolders } = req.body;
    if (!ticketHolders || ticketHolders.length === 0) {
      return res.status(400).json({ error: 'No ticket holders provided.' });
    }

    const tickets = [];
    for (const holder of ticketHolders) {
      const ticketId = uuidv4();
      const newUser = new User({ id: ticketId, ...holder });
      await newUser.save();
      tickets.push({ id: ticketId, ...holder });
    }

    return res.status(200).json({ tickets });
  } catch (error) {
    console.error('Ticket generation error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
