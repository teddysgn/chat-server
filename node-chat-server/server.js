import express from "express";
import { WebSocketServer } from "ws";
import mysql from "mysql2/promise";
import cors from "cors";
import cookieParser from "cookie-parser";

const app = express();
app.use(express.json());
app.use(cookieParser());

// ⚡ Cho phép CORS cho frontend
app.use(
  cors({
    origin: ["https://otakusic.com"],
    methods: ["GET", "POST"],
    credentials: true,
  })
);

// ⚙️ Kết nối MySQL
const db = await mysql.createConnection({
  host: "77.37.35.67",
  user: "u134300833_otakusic",
  password: "Otakusic@2025",
  database: "u134300833_otakusic",
});

// 📤 API: Lấy danh sách tin nhắn
app.get("/messages", async (req, res) => {
  const [rows] = await db.query(
    "SELECT * FROM otakusic_messages ORDER BY id DESC LIMIT 50"
  );
  res.json(rows.reverse());
});

// 📦 API: Lưu tin nhắn qua HTTP
app.post("/messages", async (req, res) => {
  try {
    const token = req.cookies.otakusic_amme || req.body.session;
    if (!token) return res.status(401).json({ error: "Chưa đăng nhập" });

    // 🔍 Lấy user theo session
    const [users] = await db.query(
      "SELECT id, fullname, avatar, frame FROM otakusic_user WHERE session_token = ? LIMIT 1",
      [token]
    );
    if (users.length === 0)
      return res.status(403).json({ error: "Phiên không hợp lệ" });

    const user = users[0];

    // 🔍 Lấy shape của frame (nếu có)
    let shape = null;
    if (user.frame) {
      const [frames] = await db.query(
        "SELECT shape FROM otakusic_frames WHERE picture = ? LIMIT 1",
        [user.frame]
      );
      if (frames.length > 0) shape = frames[0].shape;
    }

    const { message } = req.body;
    if (!message?.trim()) return res.status(400).json({ error: "Tin nhắn trống" });

    // 💾 Lưu vào DB
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

// 🚀 HTTP server + WebSocket
const server = app.listen(10000, () => {
  console.log("✅ Server chạy cổng 10000");
});

const wss = new WebSocketServer({ server });

// ⚡ WebSocket: Khi có người kết nối
wss.on("connection", async (ws, req) => {
  console.log("👥 Người dùng mới kết nối");

  // Lấy cookie từ header
  const cookieHeader = req.headers.cookie || "";
  const cookies = Object.fromEntries(
    cookieHeader.split(";").map((c) => {
      const [key, value] = c.trim().split("=");
      return [key, value];
    })
  );

  const sessionToken = cookies["otakusic_amme"];

  // 🔍 Lấy user
  let user = null;
  if (sessionToken) {
    const [rows] = await db.query(
      "SELECT id, fullname, avatar, frame FROM otakusic_user WHERE session_token = ? LIMIT 1",
      [sessionToken]
    );
    if (rows.length > 0) user = rows[0];

    // 🔍 Lấy shape của frame
    if (user && user.frame) {
      const [frames] = await db.query(
        "SELECT shape FROM otakusic_frames WHERE picture = ? LIMIT 1",
        [user.frame]
      );
      if (frames.length > 0) user.shape = frames[0].shape;
    }
  }

  // 📨 Khi nhận tin nhắn
  ws.on("message", async (data) => {
    try {
      const msgData = JSON.parse(data);
      const message = msgData.message?.trim();
      if (!message) return;

      // Nếu có user → dùng thông tin user; nếu không → ẩn danh
      const sender = user || {
        id: 0,
        fullname: "Khách",
        avatar: "/public/images/default-avatar.png",
        frame: "",
        shape: "",
      };

      // 💾 Lưu DB
      await db.query(
        "INSERT INTO otakusic_messages (user_id, fullname, avatar, frame, shape, message, created_at) VALUES (?, ?, ?, ?, ?, ?, NOW())",
        [
          sender.id,
          sender.fullname,
          sender.avatar,
          sender.frame,
          sender.shape,
          message,
        ]
      );

      // 🔁 Gửi tin nhắn tới tất cả client
      const payload = {
        user_id: sender.id,
        fullname: sender.fullname,
        avatar: sender.avatar,
        frame: sender.frame,
        shape: sender.shape,
        message,
        created_at: new Date().toISOString(),
      };

      wss.clients.forEach((client) => {
        if (client.readyState === ws.OPEN) {
          client.send(JSON.stringify(payload));
        }
      });
    } catch (err) {
      console.error("❌ Lỗi khi xử lý tin nhắn:", err);
    }
  });
});
