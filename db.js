// db.js - PostgreSQL Connection + Table Init + Seed Data
// ใช้ Railway PostgreSQL ผ่าน DATABASE_URL

require('dotenv').config();
const { Pool } = require('pg');

// ── Connection Pool ──────────────────────────────────────────
// Pool จัดการ connections หลายอันพร้อมกัน ไม่ต้องเปิด/ปิดทุกครั้ง
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // จำเป็นสำหรับ Railway / cloud PostgreSQL
});

// ── initDB() ────────────────────────────────────────────────
// สร้างตารางทั้งหมดถ้ายังไม่มี (IF NOT EXISTS = ปลอดภัย รันซ้ำได้)
async function initDB() {
  // ── ตาราง contacts ───────────────────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS contacts (
      id         SERIAL PRIMARY KEY,
      name       VARCHAR(100) NOT NULL,
      company    VARCHAR(100),
      email      VARCHAR(100),
      phone      VARCHAR(20),
      status     VARCHAR(20)  DEFAULT 'lead'
                 CHECK (status IN ('lead', 'prospect', 'customer', 'inactive')),
      tags       TEXT,        -- เก็บ tags เป็น comma-separated เช่น "vip,tech"
      notes      TEXT,        -- หมายเหตุเพิ่มเติม
      created_at TIMESTAMP    DEFAULT NOW(),
      updated_at TIMESTAMP    DEFAULT NOW()
    )
  `);

  // ── ตาราง deals ──────────────────────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS deals (
      id         SERIAL PRIMARY KEY,
      contact_id INTEGER      REFERENCES contacts(id) ON DELETE SET NULL,
      title      VARCHAR(200) NOT NULL,
      value      DECIMAL(10,2) DEFAULT 0,
      stage      VARCHAR(30)  DEFAULT 'new'
                 CHECK (stage IN ('new', 'contacted', 'proposal', 'negotiation', 'won', 'lost')),
      close_date DATE,        -- วันที่คาดว่าจะปิดดีล
      notes      TEXT,
      created_at TIMESTAMP    DEFAULT NOW()
    )
  `);

  console.log('✅ Database tables ready');
}

// ── seedData() ───────────────────────────────────────────────
// ใส่ข้อมูลตัวอย่างสำหรับทดสอบ
// ตรวจสอบแยก contacts และ deals เพื่อรองรับกรณี seed ล้มเหลวกลางทาง
async function seedData() {
  const cResult = await pool.query('SELECT id FROM contacts ORDER BY id');
  const dResult = await pool.query('SELECT COUNT(*) FROM deals');
  const dealCount = parseInt(dResult.rows[0].count);

  // ── Seed Contacts (ถ้ายังว่าง) ───────────────────────────
  let ids;
  if (cResult.rows.length === 0) {
    const contacts = await pool.query(`
      INSERT INTO contacts (name, company, email, phone, status, tags, notes) VALUES
        ('สมชาย ใจดี',     'บริษัท ABC จำกัด',   'somchai@abc.co.th',    '081-111-0001', 'customer',  'vip,enterprise',  'ลูกค้าประจำ ซื้อทุกไตรมาส'),
        ('สุภาพร มีสุข',   'XYZ Corporation',    'supaporn@xyz.com',     '082-222-0002', 'prospect',  'tech,startup',    'สนใจแพ็กเกจ Pro'),
        ('วิชัย รักงาน',   'Tech Startup Co.',   'wichai@techstart.io',  '083-333-0003', 'lead',      'startup',         'ติดต่อครั้งแรกจาก LinkedIn'),
        ('นภา สว่างใจ',    'Media Group Ltd.',   'napa@mediagroup.th',   '084-444-0004', 'customer',  'media,vip',       'ต่ออายุสัญญาปีนี้แล้ว'),
        ('ธนา เจริญ',      'Finance Plus Co.',   'thana@financeplus.th', '085-555-0005', 'prospect',  'finance',         'อยู่ระหว่างพิจารณาใบเสนอราคา'),
        ('กานต์ ดีงาม',    'Retail World',       'karn@retailworld.th',  '086-666-0006', 'lead',      'retail,sme',      'รู้จักจากงาน Expo'),
        ('ปิยะ มงคล',      'Health Care Co.',    'piya@healthcare.th',   '087-777-0007', 'inactive',  'health',          'หยุดใช้งานชั่วคราว'),
        ('อรอุมา สุขใส',   'Education Hub',      'aruma@eduhub.co.th',   '088-888-0008', 'customer',  'edu,government',  'ลูกค้าภาครัฐ ต้องออกใบกำกับภาษี'),
        ('ณัฐพล แสงทอง',  'Green Energy Co.',   'nat@greenenergy.th',   '089-999-0009', 'prospect',  'energy,startup',  'ต้องการ demo สัปดาห์หน้า'),
        ('พิมพ์ใจ วงศ์ดี', 'Import Export Ltd.', 'pimjai@impex.co.th',   '090-000-0010', 'customer',  'logistics,vip',   'ลูกค้า 3 ปี ไม่เคยมีปัญหา')
      RETURNING id
    `);
    ids = contacts.rows.map(r => r.id);
    console.log('🌱 Seeded 10 contacts');
  } else {
    ids = cResult.rows.map(r => r.id);
    console.log(`⏭️  Contacts exist (${ids.length} rows), checking deals...`);
  }

  // ── Seed Deals (ถ้ายังว่าง) ──────────────────────────────
  if (dealCount === 0 && ids.length >= 9) {
    // ใช้ $1-$5 ต่อเนื่องกัน, map index ของ ids ให้ถูกต้อง
    await pool.query(`
      INSERT INTO deals (contact_id, title, value, stage, close_date, notes) VALUES
        ($1, 'Enterprise License 2025',         850000.00, 'won',         '2025-03-31', 'ปิดดีลแล้ว รอออกใบแจ้งหนี้'),
        ($2, 'Pro Package Annual Subscription', 120000.00, 'proposal',    '2025-04-15', 'ส่งใบเสนอราคาแล้ว รอการตอบกลับ'),
        ($3, 'Starter Plan Pilot',               24000.00, 'contacted',   '2025-05-01', 'นัด demo วันศุกร์นี้'),
        ($4, 'Financial Dashboard Module',      380000.00, 'negotiation', '2025-04-30', 'กำลังต่อรองราคา ลดได้ไม่เกิน 10%'),
        ($5, 'Green Energy Monitoring System',  560000.00, 'new',         '2025-06-30', 'Lead ใหม่ ยังไม่ได้ติดต่อ')
    `, [ids[0], ids[1], ids[2], ids[4], ids[8]]);
    console.log('🌱 Seeded 5 deals');
  } else if (dealCount > 0) {
    console.log(`⏭️  Deals exist (${dealCount} rows), seed skipped`);
  }
}

module.exports = { pool, initDB, seedData };
