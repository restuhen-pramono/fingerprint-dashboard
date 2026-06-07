require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mqtt = require('mqtt');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const MQTT_BROKER = process.env.MQTT_BROKER || 'mqtt://broker.hivemq.com';
const MQTT_TOPICS = {
  STATUS:        'fingerprint/status',
  ACCESS:        'fingerprint/access',
  REGISTER:      'fingerprint/register',
  DELETE:        'fingerprint/delete',
  NOTIFY:        'fingerprint/notify',
  ENROLL_STATUS: 'fingerprint/enroll_status',
};

let deviceStatus  = { online: false, lastSeen: null, ip: '-' };
let accessLog     = [];
let users         = [];
let notifications = [];

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

app.get('/', (req, res) => res.render('dashboard', { users, accessLog, deviceStatus }));
app.get('/api/status',        (req, res) => res.json(deviceStatus));
app.get('/api/logs',          (req, res) => res.json(accessLog.slice(0, 100)));
app.get('/api/users',         (req, res) => res.json(users));
app.get('/api/notifications', (req, res) => res.json(notifications.slice(0, 20)));

app.post('/api/users/enroll', (req, res) => {
  const { name, fingerprintId, role } = req.body;
  if (!name || !fingerprintId) return res.status(400).json({ error: 'Name dan fingerprintId wajib diisi' });
  if (users.find(u => u.fingerprintId === parseInt(fingerprintId)))
    return res.status(400).json({ error: 'ID Fingerprint sudah digunakan' });
  mqttClient.publish(MQTT_TOPICS.REGISTER, JSON.stringify({ fingerprintId: parseInt(fingerprintId), name, role: role || 'Staff' }));
  res.json({ success: true });
});

app.delete('/api/users/:id', (req, res) => {
  const user = users.find(u => u.id == req.params.id);
  if (!user) return res.status(404).json({ error: 'User tidak ditemukan' });
  users = users.filter(u => u.id != req.params.id);
  mqttClient.publish(MQTT_TOPICS.DELETE, JSON.stringify({ fingerprintId: user.fingerprintId }));
  io.emit('users_updated', users);
  res.json({ success: true });
});

const mqttClient = mqtt.connect(MQTT_BROKER, {
  clientId: `dashboard_${Math.random().toString(16).slice(3)}`,
  clean: true,
  reconnectPeriod: 3000,
});

mqttClient.on('connect', () => {
  console.log('✅ Connected to MQTT Broker');
  Object.values(MQTT_TOPICS).forEach(t => mqttClient.subscribe(t));
  io.emit('mqtt_status', { connected: true });
});

mqttClient.on('error', (err) => {
  console.error('❌ MQTT Error:', err.message);
  io.emit('mqtt_status', { connected: false });
});

mqttClient.on('message', (topic, message) => {
  let payload;
  try { payload = JSON.parse(message.toString()); }
  catch { payload = { raw: message.toString() }; }
  const now = new Date().toISOString();

  switch (topic) {
    case MQTT_TOPICS.STATUS:
      deviceStatus = { online: payload.online === true, lastSeen: now, ip: payload.ip || '-', rssi: payload.rssi || '-' };
      io.emit('device_status', deviceStatus);
      break;

    case MQTT_TOPICS.ACCESS: {
      const user = users.find(u => u.fingerprintId === payload.fingerprintId);
      const logEntry = { id: Date.now(), fingerprintId: payload.fingerprintId, name: user ? user.name : 'Unknown', status: payload.status || (user ? 'GRANTED' : 'DENIED'), confidence: payload.confidence || 0, timestamp: now };
      accessLog.unshift(logEntry);
      if (accessLog.length > 500) accessLog.pop();
      io.emit('new_access', logEntry);
      const notif = { id: Date.now(), type: logEntry.status === 'GRANTED' ? 'success' : 'danger', message: logEntry.status === 'GRANTED' ? `✅ Absensi: ${logEntry.name}` : `🚫 Ditolak - ID #${logEntry.fingerprintId}`, timestamp: now };
      notifications.unshift(notif);
      io.emit('new_notification', notif);
      break;
    }

    case MQTT_TOPICS.ENROLL_STATUS: {
      io.emit('enroll_status', payload);
      if (payload.stage === 'success') {
        const newUser = { id: Date.now(), fingerprintId: payload.fingerprintId, name: payload.name, role: payload.role || 'Staff', confidence: payload.confidence || 0, addedAt: now };
        users.push(newUser);
        io.emit('users_updated', users);
        notifications.unshift({ id: Date.now(), type: 'success', message: `✅ Pengguna baru: ${payload.name} (ID #${payload.fingerprintId})`, timestamp: now });
      }
      break;
    }

    case MQTT_TOPICS.NOTIFY: {
      const notif = { id: Date.now(), type: payload.type || 'info', message: payload.message, timestamp: now };
      notifications.unshift(notif);
      io.emit('new_notification', notif);
      break;
    }
  }
});

io.on('connection', (socket) => {
  console.log('🌐 Client connected:', socket.id);
  socket.emit('init', { deviceStatus, accessLog: accessLog.slice(0, 50), users, notifications: notifications.slice(0, 10) });
  socket.on('ping_device', () => mqttClient.publish('fingerprint/ping', JSON.stringify({ ts: Date.now() })));
  socket.on('disconnect', () => console.log('🔌 Client disconnected:', socket.id));
});

server.listen(PORT, () => console.log(`🚀 Dashboard running at http://localhost:${PORT}`));