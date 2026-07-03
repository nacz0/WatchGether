import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import { parseClientMessage, type ServerMessage } from "./protocol.js";
import { RoomManager } from "./room-manager.js";

const port = Number(process.env.PORT ?? 8787);
const allowedOrigin = process.env.ALLOWED_ORIGIN;
const rooms = new RoomManager();

const server = createServer((request, response) => {
  response.setHeader("Access-Control-Allow-Origin", allowedOrigin ?? "*");
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  if (request.url === "/health") {
    response.writeHead(200);
    response.end(JSON.stringify({ status: "ok" }));
    return;
  }
  response.writeHead(404);
  response.end(JSON.stringify({ error: "not_found" }));
});

const wss = new WebSocketServer({
  server,
  maxPayload: 8 * 1024,
  verifyClient: ({ origin }, done) => done(!allowedOrigin || origin === allowedOrigin, 403),
});

wss.on("connection", (socket) => {
  const clientId = randomUUID();
  const peer = {
    id: clientId,
    nickname: "Anonim",
    send(message: ServerMessage) {
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
    },
  };

  socket.on("message", (data) => {
    const message = parseClientMessage(data.toString());
    if (!message) {
      peer.send({ type: "error", code: "INVALID_MESSAGE", message: "Nieprawidłowa wiadomość." });
      return;
    }

    switch (message.type) {
      case "create_room":
        rooms.create(peer, message.nickname);
        break;
      case "join_room":
        rooms.join(peer, message.roomCode, message.nickname);
        break;
      case "playback":
        if (!rooms.updatePlayback(clientId, message.action, message)) {
          peer.send({ type: "error", code: "NOT_IN_ROOM", message: "Najpierw dołącz do pokoju." });
        }
        break;
      case "leave_room":
        rooms.leave(clientId);
        break;
      case "ping":
        peer.send({ type: "pong", sentAt: message.sentAt });
        break;
    }
  });

  socket.on("close", () => rooms.leave(clientId));
  socket.on("error", () => rooms.leave(clientId));
});

const heartbeat = setInterval(() => {
  for (const socket of wss.clients) {
    if (socket.readyState === WebSocket.OPEN) socket.ping();
  }
}, 30_000);

server.listen(port, "0.0.0.0", () => {
  console.log(`WatchGether server listening on http://localhost:${port}`);
});

function shutdown(): void {
  clearInterval(heartbeat);
  wss.close(() => server.close(() => process.exit(0)));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
