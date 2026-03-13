// app.js - Frontend Logic (Vanilla JS)
// ติดต่อกับ REST API และอัปเดต UI

const API = '/api'; // Base URL ของ API

// ── Utility Functions ────────────────────────────────────────

// แสดง toast notification
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2500);
}

// แปลงตัวเลขเป็นรูปแบบเงิน เช่น 1500000 → "1,500,000"
function formatMoney(n) {
  return Number(n || 0).toLocaleString('th-TH');
}

// สร้าง badge สี ตาม stage
function stageBadge(stage) {
  return `<span class="badge badge-${stage}">${stage}</span>`;
}

// ── Tab Switching ────────────────────────────────────────────

function switchTab(tab) {
  // ซ่อนทุก section
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));

  // แสดง section ที่เลือก
  document.getElementById(tab).classList.add('active');
  event.target.classList.add('active');

  // โหลดข้อมูลตาม tab
  if (tab === 'contacts')  loadContacts();
  if (tab === 'deals')     loadDeals();
  if (tab === 'dashboard') loadDashboard();
}

// ── Dashboard ────────────────────────────────────────────────

async function loadDashboard() {
  const [contacts, deals] = await Promise.all([
    fetch(`${API}/contacts`).then(r => r.json()),
    fetch(`${API}/deals`).then(r => r.json()),
  ]);

  const wonDeals    = deals.filter(d => d.stage === 'won');
  const totalValue  = wonDeals.reduce((sum, d) => sum + Number(d.value), 0);

  document.getElementById('stat-contacts').textContent = contacts.length;
  document.getElementById('stat-deals').textContent    = deals.length;
  document.getElementById('stat-won').textContent      = wonDeals.length;
  document.getElementById('stat-value').textContent    = '฿' + formatMoney(totalValue);
}

// ── Contacts ─────────────────────────────────────────────────

async function loadContacts() {
  const res  = await fetch(`${API}/contacts`);
  const data = await res.json();
  const tbody = document.getElementById('contacts-body');

  if (data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#aaa">No contacts yet</td></tr>';
    return;
  }

  tbody.innerHTML = data.map(c => `
    <tr>
      <td>${c.id}</td>
      <td><strong>${c.name}</strong></td>
      <td>${c.email || '-'}</td>
      <td>${c.phone || '-'}</td>
      <td>${c.company || '-'}</td>
      <td>
        <button class="btn btn-danger" onclick="deleteContact(${c.id})">Delete</button>
      </td>
    </tr>
  `).join('');
}

async function saveContact() {
  // รวบรวมข้อมูลจาก form
  const body = {
    name:    document.getElementById('c-name').value.trim(),
    email:   document.getElementById('c-email').value.trim(),
    phone:   document.getElementById('c-phone').value.trim(),
    company: document.getElementById('c-company').value.trim(),
  };

  if (!body.name) { toast('❌ Name is required'); return; }

  const res = await fetch(`${API}/contacts`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });

  if (res.ok) {
    toast('✅ Contact added!');
    // เคลียร์ form
    ['c-name','c-email','c-phone','c-company'].forEach(id => {
      document.getElementById(id).value = '';
    });
    loadContacts();
  } else {
    const err = await res.json();
    toast('❌ ' + err.error);
  }
}

async function deleteContact(id) {
  if (!confirm('Delete this contact?')) return;
  await fetch(`${API}/contacts/${id}`, { method: 'DELETE' });
  toast('🗑️ Contact deleted');
  loadContacts();
}

// ── Deals ────────────────────────────────────────────────────

async function loadDeals() {
  // โหลด deals และ contacts พร้อมกัน
  const [deals, contacts] = await Promise.all([
    fetch(`${API}/deals`).then(r => r.json()),
    fetch(`${API}/contacts`).then(r => r.json()),
  ]);

  // อัปเดต dropdown contact ใน form
  const sel = document.getElementById('d-contact');
  sel.innerHTML = '<option value="">— No Contact —</option>' +
    contacts.map(c => `<option value="${c.id}">${c.name}</option>`).join('');

  const tbody = document.getElementById('deals-body');

  if (deals.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#aaa">No deals yet</td></tr>';
    return;
  }

  tbody.innerHTML = deals.map(d => `
    <tr>
      <td>${d.id}</td>
      <td><strong>${d.title}</strong></td>
      <td>฿${formatMoney(d.value)}</td>
      <td>${stageBadge(d.stage)}</td>
      <td>${d.contact_name || '-'}</td>
      <td>
        <button class="btn btn-danger" onclick="deleteDeal(${d.id})">Delete</button>
      </td>
    </tr>
  `).join('');
}

async function saveDeal() {
  const body = {
    title:      document.getElementById('d-title').value.trim(),
    value:      document.getElementById('d-value').value || 0,
    stage:      document.getElementById('d-stage').value,
    contact_id: document.getElementById('d-contact').value || null,
  };

  if (!body.title) { toast('❌ Title is required'); return; }

  const res = await fetch(`${API}/deals`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });

  if (res.ok) {
    toast('✅ Deal added!');
    document.getElementById('d-title').value = '';
    document.getElementById('d-value').value = '';
    loadDeals();
  } else {
    const err = await res.json();
    toast('❌ ' + err.error);
  }
}

async function deleteDeal(id) {
  if (!confirm('Delete this deal?')) return;
  await fetch(`${API}/deals/${id}`, { method: 'DELETE' });
  toast('🗑️ Deal deleted');
  loadDeals();
}

// ── Init ─────────────────────────────────────────────────────
// โหลด dashboard เมื่อหน้าเว็บเปิดครั้งแรก
loadDashboard();
