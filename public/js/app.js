// ─── Socket.IO ────────────────────────────────────────────
const socket = io();

// ─── State ────────────────────────────────────────────────
let allLogs = [];
let allUsers = [];
let allNotifs = [];
let currentFilter = 'all';
let unreadNotifs = 0;

// ─── Init ─────────────────────────────────────────────────
socket.on('init', ({ deviceStatus, accessLog, users, notifications }) => {
  allLogs  = accessLog    || [];
  allUsers = users        || [];
  allNotifs = notifications || [];
  updateDeviceStatus(deviceStatus);
  renderStats();
  renderMiniLog();
  renderLogTable();
  renderUsers();
  renderNotifications();
});

// ─── Socket Events ────────────────────────────────────────
socket.on('device_status', (status) => {
  updateDeviceStatus(status);
});

socket.on('new_access', (entry) => {
  allLogs.unshift(entry);
  if (allLogs.length > 500) allLogs.pop();
  renderStats();
  renderMiniLog();
  renderLogTable();
  animateLiveStatus(entry);
  showToast(
    entry.status === 'GRANTED' ? `✅ ${entry.name} — Akses Diberikan` : `🚫 ID #${entry.fingerprintId} — Akses Ditolak`,
    entry.status === 'GRANTED' ? 'success' : 'danger'
  );
});

socket.on('new_notification', (notif) => {
  allNotifs.unshift(notif);
  if (allNotifs.length > 100) allNotifs.pop();
  unreadNotifs++;
  updateNotifBadge();
  renderNotifications();
});

socket.on('users_updated', (users) => {
  allUsers = users;
  renderStats();
  renderUsers();
});

socket.on('mqtt_status', ({ connected }) => {
  const dot   = document.getElementById('mqttDot');
  const label = document.getElementById('mqttLabel');
  dot.className   = 'dot ' + (connected ? 'online' : 'offline');
  label.textContent = connected ? 'MQTT Terhubung' : 'MQTT Terputus';
});

// ─── Device Status ────────────────────────────────────────
function updateDeviceStatus(status) {
  const dot   = document.getElementById('deviceDot');
  const label = document.getElementById('deviceLabel');
  const pill  = document.getElementById('devicePill');

  if (status?.online) {
    dot.className = 'device-dot online';
    label.textContent = 'ESP32 Online';
  } else {
    dot.className = 'device-dot offline';
    label.textContent = 'ESP32 Offline';
  }

  document.getElementById('statDevice').textContent = status?.online ? 'Online' : 'Offline';
  document.getElementById('statLastSeen').textContent = status?.lastSeen
    ? 'Terakhir: ' + formatTime(status.lastSeen) : '-';
  document.getElementById('infoIP').textContent    = status?.ip   || '-';
  document.getElementById('infoRSSI').textContent  = status?.rssi ? status.rssi + ' dBm' : '-';
  document.getElementById('infoLastSeen').textContent = status?.lastSeen ? formatTime(status.lastSeen) : '-';
}

// ─── Stats ────────────────────────────────────────────────
function renderStats() {
  document.getElementById('statUsers').textContent = allUsers.length;

  const today = new Date().toDateString();
  const todayLogs = allLogs.filter(l => new Date(l.timestamp).toDateString() === today);
  document.getElementById('statToday').textContent  = todayLogs.length;
  document.getElementById('statDenied').textContent = todayLogs.filter(l => l.status === 'DENIED').length;
}

// ─── Mini Log ─────────────────────────────────────────────
function renderMiniLog() {
  const el = document.getElementById('miniLog');
  if (!allLogs.length) { el.innerHTML = '<div class="empty-state">Belum ada akses tercatat</div>'; return; }
  el.innerHTML = allLogs.slice(0, 6).map(l => `
    <div class="mini-log-item">
      <span class="log-status ${l.status === 'GRANTED' ? 'granted' : 'denied'}"></span>
      <span class="log-name">${l.name}</span>
      <span class="log-time">${formatTime(l.timestamp)}</span>
    </div>
  `).join('');
}

// ─── Log Table ────────────────────────────────────────────
function renderLogTable() {
  const tbody = document.getElementById('logTableBody');
  let filtered = currentFilter === 'all' ? allLogs : allLogs.filter(l => l.status === currentFilter);
  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-state">Belum ada data log</td></tr>';
    return;
  }
  tbody.innerHTML = filtered.slice(0, 100).map((l, i) => `
    <tr>
      <td><span style="font-family:Space Mono,monospace;font-size:11px;color:var(--text-muted)">${i + 1}</span></td>
      <td><span style="font-family:Space Mono,monospace;font-size:11px">${formatTime(l.timestamp)}</span></td>
      <td><strong>${l.name}</strong></td>
      <td><span style="font-family:Space Mono,monospace;color:var(--accent)">ID #${l.fingerprintId}</span></td>
      <td><span class="badge ${l.status === 'GRANTED' ? 'granted' : 'denied'}">● ${l.status}</span></td>
    </tr>
  `).join('');
}

// ─── Users ────────────────────────────────────────────────
function renderUsers() {
  const grid = document.getElementById('userGrid');
  if (!allUsers.length) { grid.innerHTML = '<div class="empty-state">Belum ada pengguna terdaftar</div>'; return; }
  grid.innerHTML = allUsers.map(u => `
    <div class="user-card">
      <button class="btn-del" onclick="deleteUser(${u.id})">✕</button>
      <div class="user-avatar">${u.name.charAt(0).toUpperCase()}</div>
      <div class="user-name">${u.name}</div>
      <div class="user-role ${u.role === 'Admin' ? 'admin' : ''}">${u.role}</div>
      <div class="user-meta">
        <span>Fingerprint ID: #${u.fingerprintId}</span>
        <span>Ditambahkan: ${formatDate(u.addedAt)}</span>
      </div>
    </div>
  `).join('');
}

// ─── Notifications ────────────────────────────────────────
function renderNotifications() {
  const list = document.getElementById('notifList');
  if (!allNotifs.length) { list.innerHTML = '<div class="empty-state">Belum ada notifikasi</div>'; return; }
  list.innerHTML = allNotifs.slice(0, 30).map(n => `
    <div class="notif-item">
      <span class="notif-dot ${n.type}"></span>
      <span class="notif-msg">${n.message}</span>
      <span class="notif-time">${formatTime(n.timestamp)}</span>
    </div>
  `).join('');
}

// ─── Live Animation ───────────────────────────────────────
let liveTimer;
function animateLiveStatus(entry) {
  const anim  = document.getElementById('fingerprintAnim');
  const label = document.getElementById('liveLabel');
  const sub   = document.getElementById('liveSub');

  clearTimeout(liveTimer);
  anim.className = 'fingerprint-anim ' + (entry.status === 'GRANTED' ? 'granted' : 'denied');
  label.textContent = entry.status === 'GRANTED' ? `Selamat datang, ${entry.name}!` : `Akses Ditolak`;
  sub.textContent   = `ID Fingerprint: #${entry.fingerprintId}`;

  liveTimer = setTimeout(() => {
    anim.className = 'fingerprint-anim';
    label.textContent = 'Menunggu input...';
    sub.textContent   = 'Sistem siap';
  }, 4000);
}

// ─── Navigation ───────────────────────────────────────────
function navigateTo(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  document.getElementById('page-' + page)?.classList.add('active');
  document.querySelector(`[data-page="${page}"]`)?.classList.add('active');

  const titles = { overview: 'Overview', logs: 'Log Akses', users: 'Manajemen Pengguna', notifications: 'Notifikasi' };
  document.getElementById('pageTitle').textContent = titles[page] || page;

  if (page === 'notifications') {
    unreadNotifs = 0;
    updateNotifBadge();
  }
}

document.querySelectorAll('[data-page]').forEach(el => {
  el.addEventListener('click', (e) => { e.preventDefault(); navigateTo(el.dataset.page); });
});

// ─── Filter Buttons ───────────────────────────────────────
document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.dataset.filter;
    renderLogTable();
  });
});

// ─── Add / Delete User ────────────────────────────────────
document.getElementById('btnAddUser').addEventListener('click', () => {
  document.getElementById('addUserForm').style.display = 'block';
});

document.getElementById('btnCancelUser').addEventListener('click', () => {
  document.getElementById('addUserForm').style.display = 'none';
  clearForm();
});

document.getElementById('btnSaveUser').addEventListener('click', async () => {
  const name = document.getElementById('inputName').value.trim();
  const fpId = document.getElementById('inputFpId').value.trim();
  const role = document.getElementById('inputRole').value;

  if (!name || !fpId) { showToast('Nama dan ID Fingerprint wajib diisi', 'danger'); return; }
  if (allUsers.find(u => u.fingerprintId === parseInt(fpId))) {
    showToast('ID Fingerprint sudah digunakan', 'danger'); return;
  }

  try {
    const res = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, fingerprintId: fpId, role }),
    });
    if (res.ok) {
      showToast('Pengguna berhasil ditambahkan', 'success');
      document.getElementById('addUserForm').style.display = 'none';
      clearForm();
    } else {
      showToast('Gagal menambahkan pengguna', 'danger');
    }
  } catch { showToast('Error koneksi ke server', 'danger'); }
});

async function deleteUser(id) {
  if (!confirm('Hapus pengguna ini?')) return;
  try {
    const res = await fetch(`/api/users/${id}`, { method: 'DELETE' });
    if (res.ok) showToast('Pengguna dihapus', 'info');
    else showToast('Gagal menghapus pengguna', 'danger');
  } catch { showToast('Error koneksi ke server', 'danger'); }
}

function clearForm() {
  document.getElementById('inputName').value = '';
  document.getElementById('inputFpId').value = '';
  document.getElementById('inputRole').value = 'Staff';
}

// ─── Clear Notifications ──────────────────────────────────
document.getElementById('btnClearNotif').addEventListener('click', () => {
  allNotifs = [];
  unreadNotifs = 0;
  updateNotifBadge();
  renderNotifications();
});

// ─── Ping ─────────────────────────────────────────────────
document.getElementById('btnPing').addEventListener('click', () => {
  socket.emit('ping_device');
  showToast('Ping dikirim ke ESP32', 'info');
});

// ─── Notif Badge ──────────────────────────────────────────
function updateNotifBadge() {
  const badge = document.getElementById('notifBadge');
  badge.textContent = unreadNotifs;
  badge.style.display = unreadNotifs > 0 ? 'inline-block' : 'none';
}

// ─── Toast ────────────────────────────────────────────────
function showToast(msg, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; toast.style.transition = 'opacity 0.4s'; setTimeout(() => toast.remove(), 400); }, 3000);
}

// ─── Helpers ──────────────────────────────────────────────
function formatTime(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatDate(iso) {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}