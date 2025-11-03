import express from "express";
import { WebSocketServer } from "ws";
import mysql from "mysql2/promise";
import cors from "cors";
import cookieParser from "cookie-parser";

const app = express();
app.use(express.json());
app.use(cookieParser());

// ⚡ Cho phép CORS cho web của bạn
app.use(cors({
  origin: ["https://otakusic.com"],
  methods: ["GET", "POST"],
  credentials: true
}));

// ⚙️ Kết nối MySQL
const db = await mysql.createConnection({
  host: "77.37.35.67",
  user: "u134300833_otakusic",
  password: "Otakusic@2025",
  database: "u134300833_otakusic"
});

// 📤 Trả về tin nhắn
app.get("/messages", async (req, res) => {
  const [rows] = await db.query(
    "SELECT * FROM otakusic_messages ORDER BY id DESC LIMIT 50"
  );
  res.json(rows.reverse());
});

// 📦 Lưu tin nhắn (HTTP fallback nếu cần)
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
    const { message } = req.body;

    await db.query(
      "INSERT INTO otakusic_messages (user_id, fullname, avatar, frame, message, created_at) VALUES (?, ?, ?, ?, ?, NOW())",
      [user.id, user.fullname, user.avatar, user.frame, message]
    );

    res.json({ success: true });
  } catch (err) {
    console.error("❌ Lỗi khi lưu tin nhắn:", err);
    res.status(500).json({ error: "Lỗi server" });
  }
});

// 🚀 HTTP server + WebSocket
const server = app.listen(10000, () => {
  console.log("✅ Server chạy cổng 10000");
});

const wss = new WebSocketServer({ server });

// ⚡ Khi có người kết nối WebSocket
wss.on("connection", async (ws, req) => {
  console.log("👥 Người dùng mới kết nối");

  // Lấy cookie từ header
  const cookieHeader = req.headers.cookie || "";
  const cookies = Object.fromEntries(cookieHeader.split(";").map(c => {
    const [key, value] = c.trim().split("=");
    return [key, value];
  }));

  const sessionToken = cookies["otakusic_amme"];

  // Nếu có sessionToken → truy vấn thông tin user
  let user = null;
  if (sessionToken) {
    const [rows] = await db.query(
      "SELECT id, fullname, avatar, frame FROM otakusic_user WHERE session_token = ?",
      [sessionToken]
    );
    if (rows.length > 0) user = rows[0];
  }

  ws.on("message", async data => {
    try {
      const msgData = JSON.parse(data);
      const message = msgData.message?.trim();
      if (!message) return;

      // Nếu có thông tin user thì dùng, ngược lại thì ẩn danh
      const sender = user || {
        id: 0,
        fullname: "Khách",
        avatar: "/public/images/default-avatar.png",
        frame: ""
      };

      // Lưu DB
      await db.query(
        "INSERT INTO otakusic_messages (user_id, fullname, avatar, frame, message, created_at) VALUES (?, ?, ?, ?, ?, NOW())",
        [sender.id, sender.fullname, sender.avatar, sender.frame, message]
      );

      // Gửi tin nhắn cho tất cả client
      const payload = {
        user_id: sender.id,
        fullname: sender.fullname,
        avatar: sender.avatar,
        frame: sender.frame,
        message,
        created_at: new Date().toISOString()
      };

      wss.clients.forEach(client => {
        if (client.readyState === ws.OPEN) {
          client.send(JSON.stringify(payload));
        }
      });
    } catch (err) {
      console.error("❌ Lỗi khi xử lý tin nhắn:", err);
    }
  });
});
