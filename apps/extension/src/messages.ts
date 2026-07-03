export interface ExtensionStatus {
  supported: boolean;
  playerFound: boolean;
  connection: "disconnected" | "connecting" | "connected";
  roomCode: string | null;
  role: "host" | "guest" | null;
  participantCount: number;
  error: string | null;
}

export type PopupMessage =
  | { type: "get_status" }
  | { type: "create_room"; serverUrl: string }
  | { type: "join_room"; serverUrl: string; roomCode: string }
  | { type: "leave_room" };

export type ContentNotification = { type: "watchgether_status"; status: ExtensionStatus };
