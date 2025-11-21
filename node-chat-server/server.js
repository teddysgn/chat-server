import express from "express";
import { WebSocketServer } from "ws";
import mysql from "mysql2/promise";
import cors from "cors";
import cookieParser from "cookie-parser";
import http from "http";

const app = express();
app.use(express.json());
app.use(cookieParser());

// ⚙️ CORS cho domain otakusic.com
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "https://otakusic.com");
  res.header("Access-Control-Allow-Credentials", "true");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

// ⚙️ Config MySQL lấy từ .env
const dbConfig = {
  host: "72.61.119.15", user: "teddy_sgn", password: "OtakusicManga@2025", database: "otak_manga",
  port: process.env.DB_PORT || 3306,
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 10),
  queueLimit: 0,
  charset: "utf8mb4",
};

let pool;

// 🔄 Tự động reconnect
async function initDB() {
  try {
    pool = mysql.createPool(dbConfig);
    const conn = await pool.getConnection();
    console.log("✅ Kết nối MySQL thành công");
    conn.release();
  } catch (err) {
    console.error("❌ Kết nối MySQL thất bại, thử lại sau 5s...", err);
    setTimeout(initDB, 5000);
  }
}
await initDB();

// 📨 API: Lấy tin nhắn
app.get("/messages", async (req, res) => {
  try {
    const [rows] = await pool.query(
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

    let shape = "";
    if (user.frame) {
      const [frames] = await pool.query(
        "SELECT shape FROM otakusic_frames WHERE picture = ? LIMIT 1",
        [user.frame]
      );
      if (frames.length > 0) shape = frames[0].shape;
    }

    await pool.query(
      "INSERT INTO otakusic_messages (id, user_id, fullname, avatar, frame, shape, message, created_at) VALUES (?, ?, ?, ?, ?, ?, NOW())",
      [user.id, user.fullname, user.avatar, user.frame, shape, message]
    );

    res.json({ success: true });
  } catch (err) {
    console.error("❌ Lỗi lưu tin nhắn:", err);
    res.status(500).json({ error: "Lỗi server" });
  }
});

// 🚀 HTTP + WebSocket server
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

wss.on("connection", (ws) => {
  console.log("👥 WebSocket kết nối mới");

  ws.on("message", async (rawData) => {
    try {
      const msg = JSON.parse(rawData);
      const { message, user } = msg;
      if (!user?.id || !message?.trim()) return;

      let shape = "";
      if (user.frame) {
        const [frames] = await pool.query(
          "SELECT shape FROM otakusic_frames WHERE picture = ? LIMIT 1",
          [user.frame]
        );
        if (frames.length > 0) shape = frames[0].shape;
      }

      await pool.query(
        "INSERT INTO otakusic_messages (user_id, fullname, avatar, frame, shape, message, created_at) VALUES (?, ?, ?, ?, ?, ?, NOW())",
        [user.id, user.fullname, user.avatar, user.frame, shape, message]
      );

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

  ws.on("close", () => console.log("❌ Client đã ngắt kết nối"));
});

server.listen(10000, () => {
  console.log("✅ Chat server đang chạy tại cổng 10000");
});
