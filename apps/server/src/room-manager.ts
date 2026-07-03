import type { PlaybackAction, PlaybackState, ServerMessage } from "./protocol.js";

export interface ClientPeer {
  id: string;
  send(message: ServerMessage): void;
}

interface Room {
  code: string;
  hostId: string;
  clients: Map<string, ClientPeer>;
  state: PlaybackState | null;
}

const ROOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export class RoomManager {
  private readonly rooms = new Map<string, Room>();
  private readonly clientRooms = new Map<string, string>();

  create(client: ClientPeer): string {
    this.leave(client.id);
    const code = this.uniqueCode();
    const room: Room = {
      code,
      hostId: client.id,
      clients: new Map([[client.id, client]]),
      state: null,
    };
    this.rooms.set(code, room);
    this.clientRooms.set(client.id, code);
    client.send({
      type: "room_joined",
      roomCode: code,
      role: "host",
      participantCount: 1,
      state: null,
    });
    return code;
  }

  join(client: ClientPeer, requestedCode: string): boolean {
    const code = requestedCode.trim().toUpperCase();
    const room = this.rooms.get(code);
    if (!room) {
      client.send({ type: "error", code: "ROOM_NOT_FOUND", message: "Pokój nie istnieje." });
      return false;
    }
    if (room.clients.size >= 2 && !room.clients.has(client.id)) {
      client.send({ type: "error", code: "ROOM_FULL", message: "W pokoju są już dwie osoby." });
      return false;
    }

    this.leave(client.id);
    room.clients.set(client.id, client);
    this.clientRooms.set(client.id, room.code);
    client.send({
      type: "room_joined",
      roomCode: room.code,
      role: room.hostId === client.id ? "host" : "guest",
      participantCount: room.clients.size,
      state: this.projectState(room.state),
    });
    this.broadcast(room, { type: "participant_count", participantCount: room.clients.size });
    return true;
  }

  updatePlayback(
    clientId: string,
    action: PlaybackAction,
    input: Omit<PlaybackState, "updatedAt">,
  ): boolean {
    const room = this.roomFor(clientId);
    if (!room) return false;

    const state: PlaybackState = {
      currentTime: input.currentTime,
      paused: input.paused,
      playbackRate: input.playbackRate,
      updatedAt: Date.now(),
    };
    room.state = state;
    this.broadcast(room, { type: "playback", action, state, originClientId: clientId });
    return true;
  }

  leave(clientId: string): void {
    const code = this.clientRooms.get(clientId);
    if (!code) return;
    this.clientRooms.delete(clientId);

    const room = this.rooms.get(code);
    if (!room) return;
    room.clients.delete(clientId);

    if (clientId === room.hostId) {
      this.broadcast(room, { type: "room_closed" });
      for (const remainingId of room.clients.keys()) this.clientRooms.delete(remainingId);
      this.rooms.delete(code);
      return;
    }

    if (room.clients.size === 0) {
      this.rooms.delete(code);
    } else {
      this.broadcast(room, { type: "participant_count", participantCount: room.clients.size });
    }
  }

  hasClient(clientId: string): boolean {
    return this.clientRooms.has(clientId);
  }

  private roomFor(clientId: string): Room | undefined {
    const code = this.clientRooms.get(clientId);
    return code ? this.rooms.get(code) : undefined;
  }

  private broadcast(room: Room, message: ServerMessage): void {
    for (const client of room.clients.values()) client.send(message);
  }

  private projectState(state: PlaybackState | null): PlaybackState | null {
    if (!state || state.paused) return state;
    return {
      ...state,
      currentTime: state.currentTime + ((Date.now() - state.updatedAt) / 1000) * state.playbackRate,
      updatedAt: Date.now(),
    };
  }

  private uniqueCode(): string {
    for (;;) {
      let code = "";
      for (let i = 0; i < 6; i += 1) {
        code += ROOM_ALPHABET[Math.floor(Math.random() * ROOM_ALPHABET.length)];
      }
      if (!this.rooms.has(code)) return code;
    }
  }
}
