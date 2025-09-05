import { connectDB } from "../_db.js";

export default async function handler(req, res) {
  const { id } = req.query;

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { User } = await connectDB();
    const user = await User.findOne({ id }).lean();

    if (user) {
      return res.status(200).json({ authentic: true, data: user });
    } else {
      return res.status(404).json({ authentic: false, message: "Ticket not found" });
    }
  } catch (error) {
    console.error("Verification error:", error);
    return res.status(500).json({ authentic: false, message: "Internal server error" });
  }
}
