import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import type { ClientToServerEvents, ServerToClientEvents } from "shared/types";

import { sessionRouter } from "./routes/sessions";
import { restaurantRouter } from "./routes/restaurants";
import { geocodingRouter } from "./routes/geocoding";
import {
  registerSessionHandlers,
  startSessionSweeper,
} from "./socket/sessionHandler";

const app = express();
const httpServer = createServer(app);

const PORT = process.env.PORT ?? 3000;

// capacitor://localhost は iOS アプリ（Capacitor WebView）の origin
const corsOrigin =
  process.env.NODE_ENV === "production"
    ? [
        process.env.CLIENT_URL ?? "http://localhost:5173",
        "capacitor://localhost",
      ]
    : [/^http:\/\/localhost:\d+$/, "capacitor://localhost"];

// ── Middleware ──────────────────────────────────────────
app.use(cors({ origin: corsOrigin, credentials: true }));
app.use(express.json());

// ── REST Routes ─────────────────────────────────────────
app.use("/api/sessions", sessionRouter);
app.use("/api/restaurants", restaurantRouter);
app.use("/api/geocode", geocodingRouter);

app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ── Socket.IO ───────────────────────────────────────────
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: {
    origin: corsOrigin,
    methods: ["GET", "POST"],
    credentials: true,
  },
});

io.on("connection", (socket) => {
  console.log(`[Socket] connected: ${socket.id}`);
  registerSessionHandlers(io, socket);

  socket.on("disconnect", (reason) => {
    console.log(`[Socket] disconnected: ${socket.id} (${reason})`);
  });
});

// 放置セッションの定期清掃（インメモリストアのため必須）
startSessionSweeper(io);

// ── Start ────────────────────────────────────────────────
httpServer.listen(PORT, () => {
  console.log(`[Server] listening on http://localhost:${PORT}`);
});

export { io };
