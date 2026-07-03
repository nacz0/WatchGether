import type { ExtensionStatus, PopupMessage } from "./messages";
import type { ActivityEvent, PlaybackAction, PlaybackState, ServerMessage } from "./protocol";

const status: ExtensionStatus = {
  supported: true,
  playerFound: false,
  connection: "disconnected",
  roomCode: null,
  role: null,
  clientId: null,
  participantCount: 0,
  participants: [],
  history: [],
  error: null,
};

let socket: WebSocket | null = null;
let video: HTMLVideoElement | null = null;
let suppressEventsUntil = 0;
let latencyMs = 0;
let heartbeatTimer: number | null = null;
let playerScanTimer: number | null = null;

chrome.runtime.onMessage.addListener((message: PopupMessage, _sender, sendResponse) => {
  switch (message.type) {
    case "get_status":
      sendResponse(status);
      break;
    case "create_room":
      connect(message.serverUrl, { type: "create_room", nickname: message.nickname });
      sendResponse({ ok: true });
      break;
    case "join_room":
      connect(message.serverUrl, {
        type: "join_room",
        roomCode: message.roomCode,
        nickname: message.nickname,
      });
      sendResponse({ ok: true });
      break;
    case "leave_room":
      leaveRoom();
      sendResponse({ ok: true });
      break;
  }
  return false;
});

function connect(serverUrl: string, initialMessage: object): void {
  closeSocket(false);
  status.connection = "connecting";
  status.error = null;
  status.history = [];
  notifyStatus();

  try {
    socket = new WebSocket(serverUrl);
  } catch {
    setDisconnected("Nieprawidłowy adres serwera.");
    return;
  }

  const connection = socket;
  connection.addEventListener("open", () => {
    if (socket !== connection) return;
    send(initialMessage);
    ping();
  });

  connection.addEventListener("message", (event) => {
    if (socket !== connection) return;
    const message = parseServerMessage(event.data);
    if (message) handleServerMessage(message);
  });

  connection.addEventListener("close", () => {
    if (socket !== connection) return;
    if (status.connection !== "disconnected") setDisconnected("Połączenie z serwerem zostało przerwane.");
  });
  connection.addEventListener("error", () => {
    if (socket === connection) setDisconnected("Nie można połączyć się z serwerem.");
  });
}

function handleServerMessage(message: ServerMessage): void {
  switch (message.type) {
    case "room_joined":
      status.connection = "connected";
      status.roomCode = message.roomCode;
      status.role = message.role;
      status.clientId = message.clientId;
      status.participantCount = message.participantCount;
      status.participants = message.participants;
      status.history = message.history;
      status.error = null;
      if (message.state) applyPlayback(message.state, "sync");
      startHeartbeat();
      notifyStatus();
      break;
    case "participants":
      status.participants = message.participants;
      status.participantCount = message.participants.length;
      notifyStatus();
      break;
    case "activity":
      addActivity(message.event);
      if (
        message.event.actorClientId !== status.clientId &&
        (message.event.type === "participant_joined" || message.event.type === "participant_left")
      ) {
        showToast(
          message.event.type === "participant_joined"
            ? `${message.event.nickname} dołączył(a) do pokoju`
            : `${message.event.nickname} opuścił(a) pokój`,
          message.event.type,
        );
      }
      notifyStatus();
      break;
    case "playback":
      applyPlayback(message.state, message.action);
      break;
    case "room_closed":
      setDisconnected("Host zamknął pokój.");
      closeSocket(false);
      break;
    case "pong":
      latencyMs = Math.max(0, performance.timeOrigin + performance.now() - message.sentAt);
      break;
    case "error":
      status.error = message.message;
      if (message.code === "ROOM_NOT_FOUND" || message.code === "ROOM_FULL") {
        status.connection = "disconnected";
      }
      notifyStatus();
      break;
  }
}

function attachVideo(candidate: HTMLVideoElement): void {
  if (video === candidate) return;
  if (video) removePlayerListeners(video);
  video = candidate;
  addPlayerListeners(video);
  status.playerFound = true;
  notifyStatus();
}

function addPlayerListeners(player: HTMLVideoElement): void {
  player.addEventListener("play", onPlay);
  player.addEventListener("pause", onPause);
  player.addEventListener("seeked", onSeeked);
  player.addEventListener("ratechange", onRateChange);
}

function removePlayerListeners(player: HTMLVideoElement): void {
  player.removeEventListener("play", onPlay);
  player.removeEventListener("pause", onPause);
  player.removeEventListener("seeked", onSeeked);
  player.removeEventListener("ratechange", onRateChange);
}

function onPlay(): void { emitPlayback("play"); }
function onPause(): void { emitPlayback("pause"); }
function onSeeked(): void { emitPlayback("seek"); }
function onRateChange(): void { emitPlayback("rate"); }

function emitPlayback(action: PlaybackAction): void {
  if (performance.now() < suppressEventsUntil || !video || status.connection !== "connected") return;
  send({
    type: "playback",
    action,
    currentTime: video.currentTime,
    paused: video.paused,
    playbackRate: video.playbackRate,
  });
}

function applyPlayback(state: PlaybackState, action: PlaybackAction): void {
  if (!video) return;
  suppressEventsUntil = performance.now() + 800;

  const transitCorrection = state.paused ? 0 : (latencyMs / 2000) * state.playbackRate;
  const targetTime = state.currentTime + transitCorrection;
  const tolerance = action === "sync" ? 0.75 : 0.2;
  if (Number.isFinite(targetTime) && Math.abs(video.currentTime - targetTime) > tolerance) {
    video.currentTime = Math.min(targetTime, Number.isFinite(video.duration) ? video.duration : targetTime);
  }
  if (Math.abs(video.playbackRate - state.playbackRate) > 0.01) video.playbackRate = state.playbackRate;

  if (state.paused && !video.paused) {
    video.pause();
  } else if (!state.paused && video.paused) {
    void video.play().catch(() => {
      status.error = "Kliknij odtwarzacz, aby przeglądarka zezwoliła na odtwarzanie.";
      notifyStatus();
    });
  }
}

function startHeartbeat(): void {
  stopHeartbeat();
  heartbeatTimer = window.setInterval(() => {
    ping();
    if (status.role === "host" && video && status.connection === "connected") emitPlayback("sync");
  }, 3_000);
}

function stopHeartbeat(): void {
  if (heartbeatTimer !== null) window.clearInterval(heartbeatTimer);
  heartbeatTimer = null;
}

function ping(): void {
  send({ type: "ping", sentAt: performance.timeOrigin + performance.now() });
}

function send(message: object): void {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

function leaveRoom(): void {
  send({ type: "leave_room" });
  closeSocket(true);
}

function closeSocket(clearError: boolean): void {
  stopHeartbeat();
  if (socket) {
    const connection = socket;
    socket = null;
    connection.close();
  }
  status.connection = "disconnected";
  status.roomCode = null;
  status.role = null;
  status.clientId = null;
  status.participantCount = 0;
  status.participants = [];
  if (clearError) status.error = null;
  notifyStatus();
}

function setDisconnected(error: string): void {
  status.connection = "disconnected";
  status.roomCode = null;
  status.role = null;
  status.clientId = null;
  status.participantCount = 0;
  status.participants = [];
  status.error = error;
  stopHeartbeat();
  notifyStatus();
}

function notifyStatus(): void {
  void chrome.runtime.sendMessage({ type: "watchgether_status", status }).catch(() => undefined);
}

function parseServerMessage(raw: unknown): ServerMessage | null {
  if (typeof raw !== "string") return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null && "type" in parsed) return parsed as ServerMessage;
  } catch {
    // Ignore malformed data from a non-compatible server.
  }
  return null;
}

function addActivity(event: ActivityEvent): void {
  if (status.history.some((existing) => existing.id === event.id)) return;
  status.history = [...status.history, event].slice(-100);
}

function showToast(
  message: string,
  type: "participant_joined" | "participant_left",
): void {
  const hostId = "watchgether-notifications";
  let host = document.getElementById(hostId);
  if (!host) {
    host = document.createElement("div");
    host.id = hostId;
    Object.assign(host.style, {
      position: "fixed",
      top: "24px",
      right: "24px",
      zIndex: "2147483647",
      display: "flex",
      flexDirection: "column",
      gap: "10px",
      pointerEvents: "none",
    });
    document.documentElement.append(host);
  }

  const toast = document.createElement("div");
  toast.textContent = message;
  Object.assign(toast.style, {
    padding: "12px 16px",
    border: `1px solid ${type === "participant_joined" ? "#3f9466" : "#73505a"}`,
    borderRadius: "12px",
    color: "#fff",
    background: "rgba(24, 20, 28, .96)",
    boxShadow: "0 12px 32px rgba(0,0,0,.35)",
    font: "600 14px/1.35 system-ui, sans-serif",
    opacity: "0",
    transform: "translateY(-8px)",
    transition: "opacity .18s ease, transform .18s ease",
  });
  host.append(toast);
  requestAnimationFrame(() => {
    toast.style.opacity = "1";
    toast.style.transform = "translateY(0)";
  });
  window.setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(-8px)";
    window.setTimeout(() => toast.remove(), 200);
  }, 3_500);
}

function findVideo(root: Document | ShadowRoot = document): HTMLVideoElement | null {
  const direct = root.querySelector("video");
  if (direct instanceof HTMLVideoElement) return direct;
  for (const element of root.querySelectorAll("*")) {
    if (element.shadowRoot) {
      const nested = findVideo(element.shadowRoot);
      if (nested) return nested;
    }
  }
  return null;
}

function scanForPlayer(): void {
  const found = findVideo();
  if (found) attachVideo(found);
  if (!found && video && !video.isConnected) {
    removePlayerListeners(video);
    video = null;
    status.playerFound = false;
    notifyStatus();
  }
}

scanForPlayer();
playerScanTimer = window.setInterval(scanForPlayer, 1_000);
window.addEventListener("pagehide", () => {
  if (playerScanTimer !== null) window.clearInterval(playerScanTimer);
  closeSocket(false);
});
