import express from "express";
import { WebSocketServer } from "ws";
import mysql from "mysql2/promise";
import cors from "cors";
import cookieParser from "cookie-parser";

const app = express();
app.use(express.json());
app.use(cookieParser());

// ⚡ Cho phép CORS
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

// 📦 API: Lưu tin nhắn qua HTTP (phòng trường hợp cần)
app.post("/messages", async (req, res) => {
  try {
    const { message, user } = req.body;
    if (!user?.id) return res.status(401).json({ error: "Thiếu thông tin người dùng" });
    if (!message?.trim()) return res.status(400).json({ error: "Tin nhắn trống" });

    // 🔍 Lấy shape của frame (nếu có)
    let shape = "";
    if (user.frame) {
      const [frames] = await db.query(
        "SELECT shape FROM otakusic_frames WHERE picture = ? LIMIT 1",
        [user.frame]
      );
      if (frames.length > 0) shape = frames[0].shape;
    }

    // 💾 Lưu DB
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

// 🚀 HTTP + WebSocket
const server = app.listen(10000, () => {
  console.log("✅ Server chạy tại cổng 10000");
});

const wss = new WebSocketServer({ server });

// ⚡ WebSocket: Xử lý tin nhắn realtime
wss.on("connection", async (ws) => {
  console.log("👥 Người dùng mới kết nối");

  ws.on("message", async (data) => {
    try {
      const msgData = JSON.parse(data);
      const { message, user } = msgData;
      if (!message?.trim()) return;
      if (!user?.id) {
        console.warn("⚠️ Không có thông tin người dùng, bỏ qua tin nhắn");
        return;
      }

      // 🔍 Lấy shape của frame
      let shape = "";
      if (user.frame) {
        const [frames] = await db.query(
          "SELECT shape FROM otakusic_frames WHERE picture = ? LIMIT 1",
          [user.frame]
        );
        if (frames.length > 0) shape = frames[0].shape;
      }

      // 💾 Lưu DB
      await db.query(
        "INSERT INTO otakusic_messages (user_id, fullname, avatar, frame, shape, message, created_at) VALUES (?, ?, ?, ?, ?, ?, NOW())",
        [user.id, user.fullname, user.avatar, user.frame, shape, message]
      );

      // 🔁 Gửi lại cho tất cả client
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
      console.error("❌ Lỗi khi xử lý tin nhắn:", err);
    }
  });
});
