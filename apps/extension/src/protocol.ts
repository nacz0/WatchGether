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
