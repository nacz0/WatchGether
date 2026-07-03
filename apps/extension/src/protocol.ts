export type PlaybackAction = "play" | "pause" | "seek" | "rate" | "sync";

export interface PlaybackState {
  currentTime: number;
  paused: boolean;
  playbackRate: number;
  updatedAt: number;
}

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
