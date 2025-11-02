import express from "express";
import { WebSocketServer } from "ws";
import mysql from "mysql2";

const app = express();
const port = process.env.PORT || 10000;

// --- Kết nối MySQL ---
const db = mysql.createConnection({
  host: "77.37.35.67",      // ví dụ: "localhost"
  user: "u134300833_otakusic",      // ví dụ: "root"
  password: "Otakusic@2025",
  database: "u134300833_otakusic"   // ví dụ: "otakusic"
});

db.connect(err => {
  if (err) {
    console.error("❌ Lỗi kết nối MySQL:", err);
  } else {
    console.log("✅ Kết nối MySQL thành công!");
  }
});

// --- WebSocket ---
const server = app.listen(port, () => {
  console.log(`🚀 Server chạy cổng ${port}`);
});

const wss = new WebSocketServer({ server });

wss.on("connection", (ws) => {
  console.log("👤 Người dùng kết nối mới");

  ws.on("message", (data) => {
    try {
      const msg = JSON.parse(data);
      const { user_id, fullname, avatar, message } = msg;

      // Lưu vào DB
      db.query(
        "INSERT INTO messages (user_id, fullname, avatar, message) VALUES (?, ?, ?, ?)",
        [user_id, fullname, avatar, message],
        (err) => {
          if (err) console.error("❌ Lỗi lưu tin nhắn:", err);
        }
      );

      // Gửi lại cho tất cả client
      wss.clients.forEach(client => {
        if (client.readyState === 1) {
          client.send(JSON.stringify({
            user_id, fullname, avatar, message, created_at: new Date()
          }));
        }
      });
    } catch (e) {
      console.error("❌ Lỗi xử lý message:", e);
    }
  });

  ws.on("close", () => console.log("👋 Người dùng ngắt kết nối"));
});

// --- API lấy lịch sử tin nhắn ---
app.get("/messages", (req, res) => {
  db.query("SELECT * FROM messages ORDER BY created_at ASC LIMIT 100", (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});
