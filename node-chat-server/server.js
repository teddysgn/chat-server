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
app.use(cors({
  origin: "https://otakusic.com",
  credentials: true
}));

// ⚙️ Config MySQL
const dbConfig = {
  host: "72.61.119.15",
  user: "teddy_sgn",
  password: "OtakusicManga@2025",
  database: "otak_manga",
  port: 3306,
  waitForConnections: true,
  connectionLimit: 10,
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

// 🚀 HTTP + WebSocket server
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

wss.on("connection", (ws) => {
  console.log("👥 WebSocket kết nối mới");

  ws.on("message", async (rawData) => {
    try {
      const msg = JSON.parse(rawData);
      const { action, message, message_id, user } = msg;

      // ---------------- Gửi tin nhắn ----------------
      if (action === "message") {
        if (!user?.id || !message?.trim()) return;

        let shape = "";
        if (user.frame) {
          const [frames] = await pool.query(
            "SELECT shape FROM otakusic_frames WHERE picture = ? LIMIT 1",
            [user.frame]
          );
          if (frames.length > 0) shape = frames[0].shape;
        }

        const [result] = await pool.query(
          "INSERT INTO otakusic_messages (user_id, fullname, avatar, frame, shape, role, message, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())",
          [user.id, user.fullname, user.avatar, user.frame, shape, user.role, message]
        );

        const payload = {
          action: "message",
          id: result.insertId,
          user_id: user.id,
          fullname: user.fullname,
          avatar: user.avatar,
          frame: user.frame,
          shape,
          role: user.role,
          message,
          created_at: new Date().toISOString(),
        };


        wss.clients.forEach((client) => {
          if (client.readyState === ws.OPEN) client.send(JSON.stringify(payload));
        });
      }

      // ---------------- Xóa tin nhắn ----------------
      if (action === "delete") {
        if (!user?.id || !message_id) return;

        // Kiểm tra quyền
        if (!["admin", "creator"].includes(user.role)) {
          // cho phép user xóa tin nhắn của chính mình
          const [rows] = await pool.query(
            "SELECT user_id FROM otakusic_messages WHERE id = ? LIMIT 1",
            [message_id]
          );
          if (!rows.length || rows[0].user_id !== user.id) return;
        }

        // Cập nhật deleted
        await pool.query(
          "UPDATE otakusic_messages SET deleted = 1 WHERE id = ?",
          [message_id]
        );

        // Thông báo cho mọi client
        const payload = {
          action: "deleted",
          message_id
        };

        wss.clients.forEach((client) => {
          if (client.readyState === ws.OPEN) client.send(JSON.stringify(payload));
        });
      }

    } catch (err) {
      console.error("❌ Lỗi WebSocket:", err);
    }
  });

  ws.on("close", () => console.log("❌ Client đã ngắt kết nối"));
});

server.listen(10000, () => {
  console.log("✅ Chat server đang chạy tại cổng 10000");
});
