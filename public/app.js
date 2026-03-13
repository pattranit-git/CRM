// app.js - CRM Frontend Logic
// ติดต่อ REST API และจัดการ UI ทั้งหมด

const API = '/api';

// ── State ────────────────────────────────────────────────────
// เก็บข้อมูลใน memory เพื่อ filter โดยไม่ต้องเรียก API ซ้ำ
let allContacts = [];   // contacts ทั้งหมดที่โหลดมา
let editingId   = null; // null = Add mode, number = Edit mode

// ── Utility ──────────────────────────────────────────────────

function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2800);
}

function formatMoney(n) {
  return '฿' + Number(n || 0).toLocaleString('th-TH');
}

function badge(cls, text) {
  return `<span class="badge badge-${cls}">${text}</span>`;
}

function renderTags(tags) {
  if (!tags) return '—';
  return tags.split(',').map(t => t.trim()).filter(Boolean)
    .map(t => `<span class="tag">${t}</span>`).join(' ');
}

// ── Tab Switching ─────────────────────────────────────────────

function switchTab(tab, btn) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(tab).classList.add('active');
  btn.classList.add('active');

  if (tab === 'dashboard') loadStats();
  if (tab === 'contacts')  loadContacts();
  if (tab === 'deals')     loadDeals();
}

// ── loadStats() ───────────────────────────────────────────────
// GET /api/contacts/stats + /api/deals/pipeline → update dashboard cards

async function loadStats() {
  try {
    const [stats, pipeline] = await Promise.all([
      fetch(`${API}/contacts/stats`).then(r => r.json()),
      fetch(`${API}/deals/pipeline`).then(r => r.json()),
    ]);

    document.getElementById('stat-contacts').textContent  = stats.total || 0;
    document.getElementById('stat-customers').textContent = stats.breakdown?.customer || 0;

    const totalDeals = pipeline.pipeline?.reduce((s, p) => s + p.count, 0) || 0;
    document.getElementById('stat-deals').textContent = totalDeals;

    const wonRow = pipeline.pipeline?.find(p => p.stage === 'won');
    document.getElementById('stat-won-value').textContent =
      formatMoney(wonRow?.total_value || 0);
  } catch (err) {
    console.error('loadStats error:', err);
  }
}

// ── loadContacts() ────────────────────────────────────────────
// GET /api/contacts → เก็บใน allContacts → render ตาราง

async function loadContacts() {
  const tbody = document.getElementById('contacts-body');
  tbody.innerHTML = '<tr class="empty-row"><td colspan="8">Loading...</td></tr>';

  try {
    const res  = await fetch(`${API}/contacts`);
    allContacts = await res.json();
    renderContactsTable(allContacts, '');
  } catch (err) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="8">❌ โหลดข้อมูลไม่สำเร็จ</td></tr>`;
  }
}

// ── Highlight Helper ─────────────────────────────────────────
// wrap คำที่ match ด้วย <mark> เพื่อ highlight ในตาราง
// escape HTML ก่อนเพื่อป้องกัน XSS

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function highlight(text, keyword) {
  if (!text) return '—';
  const safe = escapeHtml(text);
  if (!keyword) return safe;
  // สร้าง regex แบบ global + case-insensitive
  const re = new RegExp(`(${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  return safe.replace(re, '<mark>$1</mark>');
}

// ── renderContactsTable(contacts, keyword) ───────────────────
// render ตารางพร้อม highlight คำค้น และแสดงจำนวนผลลัพธ์

function renderContactsTable(contacts, keyword = '') {
  const tbody  = document.getElementById('contacts-body');
  const total  = allContacts.length;
  const found  = contacts.length;

  // อัปเดต result bar
  updateResultBar(found, total, keyword || document.getElementById('status-filter').value);

  if (found === 0) {
    tbody.innerHTML = `
      <tr class="empty-row">
        <td colspan="8">
          <div style="font-size:2rem;margin-bottom:8px">🔍</div>
          ไม่พบข้อมูลที่ค้นหา
          <div style="font-size:0.82rem;color:#bbb;margin-top:4px">ลองเปลี่ยนคำค้นหรือ filter</div>
        </td>
      </tr>`;
    return;
  }

  tbody.innerHTML = contacts.map(c => `
    <tr>
      <td style="color:#aaa;font-size:0.8rem">${c.id}</td>
      <td><strong>${highlight(c.name, keyword)}</strong></td>
      <td>${highlight(c.company, keyword)}</td>
      <td>${highlight(c.email, keyword)}</td>
      <td>${highlight(c.phone, keyword)}</td>
      <td>${badge(c.status, c.status)}</td>
      <td>${renderTags(c.tags)}</td>
      <td style="white-space:nowrap">
        <button class="btn btn-edit"   onclick="openEditModal(${c.id})">Edit</button>
        <button class="btn btn-danger" onclick="deleteContact(${c.id}, '${escapeHtml(c.name).replace(/'/g, "\\'")}')">Delete</button>
      </td>
    </tr>
  `).join('');
}

// ── updateResultBar() ────────────────────────────────────────
// แสดงแถบ "แสดง X จาก Y รายการ" + ปุ่ม Clear (เมื่อมี filter)

function updateResultBar(found, total, hasFilter) {
  let bar = document.getElementById('result-bar');

  // สร้าง bar ครั้งแรกถ้ายังไม่มี
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'result-bar';
    bar.style.cssText = `
      display:flex; align-items:center; justify-content:space-between;
      padding:8px 14px; background:#f8f9fa; border-bottom:1px solid #f0f0f0;
      font-size:0.85rem; color:#666; min-height:38px;
    `;
    const table = document.querySelector('#contacts .card table');
    table.parentNode.insertBefore(bar, table);
  }

  if (!hasFilter && found === total) {
    // ไม่มี filter → ซ่อน bar
    bar.style.display = 'none';
    return;
  }

  bar.style.display = 'flex';
  const isFiltered = found < total;
  bar.innerHTML = `
    <span>
      แสดง <strong style="color:${isFiltered ? '#1a73e8' : '#333'}">${found}</strong>
      จาก <strong>${total}</strong> รายการ
      ${hasFilter ? `<span style="color:#aaa;margin-left:6px">(มี filter ใช้งานอยู่)</span>` : ''}
    </span>
    ${hasFilter || isFiltered
      ? `<button class="btn btn-ghost" onclick="clearFilter()"
           style="padding:4px 12px;font-size:0.8rem;border:1px solid #ddd">
           ✕ Clear filter
         </button>`
      : ''}
  `;
}

// ── clearFilter() ────────────────────────────────────────────
// ล้าง search + status filter กลับสู่ค่าเริ่มต้น

function clearFilter() {
  document.getElementById('search-input').value  = '';
  document.getElementById('status-filter').value = '';
  renderContactsTable(allContacts);
}

// ── Debounce Helper ───────────────────────────────────────────
// delay การเรียกฟังก์ชัน fn จนกว่าผู้ใช้จะหยุดพิมพ์ครบ `delay` ms

function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

// ── filterContacts() ──────────────────────────────────────────
// กรอง allContacts ตาม keyword (ชื่อ/บริษัท/อีเมล/เบอร์) + status
// ใช้ debounce 300ms เพื่อไม่ให้ render ทุก keystroke

const filterContacts = debounce(() => {
  const keyword = document.getElementById('search-input').value.trim().toLowerCase();
  const status  = document.getElementById('status-filter').value;

  let filtered = allContacts;

  // กรอง keyword — ค้นใน 4 fields พร้อมกัน
  if (keyword) {
    filtered = filtered.filter(c =>
      (c.name    || '').toLowerCase().includes(keyword) ||
      (c.company || '').toLowerCase().includes(keyword) ||
      (c.email   || '').toLowerCase().includes(keyword) ||
      (c.phone   || '').toLowerCase().includes(keyword)
    );
  }

  // กรอง status ซ้อนทับ keyword
  if (status) {
    filtered = filtered.filter(c => c.status === status);
  }

  // ส่ง keyword ไป render เพื่อ highlight
  renderContactsTable(filtered, keyword);
}, 300);

// ── exportCSV() ───────────────────────────────────────────────
// สร้าง invisible <a> แล้วคลิกอัตโนมัติ → browser download ไฟล์ทันที
function exportCSV() {
  const a = document.createElement('a');
  a.href     = `${API}/contacts/export`;
  a.download = ''; // ชื่อไฟล์ใช้จาก Content-Disposition header ของ server
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  toast('⬇ กำลัง Export CSV...');
}

// ── openAddModal() ────────────────────────────────────────────
// เปิด modal ว่าง พร้อม reset form และตั้ง mode เป็น Add

function openAddModal() {
  editingId = null;
  document.getElementById('modal-title').textContent = 'Add Contact';
  document.getElementById('submit-btn').textContent  = 'Save';
  resetForm();
  openModal();
}

// ── openEditModal(id) ─────────────────────────────────────────
// GET /api/contacts/:id → pre-fill form → เปิด modal ใน Edit mode

async function openEditModal(id) {
  editingId = id;
  document.getElementById('modal-title').textContent = 'Edit Contact';
  document.getElementById('submit-btn').textContent  = 'Update';
  resetForm();
  openModal();

  // แสดง loading state ใน modal ชั่วคราว
  const submitBtn = document.getElementById('submit-btn');
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<span class="spinner"></span>Loading...';

  try {
    const res  = await fetch(`${API}/contacts/${id}`);
    const data = await res.json();

    // Pre-fill ข้อมูลเดิมทุก field
    document.getElementById('f-name').value    = data.name    || '';
    document.getElementById('f-company').value = data.company || '';
    document.getElementById('f-email').value   = data.email   || '';
    document.getElementById('f-phone').value   = data.phone   || '';
    document.getElementById('f-status').value  = data.status  || 'lead';
    document.getElementById('f-tags').value    = data.tags    || '';
    document.getElementById('f-notes').value   = data.notes   || '';
  } catch (err) {
    toast('❌ โหลดข้อมูลไม่สำเร็จ');
    closeModal();
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Update';
  }
}

// ── saveContact() ─────────────────────────────────────────────
// Validate → POST (Add) หรือ PUT (Edit) → ปิด modal + refresh

async function saveContact() {
  // ── Validate ─────────────────────────────────────────────
  const name  = document.getElementById('f-name').value.trim();
  const email = document.getElementById('f-email').value.trim();
  let valid   = true;

  if (!name) {
    showError('f-name', 'err-name');
    valid = false;
  }
  if (!email || !isValidEmail(email)) {
    showError('f-email', 'err-email');
    valid = false;
  }
  if (!valid) return;

  // ── Loading State ─────────────────────────────────────────
  const submitBtn = document.getElementById('submit-btn');
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<span class="spinner"></span>Saving...';

  const body = {
    name,
    company: document.getElementById('f-company').value.trim() || null,
    email,
    phone:   document.getElementById('f-phone').value.trim()   || null,
    status:  document.getElementById('f-status').value,
    tags:    document.getElementById('f-tags').value.trim()     || null,
    notes:   document.getElementById('f-notes').value.trim()   || null,
  };

  try {
    // เลือก method ตาม mode
    const url    = editingId ? `${API}/contacts/${editingId}` : `${API}/contacts`;
    const method = editingId ? 'PUT' : 'POST';

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.json();
      toast('❌ ' + err.error);
      return;
    }

    toast(editingId ? '✅ อัปเดตข้อมูลแล้ว' : '✅ เพิ่ม Contact แล้ว');
    closeModal();
    loadContacts(); // refresh ตาราง
  } catch (err) {
    toast('❌ เกิดข้อผิดพลาด กรุณาลองใหม่');
  } finally {
    // คืน button กลับปกติเสมอ
    submitBtn.disabled = false;
    submitBtn.textContent = editingId ? 'Update' : 'Save';
  }
}

// ── deleteContact(id, name) ───────────────────────────────────
// Confirm dialog → DELETE /api/contacts/:id → refresh ตาราง

async function deleteContact(id, name) {
  if (!confirm(`ต้องการลบ "${name}" ใช่หรือไม่?`)) return;

  try {
    const res = await fetch(`${API}/contacts/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error();
    toast(`🗑️ ลบ "${name}" แล้ว`);
    loadContacts();
  } catch {
    toast('❌ ลบข้อมูลไม่สำเร็จ');
  }
}

// ── Deals — Kanban Board ──────────────────────────────────────

// Config แต่ละ stage: label ที่แสดง + class สำหรับสี
const STAGES = [
  { key: 'new',         label: 'New' },
  { key: 'contacted',   label: 'Contacted' },
  { key: 'proposal',    label: 'Proposal' },
  { key: 'negotiation', label: 'Negotiation' },
  { key: 'won',         label: 'Won' },
  { key: 'lost',        label: 'Lost' },
];

let editingDealId = null; // null = Add, number = Edit

async function loadDeals() {
  try {
    const [deals, pipeline] = await Promise.all([
      fetch(`${API}/deals`).then(r => r.json()),
      fetch(`${API}/deals/pipeline`).then(r => r.json()),
    ]);

    renderSummaryBar(pipeline.pipeline || []);
    renderKanban(deals, pipeline.pipeline || []);
  } catch (err) {
    console.error('loadDeals error:', err);
    document.getElementById('kanban-board').innerHTML =
      '<p style="color:#e53935;padding:20px">❌ โหลดข้อมูลไม่สำเร็จ</p>';
  }
}

// ── renderSummaryBar() ────────────────────────────────────────
function renderSummaryBar(pipeline) {
  // มูลค่ารวม active (ยกเว้น lost)
  const totalActive = pipeline
    .filter(p => p.stage !== 'lost')
    .reduce((s, p) => s + parseFloat(p.total_value || 0), 0);

  const wonRow   = pipeline.find(p => p.stage === 'won');
  const wonValue = parseFloat(wonRow?.total_value || 0);
  const wonCount = wonRow?.count || 0;

  // Win rate = won / (won + lost) × 100
  const lostRow  = pipeline.find(p => p.stage === 'lost');
  const lostCount = lostRow?.count || 0;
  const winRate  = (wonCount + lostCount) > 0
    ? Math.round((wonCount / (wonCount + lostCount)) * 100)
    : 0;

  document.getElementById('sum-total-value').textContent = formatMoney(totalActive);
  document.getElementById('sum-won-value').textContent   = `${formatMoney(wonValue)} (${wonCount} deals)`;
  document.getElementById('sum-win-rate').textContent    = `${winRate}%`;
}

// ── renderKanban() ────────────────────────────────────────────
function renderKanban(deals, pipeline) {
  // จัด deals ตาม stage เป็น map { stage: [deals] }
  const byStage = {};
  STAGES.forEach(s => { byStage[s.key] = []; });
  deals.forEach(d => {
    if (byStage[d.stage]) byStage[d.stage].push(d);
  });

  // สร้าง lookup pipeline summary
  const pipeMap = {};
  pipeline.forEach(p => { pipeMap[p.stage] = p; });

  const board = document.getElementById('kanban-board');
  board.innerHTML = STAGES.map(({ key, label }) => {
    const stageDeals = byStage[key] || [];
    const meta       = pipeMap[key] || { count: 0, total_value: 0 };

    const cards = stageDeals.length === 0
      ? `<div class="col-empty">ไม่มีดีล</div>`
      : stageDeals.map(d => renderDealCard(d)).join('');

    return `
      <div class="kanban-col col-${key}">
        <div class="col-header">
          <div>${label}</div>
          <div class="col-meta">
            <span class="col-count">${meta.count}</span>
            <span class="col-value">${formatMoney(meta.total_value)}</span>
          </div>
        </div>
        <div class="col-body">${cards}</div>
      </div>
    `;
  }).join('');
}

// ── renderDealCard() ──────────────────────────────────────────
function renderDealCard(d) {
  const closeDate = d.close_date
    ? new Date(d.close_date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })
    : null;

  const safeTitle = escapeHtml(d.title).replace(/'/g, "\\'");

  // สร้าง option list สำหรับ stage changer (ข้าม stage ปัจจุบัน)
  const stageOptions = STAGES
    .filter(s => s.key !== d.stage)
    .map(s => `<option value="${s.key}">${s.label}</option>`)
    .join('');

  return `
    <div class="deal-card" id="deal-card-${d.id}">
      <div class="deal-title">${escapeHtml(d.title)}</div>
      <div class="deal-contact">👤 ${d.contact_name ? escapeHtml(d.contact_name) : '<span style="color:#ccc">ไม่ระบุ</span>'}</div>
      <div class="deal-value">${formatMoney(d.value)}</div>
      ${closeDate ? `<div class="deal-date">📅 ${closeDate}</div>` : ''}

      <!-- Stage Changer: เปลี่ยน stage ได้โดยตรงจาก card -->
      <div class="stage-changer">
        <span class="stage-label">ย้ายไป →</span>
        <select class="stage-select" onchange="changeStage(${d.id}, this)">
          <option value="">เลือก stage</option>
          ${stageOptions}
        </select>
      </div>

      <div class="deal-actions">
        <button class="btn btn-edit"   onclick="openEditDealModal(${d.id})">Edit</button>
        <button class="btn btn-danger" onclick="deleteDeal(${d.id}, '${safeTitle}')">Del</button>
      </div>
    </div>
  `;
}

// ── changeStage(id, selectEl) ─────────────────────────────────
// เปลี่ยน stage ของ deal โดยตรงจาก dropdown บน card
// ส่ง PATCH-style ด้วย PUT (ส่งข้อมูลเดิมพร้อม stage ใหม่)
async function changeStage(id, selectEl) {
  const newStage = selectEl.value;
  if (!newStage) return;

  // Optimistic UI: ปิด select ระหว่างรอ
  selectEl.disabled = true;

  try {
    // ดึงข้อมูลเดิมทั้งหมดก่อน แล้วอัปเดตแค่ stage
    const current = await fetch(`${API}/deals/${id}`).then(r => r.json());

    const res = await fetch(`${API}/deals/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...current, stage: newStage, contact_id: current.contact_id }),
    });

    if (!res.ok) throw new Error();

    const stageName = STAGES.find(s => s.key === newStage)?.label || newStage;
    toast(`✅ ย้ายไป "${stageName}" แล้ว`);
    loadDeals(); // refresh kanban + summary bar
  } catch {
    toast('❌ เปลี่ยน stage ไม่สำเร็จ');
    selectEl.disabled = false;
    selectEl.value = ''; // reset
  }
}

// ── openAddDealModal() ────────────────────────────────────────
async function openAddDealModal() {
  editingDealId = null;
  document.getElementById('deal-modal-title').textContent = 'New Deal';
  document.getElementById('deal-submit-btn').textContent  = 'Save';
  resetDealForm();
  await populateContactDropdown();
  openDealModal();
}

// ── openEditDealModal(id) ─────────────────────────────────────
async function openEditDealModal(id) {
  editingDealId = id;
  document.getElementById('deal-modal-title').textContent = 'Edit Deal';
  document.getElementById('deal-submit-btn').textContent  = 'Update';
  resetDealForm();
  await populateContactDropdown();
  openDealModal();

  const btn = document.getElementById('deal-submit-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>Loading...';

  try {
    const res  = await fetch(`${API}/deals/${id}`);
    const data = await res.json();

    document.getElementById('d-title').value      = data.title      || '';
    document.getElementById('d-value').value      = data.value      || '';
    document.getElementById('d-stage').value      = data.stage      || 'new';
    document.getElementById('d-contact').value    = data.contact_id || '';
    document.getElementById('d-close-date').value = data.close_date
      ? data.close_date.split('T')[0] : '';
    document.getElementById('d-notes').value      = data.notes      || '';
  } catch {
    toast('❌ โหลดข้อมูลไม่สำเร็จ');
    closeDealModal();
  } finally {
    btn.disabled = false;
    btn.textContent = 'Update';
  }
}

// ── saveDeal() ────────────────────────────────────────────────
async function saveDeal() {
  const title     = document.getElementById('d-title').value.trim();
  const contactId = document.getElementById('d-contact').value;
  let valid = true;

  if (!title) {
    document.getElementById('d-title').classList.add('error');
    document.getElementById('derr-title').classList.add('show');
    valid = false;
  }
  if (!contactId) {
    document.getElementById('d-contact').classList.add('error');
    document.getElementById('derr-contact').classList.add('show');
    valid = false;
  }
  if (!valid) return;

  const btn = document.getElementById('deal-submit-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>Saving...';

  const body = {
    title,
    value:      parseFloat(document.getElementById('d-value').value)      || 0,
    stage:      document.getElementById('d-stage').value,
    contact_id: contactId || null,
    close_date: document.getElementById('d-close-date').value             || null,
    notes:      document.getElementById('d-notes').value.trim()           || null,
  };

  try {
    const url    = editingDealId ? `${API}/deals/${editingDealId}` : `${API}/deals`;
    const method = editingDealId ? 'PUT' : 'POST';

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.json();
      toast('❌ ' + err.error);
      return;
    }

    toast(editingDealId ? '✅ อัปเดตดีลแล้ว' : '✅ เพิ่มดีลแล้ว');
    closeDealModal();
    loadDeals();
  } catch {
    toast('❌ เกิดข้อผิดพลาด กรุณาลองใหม่');
  } finally {
    btn.disabled = false;
    btn.textContent = editingDealId ? 'Update' : 'Save';
  }
}

// ── deleteDeal(id, title) ─────────────────────────────────────
async function deleteDeal(id, title) {
  if (!confirm(`ต้องการลบดีล "${title}" ใช่หรือไม่?`)) return;
  try {
    const res = await fetch(`${API}/deals/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error();
    toast(`🗑️ ลบดีล "${title}" แล้ว`);
    loadDeals();
  } catch {
    toast('❌ ลบไม่สำเร็จ');
  }
}

// ── populateContactDropdown() ─────────────────────────────────
// โหลด contacts มาใส่ใน <select> ของ deal modal
async function populateContactDropdown() {
  try {
    const contacts = await fetch(`${API}/contacts`).then(r => r.json());
    const sel = document.getElementById('d-contact');
    sel.innerHTML = '<option value="">— ไม่ระบุ —</option>' +
      contacts.map(c =>
        `<option value="${c.id}">${escapeHtml(c.name)}${c.company ? ` (${escapeHtml(c.company)})` : ''}</option>`
      ).join('');
  } catch {
    // ไม่เป็นไรถ้าโหลด contacts ไม่ได้
  }
}

// ── Deal Modal Helpers ────────────────────────────────────────
function openDealModal() {
  document.getElementById('deal-modal').classList.add('open');
  setTimeout(() => document.getElementById('d-title').focus(), 200);
}

function closeDealModal() {
  document.getElementById('deal-modal').classList.remove('open');
  resetDealForm();
}

function handleDealOverlayClick(event) {
  if (event.target === document.getElementById('deal-modal')) closeDealModal();
}

function resetDealForm() {
  ['d-title', 'd-value', 'd-close-date', 'd-notes'].forEach(id => {
    document.getElementById(id).value = '';
    document.getElementById(id).classList.remove('error');
  });
  document.getElementById('d-stage').value = 'new';
  // reset contact dropdown error state
  const contactSel = document.getElementById('d-contact');
  contactSel.value = '';
  contactSel.classList.remove('error');
  document.querySelectorAll('[id^="derr-"]').forEach(el => el.classList.remove('show'));
}

function clearDealError(fieldId) {
  document.getElementById(fieldId).classList.remove('error');
  const key = fieldId.replace('d-', '');
  const err = document.getElementById(`derr-${key}`);
  if (err) err.classList.remove('show');
}

// ── Modal Helpers ─────────────────────────────────────────────

function openModal() {
  document.getElementById('contact-modal').classList.add('open');
  // focus ที่ field แรกหลัง animation
  setTimeout(() => document.getElementById('f-name').focus(), 200);
}

function closeModal() {
  document.getElementById('contact-modal').classList.remove('open');
  resetForm();
}

// ปิด modal เมื่อคลิก overlay (พื้นที่นอก modal box)
function handleOverlayClick(event) {
  if (event.target === document.getElementById('contact-modal')) closeModal();
}

function resetForm() {
  ['f-name','f-company','f-email','f-phone','f-tags','f-notes'].forEach(id => {
    document.getElementById(id).value = '';
    document.getElementById(id).classList.remove('error');
  });
  document.getElementById('f-status').value = 'lead';
  // ซ่อน error messages ทั้งหมด
  document.querySelectorAll('.field-error').forEach(el => el.classList.remove('show'));
}

// ── Validation Helpers ────────────────────────────────────────

function showError(fieldId, errorId) {
  document.getElementById(fieldId).classList.add('error');
  document.getElementById(errorId).classList.add('show');
}

function clearError(fieldId) {
  document.getElementById(fieldId).classList.remove('error');
  // ซ่อน error message ของ field นี้
  const errEl = document.getElementById('err-' + fieldId.replace('f-', ''));
  if (errEl) errEl.classList.remove('show');
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ── Keyboard Shortcut ─────────────────────────────────────────
// กด Escape เพื่อปิด modal

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeModal();
    closeDealModal();
  }
});

// ── Init ──────────────────────────────────────────────────────
loadStats();
