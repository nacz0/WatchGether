import type { ActivityEvent, Participant } from "./protocol";

export interface ExtensionStatus {
  supported: boolean;
  playerFound: boolean;
  connection: "disconnected" | "connecting" | "connected";
  roomCode: string | null;
  role: "host" | "guest" | null;
  clientId: string | null;
  participantCount: number;
  participants: Participant[];
  history: ActivityEvent[];
  error: string | null;
}

export type PopupMessage =
  | { type: "get_status" }
  | { type: "create_room"; serverUrl: string; nickname: string }
  | { type: "join_room"; serverUrl: string; roomCode: string; nickname: string }
  | { type: "leave_room" };

export type ContentNotification = { type: "watchgether_status"; status: ExtensionStatus };
