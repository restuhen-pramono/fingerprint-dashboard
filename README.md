# 🔐 FingerIoT Dashboard — ESP32 + MQTT

Dashboard real-time untuk sistem absensi/akses kontrol menggunakan ESP32 + Sensor Fingerprint + MQTT.

## 📦 Struktur Project

```
fingerprint-dashboard/
├── server.js               ← Server utama (Express + MQTT + Socket.IO)
├── package.json
├── views/
│   └── dashboard.ejs       ← Template HTML
├── public/
│   ├── css/style.css
│   └── js/app.js
└── esp32_fingerprint.ino   ← Kode Arduino untuk ESP32
```

## 🚀 Cara Menjalankan Dashboard

### 1. Install dependencies

```bash
npm install
```

### 2. Jalankan server

```bash
npm start
# atau untuk development (auto-restart):
npm run dev
```

### 3. Buka browser

```
http://localhost:3000
```

---

## ⚙️ Konfigurasi

### Ganti MQTT Broker

Di `server.js` baris 10:

```js
const MQTT_BROKER = "mqtt://broker.hivemq.com"; // ganti sesuai kebutuhanmu
```

Jika pakai broker lokal (Mosquitto):

```js
const MQTT_BROKER = "mqtt://localhost";
```

---

## 🔌 Wiring ESP32

| ESP32 Pin     | Sensor Fingerprint |
| ------------- | ------------------ |
| GPIO 16 (RX2) | TX Sensor          |
| GPIO 17 (TX2) | RX Sensor          |
| 3.3V / 5V     | VCC Sensor         |
| GND           | GND Sensor         |
| GPIO 26       | Relay IN           |
| GPIO 25       | LED Hijau          |
| GPIO 33       | LED Merah          |

---

## 📡 MQTT Topics

| Topic                  | Arah              | Deskripsi                        |
| ---------------------- | ----------------- | -------------------------------- |
| `fingerprint/status`   | ESP32 → Dashboard | Status online + info perangkat   |
| `fingerprint/access`   | ESP32 → Dashboard | Hasil scan (GRANTED/DENIED)      |
| `fingerprint/register` | Dashboard → ESP32 | Perintah enroll fingerprint baru |
| `fingerprint/delete`   | Dashboard → ESP32 | Perintah hapus fingerprint       |
| `fingerprint/notify`   | ESP32 → Dashboard | Notifikasi umum                  |
| `fingerprint/ping`     | Dashboard → ESP32 | Ping perangkat                   |

---

## 📚 Library Arduino yang dibutuhkan

Install via Arduino Library Manager:

- `Adafruit Fingerprint Sensor Library`
- `PubSubClient` (MQTT)
- `ArduinoJson`

---

## 🧪 Test Tanpa ESP32

Kamu bisa test dashboard dengan simulasi MQTT menggunakan MQTT Explorer atau script ini:

```bash
# Install mosquitto clients
sudo apt install mosquitto-clients

# Simulasi akses diterima
mosquitto_pub -h broker.hivemq.com -t fingerprint/access \
  -m '{"fingerprintId":1,"status":"GRANTED"}'

# Simulasi akses ditolak
mosquitto_pub -h broker.hivemq.com -t fingerprint/access \
  -m '{"fingerprintId":99,"status":"DENIED"}'

# Simulasi status online
mosquitto_pub -h broker.hivemq.com -t fingerprint/status \
  -m '{"online":true,"ip":"192.168.1.100","rssi":-65}'
```
