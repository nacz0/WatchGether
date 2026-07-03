export type PlaybackAction = "play" | "pause" | "seek" | "rate" | "sync";

export interface PlaybackState {
  currentTime: number;
  paused: boolean;
  playbackRate: number;
  updatedAt: number;
}

export type ClientMessage =
  | { type: "create_room" }
  | { type: "join_room"; roomCode: string }
  | {
      type: "playback";
      action: PlaybackAction;
      currentTime: number;
      paused: boolean;
      playbackRate: number;
    }
  | { type: "leave_room" }
  | { type: "ping"; sentAt: number };

export type ServerMessage =
  | {
      type: "room_joined";
      roomCode: string;
      role: "host" | "guest";
      participantCount: number;
      state: PlaybackState | null;
    }
  | { type: "participant_count"; participantCount: number }
  | {
      type: "playback";
      action: PlaybackAction;
      state: PlaybackState;
      originClientId: string;
    }
  | { type: "room_closed" }
  | { type: "pong"; sentAt: number }
  | { type: "error"; code: string; message: string };

export function parseClientMessage(raw: string): ClientMessage | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!isRecord(value) || typeof value.type !== "string") return null;

  switch (value.type) {
    case "create_room":
    case "leave_room":
      return { type: value.type };
    case "join_room":
      return typeof value.roomCode === "string"
        ? { type: "join_room", roomCode: value.roomCode }
        : null;
    case "ping":
      return finiteNumber(value.sentAt)
        ? { type: "ping", sentAt: value.sentAt }
        : null;
    case "playback":
      if (
        !isPlaybackAction(value.action) ||
        !finiteNumber(value.currentTime) ||
        typeof value.paused !== "boolean" ||
        !finiteNumber(value.playbackRate)
      ) {
        return null;
      }
      return {
        type: "playback",
        action: value.action,
        currentTime: Math.max(0, value.currentTime),
        paused: value.paused,
        playbackRate: Math.min(4, Math.max(0.25, value.playbackRate)),
      };
    default:
      return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isPlaybackAction(value: unknown): value is PlaybackAction {
  return ["play", "pause", "seek", "rate", "sync"].includes(String(value));
}
