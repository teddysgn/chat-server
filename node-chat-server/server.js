import express from "express";
import { WebSocketServer } from "ws";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

// Danh sách kết nối WebSocket
let clients = [];

// API test
app.get("/", (req, res) => {
  res.send("Chat server đang chạy ✅");
});

const server = app.listen(process.env.PORT || 3000, () => {
  console.log("Server chạy cổng", process.env.PORT || 3000);
});

// Khởi tạo WebSocket server
const wss = new WebSocketServer({ server });

wss.on("connection", (ws) => {
  clients.push(ws);
  console.log("🔌 Client mới kết nối:", clients.length);

  ws.on("message", (message) => {
    // Khi nhận tin nhắn, broadcast đến tất cả
    clients.forEach((client) => {
      if (client.readyState === ws.OPEN) {
        client.send(message.toString());
      }
    });
  });

  ws.on("close", () => {
    clients = clients.filter((c) => c !== ws);
    console.log("❌ Client ngắt kết nối. Còn lại:", clients.length);
  });
});
