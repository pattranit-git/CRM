// routes/contacts.js - Contacts REST API
// ทุก endpoint ใช้ parameterized queries ($1, $2, ...) ป้องกัน SQL Injection

const express = require('express');
const router  = express.Router();
const { pool } = require('../db');

// ── GET /api/contacts ────────────────────────────────────────
// ดึงรายการทั้งหมด รองรับ query params:
//   ?search=คำค้น  → ค้นหาใน name, email, company
//   ?status=lead   → กรองตาม status
router.get('/', async (req, res) => {
  try {
    const { search, status } = req.query;

    // สร้าง WHERE clause แบบ dynamic ตาม query params ที่ส่งมา
    const conditions = [];
    const values     = [];

    if (search) {
      values.push(`%${search}%`);
      // ค้นหาใน 3 field พร้อมกัน (case-insensitive ด้วย ILIKE)
      conditions.push(`(name ILIKE $${values.length} OR email ILIKE $${values.length} OR company ILIKE $${values.length})`);
    }

    if (status) {
      values.push(status);
      conditions.push(`status = $${values.length}`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await pool.query(
      `SELECT * FROM contacts ${where} ORDER BY created_at DESC`,
      values
    );

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/contacts/export ─────────────────────────────────
// ดึง contacts ทั้งหมดพร้อม deals แล้วส่งเป็น CSV
// ต้องวางก่อน /:id เพื่อไม่ให้ "export" ถูก match เป็น param
router.get('/export', async (req, res) => {
  try {
    // ดึง contacts พร้อม deal count และ deal value รวม
    const result = await pool.query(`
      SELECT
        c.id,
        c.name,
        c.company,
        c.email,
        c.phone,
        c.status,
        c.tags,
        c.notes,
        c.created_at,
        COUNT(d.id)::INTEGER          AS deal_count,
        COALESCE(SUM(d.value), 0)     AS deal_total_value,
        STRING_AGG(d.title, ' | ')    AS deal_titles
      FROM contacts c
      LEFT JOIN deals d ON d.contact_id = c.id
      GROUP BY c.id
      ORDER BY c.created_at DESC
    `);

    // ── สร้าง CSV ────────────────────────────────────────────
    const headers = [
      'ID', 'ชื่อ-นามสกุล', 'บริษัท', 'อีเมล', 'เบอร์โทร',
      'Status', 'Tags', 'Notes', 'วันที่สร้าง',
      'จำนวน Deals', 'มูลค่า Deals รวม', 'รายชื่อ Deals',
    ];

    // escape field: ครอบด้วย "" และ escape " → ""
    const escapeCSV = (val) => {
      if (val === null || val === undefined) return '';
      const str = String(val);
      // ถ้ามี comma, newline, หรือ " ให้ครอบด้วย quotes
      if (str.includes(',') || str.includes('\n') || str.includes('"')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const rows = result.rows.map(c => [
      c.id,
      c.name,
      c.company,
      c.email,
      c.phone,
      c.status,
      c.tags,
      c.notes,
      c.created_at ? new Date(c.created_at).toLocaleDateString('th-TH') : '',
      c.deal_count,
      c.deal_total_value,
      c.deal_titles,
    ].map(escapeCSV).join(','));

    // รวม header + rows
    const csv = [headers.join(','), ...rows].join('\r\n');

    // ── ตั้งชื่อไฟล์ contacts-YYYY-MM-DD.csv ─────────────────
    const today    = new Date().toISOString().split('T')[0]; // "2025-04-01"
    const filename = `contacts-${today}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    // BOM \uFEFF ต้นไฟล์ → ทำให้ Excel อ่านภาษาไทยได้ถูกต้อง
    res.send('\uFEFF' + csv);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/contacts/stats ──────────────────────────────────
// สรุปจำนวน contacts แต่ละ status
// ต้องวางก่อน /:id เพราะ Express จะ match "stats" เป็น :id ถ้าวางทีหลัง
router.get('/stats', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        status,
        COUNT(*)::INTEGER AS count
      FROM contacts
      GROUP BY status
      ORDER BY count DESC
    `);

    // แปลงผลลัพธ์เป็น object { lead: 3, customer: 5, ... }
    const stats = {};
    result.rows.forEach(row => {
      stats[row.status] = row.count;
    });

    // รวมยอด total ทั้งหมด
    const total = result.rows.reduce((sum, row) => sum + row.count, 0);

    res.json({ total, breakdown: stats });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/contacts/:id ────────────────────────────────────
// ดึง contact รายบุคคล พร้อม deals ที่ผูกไว้
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // ดึงข้อมูล contact
    const contact = await pool.query(
      'SELECT * FROM contacts WHERE id = $1',
      [id]
    );

    if (contact.rows.length === 0) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    // ดึง deals ที่ผูกกับ contact นี้ด้วย
    const deals = await pool.query(
      'SELECT id, title, value, stage, close_date FROM deals WHERE contact_id = $1 ORDER BY created_at DESC',
      [id]
    );

    res.json({
      ...contact.rows[0],
      deals: deals.rows, // แนบ deals มาด้วยใน response
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/contacts ───────────────────────────────────────
// เพิ่ม contact ใหม่
router.post('/', async (req, res) => {
  try {
    const { name, company, email, phone, status, tags, notes } = req.body;

    // ── Validation ───────────────────────────────────────────
    if (!name || name.trim() === '') {
      return res.status(400).json({ error: 'Name is required' });
    }
    if (!email || email.trim() === '') {
      return res.status(400).json({ error: 'Email is required' });
    }

    // ตรวจสอบ status ให้อยู่ใน list ที่กำหนด
    const validStatuses = ['lead', 'prospect', 'customer', 'inactive'];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({
        error: `Status must be one of: ${validStatuses.join(', ')}`
      });
    }

    const result = await pool.query(
      `INSERT INTO contacts (name, company, email, phone, status, tags, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        name.trim(),
        company?.trim() || null,
        email.trim(),
        phone?.trim()   || null,
        status          || 'lead',
        tags?.trim()    || null,
        notes?.trim()   || null,
      ]
    );

    res.status(201).json(result.rows[0]); // 201 = Created
  } catch (err) {
    // ดัก duplicate email (unique constraint violation)
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Email already exists' });
    }
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/contacts/:id ────────────────────────────────────
// แก้ไข contact + auto update updated_at
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, company, email, phone, status, tags, notes } = req.body;

    // ── Validation ───────────────────────────────────────────
    if (!name || name.trim() === '') {
      return res.status(400).json({ error: 'Name is required' });
    }
    if (!email || email.trim() === '') {
      return res.status(400).json({ error: 'Email is required' });
    }

    const validStatuses = ['lead', 'prospect', 'customer', 'inactive'];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({
        error: `Status must be one of: ${validStatuses.join(', ')}`
      });
    }

    const result = await pool.query(
      `UPDATE contacts
       SET
         name       = $1,
         company    = $2,
         email      = $3,
         phone      = $4,
         status     = $5,
         tags       = $6,
         notes      = $7,
         updated_at = NOW()   -- auto update timestamp ทุกครั้งที่แก้ไข
       WHERE id = $8
       RETURNING *`,
      [
        name.trim(),
        company?.trim() || null,
        email.trim(),
        phone?.trim()   || null,
        status          || 'lead',
        tags?.trim()    || null,
        notes?.trim()   || null,
        id,
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/contacts/:id ─────────────────────────────────
// ลบ contact (deals ที่ผูกอยู่จะ SET contact_id = NULL อัตโนมัติ)
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM contacts WHERE id = $1 RETURNING id, name',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    res.json({
      message: `Contact "${result.rows[0].name}" deleted`,
      id: result.rows[0].id,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
