# 🎟️ QR Code Ticket Verification System

A full-stack web application for **secure ticket generation, management, and verification** using **QR codes**.  
Built with **Node.js**, **Express**, **MongoDB**, and a **TailwindCSS** frontend.

---

## 💻 Demo Site
- Demo Link: https://qr-code-verify.onrender.com/
- Credentials:
  Username: DemoUser
  Password: Demo@1234

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
- Admin-only pages and routes protected by a **server-side session** (HttpOnly cookie)
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
├── server.js               # Main backend API (Express + MongoDB)
├── public/                 # Served to everyone
│   ├── index.html / .js    # Ticket verification page (for users)
│   ├── login.html / .js    # Admin login page
│   └── qrcode.min.js       # QR code library (qrcodejs, self-hosted)
├── private/                # Served only to a logged-in admin
│   └── admin.html / .js    # Admin dashboard (for ticket management)
├── security.test.js        # Security regression checks (npm test)
├── .env                    # Environment variables (never commit this)
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
See `env.example` for the optional `TRUST_PROXY` and `NODE_ENV` settings used in production.

### 4️⃣ Start the server
```bash
npm start
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
Log in with your admin credentials.  
(You can manually create an admin user in MongoDB: a document in the `admins` collection with a
`username` and a `password` that is a **bcrypt hash**, never the plain password. Generate the hash with
`node -e "import('bcryptjs').then(b => b.default.hash(process.argv[1], 12)).then(console.log)" "your-password"`.)

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
| `POST` | `/api/login` | Admin login (sets the session cookie) |
| `POST` | `/api/logout` | Admin logout (ends the session) |
| `POST` | `/api/generate-tickets` | Generate new tickets (admin) |
| `GET` | `/api/tickets` | View all tickets (admin) |
| `GET` | `/api/verify/:id` | Verify a ticket (public) |
| `POST` | `/api/reset-ticket/:id` | Reset a used ticket (admin) |
| `POST` | `/api/reset-all-tickets` | Reset every ticket (admin) |
| `DELETE` | `/api/delete-ticket/:id` | Delete a ticket (admin) |

---

## 🧰 Technologies Used
- **Frontend:** HTML, TailwindCSS, JavaScript  
- **Backend:** Node.js, Express.js  
- **Database:** MongoDB Atlas (via Mongoose)  
- **Libraries:** bcryptjs, dotenv, helmet, express-rate-limit, [qrcodejs](https://github.com/davidshimjs/qrcodejs) (MIT, self-hosted copy in `public/`)

---

## 🛡️ Security Notes
- Admin login creates a random **server-side session** stored (hashed) in MongoDB; the browser only holds it
  in an `HttpOnly`, `SameSite=Strict` cookie (`Secure` in production). Sessions last 8 hours and end on logout.
- The admin dashboard and every admin API route check that session **on the server**
- **Rate limiting:** 10 failed logins per IP and 20 per username every 15 minutes; 300 API requests per IP per minute
- Cross-site requests to the API are rejected (CSRF protection); the API is same-origin only (no CORS)
- Security headers via helmet, including a **Content Security Policy** that blocks inline scripts
- Request data is validated, and ticket details are escaped before being shown
- Passwords are hashed using **bcrypt**
- Tickets automatically mark as used after verification to prevent reuse

Run the security checks against a **throwaway** database (never your real one):
```bash
TEST_MONGO_URI=mongodb://localhost:27017/qr-test npm test
```

---

## 🚀 Deployment
- The build command must install dependencies (`npm install`); `node_modules` is not in the repository.
- Serve the app over **HTTPS** and set `NODE_ENV=production` (Render sets it automatically).
  Without it the session cookie is not marked `Secure`.
- Set **`TRUST_PROXY`** to the number of reverse proxies in front of the app, otherwise all visitors share
  one rate-limit bucket. To find the value: start with `TRUST_PROXY=1`, log in, and look for
  `Admin login: <user> from <ip>` in the server log. If `<ip>` is not your own public IP, raise the value
  by one and try again. Use the smallest value that shows your real IP, never a larger one.
- Do not keep demo or shared admin accounts in a database that holds real tickets.

---

## 🧑‍💻 Author
**Tajbir Prottoy**  
💼 [GitHub](https://github.com/Tajbir007)

---

## 📄 License
This project is licensed under the **MIT License** — free for personal and commercial use.



