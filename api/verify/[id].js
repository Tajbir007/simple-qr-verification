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
  const { id } = req.query;

  try {
    await connectDB();
    const user = await User.findOne({ id }).lean();

    if (user) {
      return res.status(200).json({ authentic: true, data: user });
    } else {
      return res.status(404).json({ authentic: false, message: 'Ticket not found' });
    }
  } catch (error) {
    console.error('Verification error:', error);
    return res.status(500).json({ authentic: false, message: 'Internal server error' });
  }
}
