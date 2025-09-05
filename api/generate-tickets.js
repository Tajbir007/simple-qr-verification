import { v4 as uuidv4 } from "uuid";
import { connectDB } from "./_db.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { User } = await connectDB();
    const { ticketHolders } = req.body;

    if (!ticketHolders || ticketHolders.length === 0) {
      return res.status(400).json({ error: "No ticket holders provided." });
    }

    const tickets = [];
    for (const holder of ticketHolders) {
      const ticketId = uuidv4();
      const newUser = new User({
        id: ticketId,
        name: holder.name,
        email: holder.email,
        phone: holder.phone,
      });
      await newUser.save();
      tickets.push({ id: ticketId, ...holder });
    }

    return res.status(200).json({ tickets });
  } catch (error) {
    console.error("Ticket generation error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
