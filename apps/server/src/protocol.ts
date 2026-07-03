export type PlaybackAction = "play" | "pause" | "seek" | "rate" | "sync";

export interface PlaybackState {
  currentTime: number;
  paused: boolean;
  playbackRate: number;
  updatedAt: number;
}

export interface Participant {
  clientId: string;
  nickname: string;
}

export type ActivityEvent =
  | {
      id: string;
      type: "participant_joined" | "participant_left";
      actorClientId: string;
      nickname: string;
      createdAt: number;
    }
  | {
      id: string;
      type: "playback";
      actorClientId: string;
      nickname: string;
      action: Exclude<PlaybackAction, "sync">;
      currentTime: number;
      playbackRate: number;
      createdAt: number;
    };

export type ClientMessage =
  | { type: "create_room"; nickname: string }
  | { type: "join_room"; roomCode: string; nickname: string }
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
      clientId: string;
      participantCount: number;
      participants: Participant[];
      history: ActivityEvent[];
      state: PlaybackState | null;
    }
  | { type: "participants"; participants: Participant[] }
  | { type: "activity"; event: ActivityEvent }
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
      return validNickname(value.nickname)
        ? { type: "create_room", nickname: value.nickname.trim() }
        : null;
    case "leave_room":
      return { type: "leave_room" };
    case "join_room":
      return typeof value.roomCode === "string" && validNickname(value.nickname)
        ? { type: "join_room", roomCode: value.roomCode, nickname: value.nickname.trim() }
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

function validNickname(value: unknown): value is string {
  return typeof value === "string" && value.trim().length >= 2 && value.trim().length <= 20;
}
