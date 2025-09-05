import mongoose from "mongoose";

let conn = null;
let User = null;

const userSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: String,
  email: String,
  phone: String,
});

export async function connectDB() {
  if (!conn) {
    conn = await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    User = conn.model("User", userSchema);
  }
  return { User };
}
