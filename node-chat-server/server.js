import express from "express";
import { WebSocketServer } from "ws";
import mysql from "mysql2/promise";
import cors from "cors";
import cookieParser from "cookie-parser";
import fetch from "node-fetch";

const app = express();
app.use(express.json());
app.use(cookieParser());

app.use(cors({
  origin: ["https://otakusic.com"],
  methods: ["GET", "POST"],
  credentials: true
}));

// ✅ Kết nối MySQL
const db = await mysql.createConnection({
  host: "77.37.35.67",
  user: "u134300833_otakusic",
  password: "Otakusic@2025",
  database: "u134300833_otakusic"
});

// ✅ API: Lấy 50 tin nhắn gần nhất
app.get("/messages", async (req, res) => {
  const [rows] = await db.query("SELECT * FROM otakusic_messages ORDER BY id DESC LIMIT 50");
  res.json(rows.reverse());
});

// ✅ API: Lưu tin nhắn (fallback)
app.post("/messages", async (req, res) => {
  try {
    const token = req.cookies.otakusic_amme || req.body.session;
    if (!token) return res.status(401).json({ error: "Chưa đăng nhập" });

    const [users] = await db.query(
      "SELECT id, fullname, avatar, frame FROM otakusic_user WHERE session_token = ?",
      [token]
    );
    if (users.length === 0) return res.status(403).json({ error: "Phiên không hợp lệ" });

    const user = users[0];

    // Lấy shape của frame
    let shape = "";
    if (user.frame) {
      const [frames] = await db.query(
        "SELECT shape FROM otakusic_frames WHERE picture = ? LIMIT 1",
        [user.frame]
      );
      if (frames.length > 0) shape = frames[0].shape;
    }

    const { message } = req.body;
    await db.query(
      "INSERT INTO otakusic_messages (user_id, fullname, avatar, frame, shape, message, created_at) VALUES (?, ?, ?, ?, ?, ?, NOW())",
      [user.id, user.fullname, user.avatar, user.frame, shape, message]
    );

    res.json({ success: true });
  } catch (err) {
    console.error("❌ Lỗi khi lưu tin nhắn:", err);
    res.status(500).json({ error: "Lỗi server" });
  }
});

// ✅ Khởi động server
const server = app.listen(10000, () => {
  console.log("✅ Server chạy tại cổng 10000");
});

const wss = new WebSocketServer({ server });

// ✅ WebSocket xử lý tin nhắn realtime
wss.on("connection", async (ws, req) => {
  console.log("👥 Client mới kết nối");

  ws.on("message", async rawData => {
    try {
      const msg = JSON.parse(rawData);
      const { message, user } = msg;
      if (!message?.trim()) return;

      const user_id = parseInt(user?.id || 0);

      // Lấy frame shape nếu có
      let shape = "";
      if (user?.frame) {
        const [frames] = await db.query(
          "SELECT shape FROM otakusic_frames WHERE picture = ? LIMIT 1",
          [user.frame]
        );
        if (frames.length > 0) shape = frames[0].shape;
      }

      // Lưu vào DB
      await db.query(
        "INSERT INTO otakusic_messages (user_id, fullname, avatar, frame, shape, message, created_at) VALUES (?, ?, ?, ?, ?, ?, NOW())",
        [user_id, user.fullname, user.avatar, user.frame, shape, message]
      );

      const payload = {
        user_id,
        fullname: user.fullname,
        avatar: user.avatar,
        frame: user.frame,
        shape,
        message,
        created_at: new Date().toISOString()
      };

      // Phát tới mọi client
      wss.clients.forEach(client => {
        if (client.readyState === ws.OPEN) client.send(JSON.stringify(payload));
      });
    } catch (err) {
      console.error("❌ Lỗi xử lý tin nhắn:", err);
    }
  });
});
