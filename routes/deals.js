// routes/deals.js - Deals REST API
// ทุก endpoint ใช้ parameterized queries ป้องกัน SQL Injection

const express = require('express');
const router  = express.Router();
const { pool } = require('../db');

// ── GET /api/deals ───────────────────────────────────────────
// ดึง deals ทั้งหมด พร้อม JOIN contacts เพื่อเอาชื่อมาด้วย
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        d.id,
        d.title,
        d.value,
        d.stage,
        d.close_date,
        d.notes,
        d.created_at,
        d.contact_id,
        c.name    AS contact_name,   -- ชื่อจาก contacts table
        c.company AS contact_company -- บริษัทจาก contacts table
      FROM deals d
      LEFT JOIN contacts c ON d.contact_id = c.id
      ORDER BY d.created_at DESC
    `);

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/deals/pipeline ──────────────────────────────────
// สรุปมูลค่าและจำนวน deals แต่ละ stage (Sales Pipeline View)
// ต้องวางก่อน /:id เพราะ "pipeline" จะถูก match เป็น :id ถ้าวางทีหลัง
router.get('/pipeline', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        stage,
        COUNT(*)::INTEGER        AS count,
        COALESCE(SUM(value), 0) AS total_value
      FROM deals
      GROUP BY stage
      ORDER BY
        CASE stage                  -- เรียงตาม pipeline order
          WHEN 'new'         THEN 1
          WHEN 'contacted'   THEN 2
          WHEN 'proposal'    THEN 3
          WHEN 'negotiation' THEN 4
          WHEN 'won'         THEN 5
          WHEN 'lost'        THEN 6
        END
    `);

    // คำนวณ grand total ของดีลที่ยังไม่ lost
    const grandTotal = result.rows
      .filter(r => r.stage !== 'lost')
      .reduce((sum, r) => sum + parseFloat(r.total_value), 0);

    res.json({
      pipeline:    result.rows,
      grand_total: grandTotal,  // มูลค่ารวมทุก stage (ยกเว้น lost)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/deals ──────────────────────────────────────────
// สร้าง deal ใหม่
router.post('/', async (req, res) => {
  try {
    const { contact_id, title, value, stage, close_date, notes } = req.body;

    // ── Validation ───────────────────────────────────────────
    if (!title || title.trim() === '') {
      return res.status(400).json({ error: 'Title is required' });
    }

    const validStages = ['new', 'contacted', 'proposal', 'negotiation', 'won', 'lost'];
    if (stage && !validStages.includes(stage)) {
      return res.status(400).json({
        error: `Stage must be one of: ${validStages.join(', ')}`
      });
    }

    // ตรวจสอบว่า contact_id มีอยู่จริงในฐานข้อมูล
    if (contact_id) {
      const check = await pool.query(
        'SELECT id FROM contacts WHERE id = $1',
        [contact_id]
      );
      if (check.rows.length === 0) {
        return res.status(400).json({ error: 'Contact not found' });
      }
    }

    const result = await pool.query(
      `INSERT INTO deals (contact_id, title, value, stage, close_date, notes)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        contact_id  || null,
        title.trim(),
        value       || 0,
        stage       || 'new',
        close_date  || null, // DATE หรือ null
        notes?.trim() || null,
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/deals/:id ───────────────────────────────────────
// แก้ไข deal
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { contact_id, title, value, stage, close_date, notes } = req.body;

    // ── Validation ───────────────────────────────────────────
    if (!title || title.trim() === '') {
      return res.status(400).json({ error: 'Title is required' });
    }

    const validStages = ['new', 'contacted', 'proposal', 'negotiation', 'won', 'lost'];
    if (stage && !validStages.includes(stage)) {
      return res.status(400).json({
        error: `Stage must be one of: ${validStages.join(', ')}`
      });
    }

    const result = await pool.query(
      `UPDATE deals
       SET
         contact_id = $1,
         title      = $2,
         value      = $3,
         stage      = $4,
         close_date = $5,
         notes      = $6
       WHERE id = $7
       RETURNING *`,
      [
        contact_id  || null,
        title.trim(),
        value       || 0,
        stage       || 'new',
        close_date  || null,
        notes?.trim() || null,
        id,
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Deal not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/deals/:id ────────────────────────────────────
// ลบ deal
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM deals WHERE id = $1 RETURNING id, title',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Deal not found' });
    }

    res.json({
      message: `Deal "${result.rows[0].title}" deleted`,
      id: result.rows[0].id,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
