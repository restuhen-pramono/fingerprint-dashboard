const socket = io();

let allLogs = [];
let allUsers = [];
let allNotifs = [];
let currentFilter = 'all';
let unreadNotifs = 0;

// Enroll state
let enrollData = null;
let enrollTimer = null;
let enrollSeconds = 0;

// ─── Init ─────────────────────────────────────────────────
socket.on('init', ({ deviceStatus, accessLog, users, notifications }) => {
  allLogs = accessLog || [];
  allUsers = users || [];
  allNotifs = notifications || [];
  updateDeviceStatus(deviceStatus);
  renderStats();
  renderMiniLog();
  renderLogTable();
  renderUsers();
  renderNotifications();
});

// ─── Socket Events ────────────────────────────────────────
socket.on('device_status', updateDeviceStatus);
socket.on('users_updated', (users) => { allUsers = users; renderStats(); renderUsers(); });
socket.on('new_notification', (notif) => { allNotifs.unshift(notif); unreadNotifs++; updateNotifBadge(); renderNotifications(); });
socket.on('new_access', (entry) => {
  allLogs.unshift(entry);
  if (allLogs.length > 500) allLogs.pop();
  renderStats(); renderMiniLog(); renderLogTable(); animateLiveStatus(entry);
  showToast(entry.status === 'GRANTED' ? `✅ ${entry.name} — Absensi Tercatat` : `🚫 ID #${entry.fingerprintId} — Tidak Dikenal`, entry.status === 'GRANTED' ? 'success' : 'danger');
});

const dot = document.getElementById('mqttDot');
const lbl = document.getElementById('mqttLabel');

// Saat halaman pertama kali dibuka
dot.className = 'dot connecting';
lbl.textContent = 'Menghubungkan...';

// Socket berhasil connect ke server
socket.on('connect', () => {
  dot.className = 'dot online';
  lbl.textContent = 'Sistem Terhubung';
});

// Socket terputus dari server
socket.on('disconnect', () => {
  dot.className = 'dot offline';
  lbl.textContent = 'Sistem Terputus';
});

// Status MQTT dari backend
socket.on('mqtt_status', ({ connected }) => {
  if (connected) {
    dot.className = 'dot online';
    lbl.textContent = '🟢 Terhubung';
  } else {
    dot.className = 'dot offline';
    lbl.textContent = '🔴 Terputus';
  }
});

// ─── Enroll Status dari ESP32 ─────────────────────────────
socket.on('enroll_status', (payload) => {
  const { stage, confidence, reason } = payload;

  switch (stage) {
    case 'waiting':
      setEnrollStage('waiting');
      break;

    case 'first_ok':
      setEnrollStage('first_ok');
      break;

    case 'second':
      setEnrollStage('second');
      break;

    case 'success':
      clearEnrollTimer();
      setEnrollStage('success', confidence);
      setTimeout(() => closeEnrollPopup(), 2500);
      break;

    case 'failed':
      clearEnrollTimer();
      setEnrollStage('failed', 0, reason);
      break;
  }
});

// ─── Enroll Popup Logic ───────────────────────────────────
function openEnrollPopup(data) {
  enrollData = data;
  const popup = document.getElementById('enrollPopup');
  popup.style.display = 'flex';
  document.getElementById('enrollName').textContent = data.name;
  document.getElementById('enrollFpId').textContent = `ID #${data.fingerprintId}`;
  setEnrollStage('waiting');
  startEnrollTimer();
}

function closeEnrollPopup() {
  clearEnrollTimer();
  document.getElementById('enrollPopup').style.display = 'none';
  enrollData = null;
  document.getElementById('addUserForm').style.display = 'none';
  clearForm();
}

function retryEnroll() {
  if (!enrollData) return;
  fetch('/api/users/enroll', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(enrollData),
  });
  setEnrollStage('waiting');
  startEnrollTimer();
}

function startEnrollTimer() {
  clearEnrollTimer();
  enrollSeconds = 10;
  updateTimerDisplay();
  enrollTimer = setInterval(() => {
    enrollSeconds--;
    updateTimerDisplay();
    if (enrollSeconds <= 0) {
      clearEnrollTimer();
      setEnrollStage('failed', 0, 'timeout');
    }
  }, 1000);
}

function clearEnrollTimer() {
  if (enrollTimer) { clearInterval(enrollTimer); enrollTimer = null; }
}

function updateTimerDisplay() {
  const el = document.getElementById('enrollTimer');
  if (el) el.textContent = enrollSeconds;
  const bar = document.getElementById('enrollProgressBar');
  if (bar) bar.style.width = ((enrollSeconds / 10) * 100) + '%';
}

function setEnrollStage(stage, confidence = 0, reason = '') {
  const icon = document.getElementById('enrollIcon');
  const title = document.getElementById('enrollTitle');
  const sub = document.getElementById('enrollSub');
  const conf = document.getElementById('enrollConfidence');
  const actions = document.getElementById('enrollActions');
  const timerEl = document.getElementById('enrollTimerWrap');
  const progress = document.getElementById('enrollProgressWrap');

  // Reset
  actions.innerHTML = '';
  conf.style.display = 'none';

  switch (stage) {
    case 'waiting':
      icon.textContent = '👆';
      icon.className = 'enroll-icon pulse';
      title.textContent = 'Tempelkan Jari';
      sub.textContent = 'Letakkan jari ke sensor fingerprint';
      timerEl.style.display = 'flex';
      progress.style.display = 'block';
      actions.innerHTML = `<button class="btn-ghost" onclick="closeEnrollPopup()">Batalkan</button>`;
      break;

    case 'first_ok':
      icon.textContent = '✋';
      icon.className = 'enroll-icon';
      title.textContent = 'Berhasil! Angkat Jari';
      sub.textContent = 'Lalu tempelkan jari yang sama sekali lagi';
      timerEl.style.display = 'flex';
      progress.style.display = 'block';
      actions.innerHTML = `<button class="btn-ghost" onclick="closeEnrollPopup()">Batalkan</button>`;
      break;

    case 'second':
      icon.textContent = '👆';
      icon.className = 'enroll-icon pulse';
      title.textContent = 'Tempelkan Lagi';
      sub.textContent = 'Tempelkan jari yang sama untuk konfirmasi';
      timerEl.style.display = 'flex';
      progress.style.display = 'block';
      actions.innerHTML = `<button class="btn-ghost" onclick="closeEnrollPopup()">Batalkan</button>`;
      break;

    case 'success':
      icon.textContent = '✅';
      icon.className = 'enroll-icon success';
      title.textContent = 'Pendaftaran Berhasil!';
      sub.textContent = `${enrollData?.name || 'Pengguna'} berhasil didaftarkan`;
      timerEl.style.display = 'none';
      progress.style.display = 'none';
      conf.style.display = 'flex';
      document.getElementById('enrollConfVal').textContent = confidence + '%';
      document.getElementById('enrollConfBar').style.width = confidence + '%';
      break;

    case 'failed':
      icon.textContent = '❌';
      icon.className = 'enroll-icon danger';
      title.textContent = reason === 'timeout' ? 'Waktu Habis' : 'Pendaftaran Gagal';
      sub.textContent = reason === 'timeout' ? 'Tidak ada jari terdeteksi dalam 10 detik' : 'Sidik jari tidak cocok, coba lagi';
      timerEl.style.display = 'none';
      progress.style.display = 'none';
      actions.innerHTML = `
        <button class="btn-primary" onclick="retryEnroll()">🔄 Scan Ulang</button>
        <button class="btn-ghost"  onclick="closeEnrollPopup()">Batalkan</button>
      `;
      break;
  }
}

// ─── Device Status ────────────────────────────────────────
function updateDeviceStatus(status) {
  const dot = document.getElementById('deviceDot');
  const label = document.getElementById('deviceLabel');
  dot.className = 'device-dot ' + (status?.online ? 'online' : 'offline');
  label.textContent = status?.online ? 'ESP32 Online' : 'ESP32 Offline';
  document.getElementById('statDevice').textContent = status?.online ? 'Online' : 'Offline';
  document.getElementById('statLastSeen').textContent = status?.lastSeen ? 'Terakhir dilihat: ' + formatTime(status.lastSeen) : '-';
  document.getElementById('infoIP').textContent = status?.ip || '-';
  document.getElementById('infoRSSI').textContent = status?.rssi ? status.rssi + ' dBm' : '-';
  document.getElementById('infoLastSeen').textContent = status?.lastSeen ? formatTime(status.lastSeen) : '-';
}

// ─── Stats ────────────────────────────────────────────────
function renderStats() {
  document.getElementById('statUsers').textContent = allUsers.length;
  const today = new Date().toDateString();
  const todayLogs = allLogs.filter(l => new Date(l.timestamp).toDateString() === today);
  document.getElementById('statToday').textContent = todayLogs.length;
  document.getElementById('statDenied').textContent = todayLogs.filter(l => l.status === 'DENIED').length;
}

// ─── Mini Log ─────────────────────────────────────────────
function renderMiniLog() {
  const el = document.getElementById('miniLog');
  if (!allLogs.length) { el.innerHTML = '<div class="empty-state">Belum ada absensi tercatat</div>'; return; }
  el.innerHTML = allLogs.slice(0, 6).map(l => `
    <div class="mini-log-item">
      <span class="log-status ${l.status === 'GRANTED' ? 'granted' : 'denied'}"></span>
      <span class="log-name">${l.name}</span>
      <span class="log-time">${formatTime(l.timestamp)}</span>
    </div>`).join('');
}

// ─── Log Table ────────────────────────────────────────────
function renderLogTable() {
  const tbody = document.getElementById('logTableBody');
  let filtered = currentFilter === 'all' ? allLogs : allLogs.filter(l => l.status === currentFilter);
  if (!filtered.length) { tbody.innerHTML = '<tr><td colspan="6" class="empty-state">Belum ada data log</td></tr>'; return; }
  tbody.innerHTML = filtered.slice(0, 100).map((l, i) => `
    <tr>
      <td><span style="font-family:Space Mono,monospace;font-size:11px;color:var(--text-muted)">${i + 1}</span></td>
      <td><span style="font-family:Space Mono,monospace;font-size:11px">${formatTime(l.timestamp)}</span></td>
      <td><strong>${l.name}</strong></td>
      <td><span style="font-family:Space Mono,monospace;color:var(--accent)">ID #${l.fingerprintId}</span></td>
      <td><span style="font-family:Space Mono,monospace;font-size:11px;color:var(--text-muted)">${l.confidence || '-'}%</span></td>
      <td><span class="badge ${l.status === 'GRANTED' ? 'granted' : 'denied'}">● ${l.status}</span></td>
    </tr>`).join('');
}

// ─── Users ────────────────────────────────────────────────
function renderUsers() {
  const grid = document.getElementById('userGrid');
  if (!allUsers.length) {
    grid.innerHTML = `
      <div class="empty-users">
        <div class="empty-icon">◉</div>
        <div class="empty-title">Belum ada pengguna</div>
        <div class="empty-sub">Klik "+ Tambah Pengguna" untuk mendaftarkan sidik jari pertama</div>
      </div>`;
    return;
  }
  grid.innerHTML = allUsers.map(u => `
    <div class="user-card">
      <button class="btn-del" onclick="deleteUser(${u.id})">✕</button>
      <div class="user-avatar">${u.name.charAt(0).toUpperCase()}</div>
      <div class="user-name">${u.name}</div>
      <div class="user-role ${u.role === 'Admin' ? 'admin' : ''}">${u.role}</div>
      <div class="user-meta">
        <span>Fingerprint ID: #${u.fingerprintId}</span>
        <span>Akurasi: ${u.confidence || '-'}%</span>
        <span>Didaftarkan: ${formatDate(u.addedAt)}</span>
      </div>
    </div>`).join('');
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
    </div>`).join('');
}

// ─── Live Animation ───────────────────────────────────────
let liveTimer;
function animateLiveStatus(entry) {
  const anim = document.getElementById('fingerprintAnim');
  const label = document.getElementById('liveLabel');
  const sub = document.getElementById('liveSub');
  clearTimeout(liveTimer);
  anim.className = 'fingerprint-anim ' + (entry.status === 'GRANTED' ? 'granted' : 'denied');
  label.textContent = entry.status === 'GRANTED' ? `Absensi: ${entry.name}` : 'Tidak Dikenal';
  sub.textContent = `ID #${entry.fingerprintId} — Akurasi: ${entry.confidence || '-'}%`;
  liveTimer = setTimeout(() => {
    anim.className = 'fingerprint-anim';
    label.textContent = 'Menunggu input...';
    sub.textContent = 'Sistem siap';
  }, 4000);
}

// ─── Navigation ───────────────────────────────────────────
function navigateTo(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-' + page)?.classList.add('active');
  document.querySelector(`[data-page="${page}"]`)?.classList.add('active');
  const titles = { overview: 'Overview', logs: 'Log Absensi', users: 'Manajemen Pengguna', notifications: 'Notifikasi' };
  document.getElementById('pageTitle').textContent = titles[page] || page;
  if (page === 'notifications') { unreadNotifs = 0; updateNotifBadge(); }
}

document.querySelectorAll('[data-page]').forEach(el => {
  el.addEventListener('click', (e) => { e.preventDefault(); navigateTo(el.dataset.page); });
});

// ─── Filter ───────────────────────────────────────────────
document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.dataset.filter;
    renderLogTable();
  });
});

// ─── Add User ─────────────────────────────────────────────
document.getElementById('btnAddUser').addEventListener('click', () => {
  document.getElementById('addUserForm').style.display = 'block';
  document.getElementById('inputName').focus();
});

document.getElementById('btnCancelUser').addEventListener('click', () => {
  document.getElementById('addUserForm').style.display = 'none';
  clearForm();
});

document.getElementById('btnSaveUser').addEventListener('click', async () => {
  const name = document.getElementById('inputName').value.trim();
  const fpId = document.getElementById('inputFpId').value.trim();
  const role = document.getElementById('inputRole').value;

  if (!name) { showToast('Nama wajib diisi', 'danger'); return; }
  if (!fpId) { showToast('ID Fingerprint wajib diisi', 'danger'); return; }
  if (allUsers.find(u => u.fingerprintId === parseInt(fpId))) {
    showToast('ID Fingerprint sudah digunakan', 'danger'); return;
  }

  const data = { name, fingerprintId: parseInt(fpId), role };

  try {
    const res = await fetch('/api/users/enroll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      openEnrollPopup(data);
    } else {
      const err = await res.json();
      showToast(err.error || 'Gagal mengirim perintah enroll', 'danger');
    }
  } catch { showToast('Error koneksi ke server', 'danger'); }
});

// ─── Delete User ──────────────────────────────────────────
async function deleteUser(id) {
  if (!confirm('Hapus pengguna ini? Sidik jari juga akan dihapus dari sensor.')) return;
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

// ─── Clear Notif ──────────────────────────────────────────
document.getElementById('btnClearNotif').addEventListener('click', () => {
  allNotifs = []; unreadNotifs = 0; updateNotifBadge(); renderNotifications();
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
  return new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
function formatDate(iso) {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}