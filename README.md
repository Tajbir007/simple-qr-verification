# 🎟️ QR Code Ticket Verification System

A full-stack web application for **secure ticket generation, management, and verification** using **QR codes**.  
Built with **Node.js**, **Express**, **MongoDB**, and a **TailwindCSS** frontend.

---

## 🚀 Features

### 🎫 Ticket Management
- Generate unique tickets with **UUIDs**
- Automatic **QR code generation** for each ticket
- Store ticket data in **MongoDB**
- Prevent duplicate emails during ticket creation
- Real-time ticket status updates

### ✅ Ticket Verification
- Scan or open a QR code to verify ticket authenticity
- Displays one of three states:
  - **Authentic** (valid ticket)
  - **Already Used**
  - **Not Found**
- Automatically marks tickets as **used** after verification

### 🔐 Admin Dashboard
- Secure **login system** with bcrypt password hashing
- Admin-only routes protected by an **authorization token**
- Manage tickets:
  - Generate tickets 
  - View all tickets
  - Reset used tickets
  - Delete tickets
  - Live status refresh every 5 seconds

---

## 🧩 Project Structure

```
📦 qr-code-verify-website
├── verification_api.js     # Main backend API (Express + MongoDB)
├── public/
│   ├── index.html          # Ticket verification page (for users)
│   ├── admin.html          # Admin dashboard (for ticket management)
│   └── login.html          # Admin login page
├── .env                    # Environment variables
└── README.md               # Documentation
```

---

## ⚙️ Installation

### 1️⃣ Clone the repository
```bash
git clone https://github.com/<your-username>/qr-code-verify-website.git
cd qr-code-verify-website
```

### 2️⃣ Install dependencies
```bash
npm install
```

### 3️⃣ Set up environment variables
Create a `.env` file in the project root:
```env
MONGO_URI=your_mongodb_connection_string
PORT=3000
```

### 4️⃣ Start the server
```bash
node verification_api.js
```

Server will start at:
```
http://localhost:3000
```

---

## 🧠 Usage

### 🔑 Admin Access
Visit:
```
http://localhost:3000/login.html
```
Demo login:
Username: DemoUser
Password: Demo@1234

Log in with your admin credentials.  
(You can manually create an admin user in MongoDB.)

### 🎟️ Generate Tickets
- Add attendee details (Name, Email, Phone)
- Click **Generate Tickets**
- QR codes will be generated instantly

### 📱 Verify Tickets
- Open or scan a QR code (it links to `/index.html?id=<ticket_id>`)
- The verification page displays the ticket status:
  - ✅ Authentic
  - ⚠️ Already Used
  - ❌ Not Found

---

## 🧾 API Endpoints

| Method | Route | Description |
|--------|--------|-------------|
| `POST` | `/api/login` | Admin login |
| `POST` | `/api/generate-tickets` | Generate new tickets |
| `GET` | `/api/tickets` | View all tickets |
| `GET` | `/api/verify/:id` | Verify a ticket |
| `POST` | `/api/reset-ticket/:id` | Reset a used ticket |
| `DELETE` | `/api/delete-ticket/:id` | Delete a ticket |

---

## 🧰 Technologies Used
- **Frontend:** HTML, TailwindCSS, JavaScript  
- **Backend:** Node.js, Express.js  
- **Database:** MongoDB Atlas (via Mongoose)  
- **Libraries:** UUID, bcryptjs, dotenv

---

## 🛡️ Security Notes
- Admin routes require a secret **authorization token**
- Passwords are hashed using **bcrypt**
- Tickets automatically mark as used after verification to prevent reuse

---

## 🧑‍💻 Author
**Your Name**  
💼 [GitHub](https://github.com/Tajbir007)

---

## 📄 License
This project is licensed under the **MIT License** — free for personal and commercial use.

