import express from "express";
import { WebSocketServer } from "ws";
import mysql from "mysql2/promise";
import cors from "cors";
import cookieParser from "cookie-parser";
import http from "http";

const app = express();
app.use(express.json());
app.use(cookieParser());

// ⚙️ CORS: Cho phép domain otakusic.com
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "https://otakusic.com");
  res.header("Access-Control-Allow-Credentials", "true");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

// ⚙️ MySQL
const db = await mysql.createConnection({
  host: "77.37.35.67",
  user: "u134300833_otakusic",
  password: "Otakusic@2025",
  database: "u134300833_otakusic",
});

// 📨 API: Lấy tin nhắn
app.get("/messages", async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT * FROM otakusic_messages ORDER BY id DESC LIMIT 50"
    );
    res.json(rows.reverse());
  } catch (err) {
    console.error("❌ Lỗi lấy tin nhắn:", err);
    res.status(500).json({ error: "Lỗi server" });
  }
});

// 📨 API: Lưu tin nhắn
app.post("/messages", async (req, res) => {
  try {
    const { message, user } = req.body;
    if (!user?.id) return res.status(400).json({ error: "Thiếu user" });
    if (!message?.trim()) return res.status(400).json({ error: "Tin nhắn trống" });

    // 🔍 Lấy shape của frame
    let shape = "";
    if (user.frame) {
      const [frames] = await db.query(
        "SELECT shape FROM otakusic_frames WHERE picture = ? LIMIT 1",
        [user.frame]
      );
      if (frames.length > 0) shape = frames[0].shape;
    }

    await db.query(
      "INSERT INTO otakusic_messages (user_id, fullname, avatar, frame, shape, message, created_at) VALUES (?, ?, ?, ?, ?, ?, NOW())",
      [user.id, user.fullname, user.avatar, user.frame, shape, message]
    );

    res.json({ success: true });
  } catch (err) {
    console.error("❌ Lỗi lưu tin nhắn:", err);
    res.status(500).json({ error: "Lỗi server" });
  }
});

// 🚀 Tạo HTTP + WebSocket server
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

wss.on("connection", (ws) => {
  console.log("👥 WebSocket kết nối mới");

  ws.on("message", async (rawData) => {
    try {
      const msg = JSON.parse(rawData);
      const { message, user } = msg;
      if (!user?.id || !message?.trim()) return;

      // 🔍 Lấy shape của frame
      let shape = "";
      if (user.frame) {
        const [frames] = await db.query(
          "SELECT shape FROM otakusic_frames WHERE picture = ? LIMIT 1",
          [user.frame]
        );
        if (frames.length > 0) shape = frames[0].shape;
      }

      // 💾 Lưu vào DB
      await db.query(
        "INSERT INTO otakusic_messages (user_id, fullname, avatar, frame, shape, message, created_at) VALUES (?, ?, ?, ?, ?, ?, NOW())",
        [user.id, user.fullname, user.avatar, user.frame, shape, message]
      );

      // 🔁 Phát tin nhắn tới tất cả client
      const payload = {
        user_id: user.id,
        fullname: user.fullname,
        avatar: user.avatar,
        frame: user.frame,
        shape,
        message,
        created_at: new Date().toISOString(),
      };

      wss.clients.forEach((client) => {
        if (client.readyState === ws.OPEN) {
          client.send(JSON.stringify(payload));
        }
      });
    } catch (err) {
      console.error("❌ Lỗi WebSocket:", err);
    }
  });
});

server.listen(10000, () => {
  console.log("✅ Chat server đang chạy tại cổng 10000");
});
