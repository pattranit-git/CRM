// server.js - Main Entry Point
// Express server หลัก: รับ requests, serve static files, และ connect routes

require('dotenv').config();           // โหลดค่าจาก .env ก่อนทุกอย่าง
const express = require('express');
const cors    = require('cors');
const path    = require('path');
const { initDB, seedData } = require('./db'); // ฟังก์ชัน init + seed database

// Import routes
const contactsRouter = require('./routes/contacts');
const dealsRouter    = require('./routes/deals');

const app  = express();
const PORT = process.env.PORT || 3000; // ใช้ PORT จาก env หรือ default 3000

// ── Middleware ───────────────────────────────────────────────
app.use(cors());                         // อนุญาต cross-origin requests
app.use(express.json());                 // parse JSON request body
app.use(express.urlencoded({ extended: true })); // parse form data

// Serve static files จากโฟลเดอร์ /public
// เมื่อเข้า http://localhost:3000 จะโหลด public/index.html
app.use(express.static(path.join(__dirname, 'public')));

// ── API Routes ───────────────────────────────────────────────
app.use('/api/contacts', contactsRouter); // CRUD สำหรับ contacts
app.use('/api/deals',    dealsRouter);    // CRUD สำหรับ deals

// Health check endpoint - ใช้ตรวจสอบว่า server ยังทำงานอยู่
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Catch-all: ส่ง index.html สำหรับทุก route ที่ไม่ใช่ API
// (รองรับ Single Page Application)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Start Server ─────────────────────────────────────────────
async function start() {
  try {
    await initDB();    // สร้าง tables ถ้ายังไม่มี
    await seedData();  // ใส่ข้อมูลตัวอย่าง (รันเฉพาะครั้งแรก)
    app.listen(PORT, () => {
      console.log(`🚀 CRM Server running at http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('❌ Failed to start server:', err.message);
    process.exit(1);
  }
}

start();
