import express from "express";
import { WebSocketServer } from "ws";
import mysql from "mysql2/promise";
import cors from "cors";

const app = express();
app.use(express.json());

// ⚡ Cho phép CORS cho web của bạn
app.use(cors({
  origin: ["https://otakusic.com"], // domain frontend của bạn
  methods: ["GET", "POST"],
  credentials: true
}));

// ⚙️ Kết nối MySQL
const db = await mysql.createConnection({
  host: "77.37.35.67",      // ví dụ: "localhost"
  user: "u134300833_otakusic",      // ví dụ: "root"
  password: "Otakusic@2025",
  database: "u134300833_otakusic"   // ví dụ: "otakusic"
});

// 📦 Lưu tin nhắn
app.post("/messages", async (req, res) => {
  const { user_id, fullname, avatar, message } = req.body;
  await db.query(
    "INSERT INTO otakusic_messages (user_id, fullname, avatar, message, created_at) VALUES (?, ?, ?, ?, NOW())",
    [user_id, fullname, avatar, message]
  );
  res.json({ success: true });
});

// 📤 Trả về tin nhắn
app.get("/messages", async (req, res) => {
  const [rows] = await db.query(
    "SELECT * FROM otakusic_messages ORDER BY id DESC LIMIT 50"
  );
  res.json(rows.reverse());
});

// 🚀 HTTP server + WebSocket
const server = app.listen(10000, () => {
  console.log("✅ Server chạy cổng 10000");
});

const wss = new WebSocketServer({ server });

wss.on("connection", ws => {
  console.log("👥 Người dùng mới kết nối");

  ws.on("message", async data => {
    try {
      const msg = JSON.parse(data);
      await db.query(
        "INSERT INTO otakusic_messages (user_id, fullname, avatar, message, created_at) VALUES (?, ?, ?, ?, NOW())",
        [msg.user_id, msg.fullname, msg.avatar, msg.message]
      );

      // Gửi lại cho tất cả client
      wss.clients.forEach(client => {
        if (client.readyState === ws.OPEN) {
          client.send(JSON.stringify(msg));
        }
      });
    } catch (err) {
      console.error("❌ Lỗi khi xử lý tin nhắn:", err);
    }
  });
});

