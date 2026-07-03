import { randomUUID } from "node:crypto";
import type {
  ActivityEvent,
  Participant,
  PlaybackAction,
  PlaybackState,
  ServerMessage,
} from "./protocol.js";

export interface ClientPeer {
  id: string;
  nickname: string;
  send(message: ServerMessage): void;
}

interface Room {
  code: string;
  hostId: string;
  clients: Map<string, ClientPeer>;
  state: PlaybackState | null;
  history: ActivityEvent[];
}

const ROOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export class RoomManager {
  private readonly rooms = new Map<string, Room>();
  private readonly clientRooms = new Map<string, string>();

  create(client: ClientPeer, nickname: string): string {
    this.leave(client.id);
    client.nickname = nickname;
    const code = this.uniqueCode();
    const room: Room = {
      code,
      hostId: client.id,
      clients: new Map([[client.id, client]]),
      state: null,
      history: [],
    };
    const joinedEvent = this.participantEvent("participant_joined", client);
    room.history.push(joinedEvent);
    this.rooms.set(code, room);
    this.clientRooms.set(client.id, code);
    client.send({
      type: "room_joined",
      roomCode: code,
      role: "host",
      clientId: client.id,
      participantCount: 1,
      participants: this.participants(room),
      history: [...room.history],
      state: null,
    });
    return code;
  }

  join(client: ClientPeer, requestedCode: string, nickname: string): boolean {
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
    client.nickname = nickname;
    room.clients.set(client.id, client);
    this.clientRooms.set(client.id, room.code);
    const joinedEvent = this.participantEvent("participant_joined", client);
    this.addHistory(room, joinedEvent);
    client.send({
      type: "room_joined",
      roomCode: room.code,
      role: room.hostId === client.id ? "host" : "guest",
      clientId: client.id,
      participantCount: room.clients.size,
      participants: this.participants(room),
      history: [...room.history],
      state: this.projectState(room.state),
    });
    this.broadcast(room, { type: "participants", participants: this.participants(room) });
    this.broadcast(room, { type: "activity", event: joinedEvent });
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
    if (action !== "sync") {
      const client = room.clients.get(clientId);
      if (client) {
        const event: ActivityEvent = {
          id: randomUUID(),
          type: "playback",
          actorClientId: client.id,
          nickname: client.nickname,
          action,
          currentTime: state.currentTime,
          playbackRate: state.playbackRate,
          createdAt: state.updatedAt,
        };
        this.addHistory(room, event);
        this.broadcast(room, { type: "activity", event });
      }
    }
    return true;
  }

  leave(clientId: string): void {
    const code = this.clientRooms.get(clientId);
    if (!code) return;
    this.clientRooms.delete(clientId);

    const room = this.rooms.get(code);
    if (!room) return;
    const leavingClient = room.clients.get(clientId);
    room.clients.delete(clientId);

    if (leavingClient) {
      const leftEvent = this.participantEvent("participant_left", leavingClient);
      this.addHistory(room, leftEvent);
      this.broadcast(room, { type: "activity", event: leftEvent });
    }

    if (clientId === room.hostId) {
      this.broadcast(room, { type: "room_closed" });
      for (const remainingId of room.clients.keys()) this.clientRooms.delete(remainingId);
      this.rooms.delete(code);
      return;
    }

    if (room.clients.size === 0) {
      this.rooms.delete(code);
    } else {
      this.broadcast(room, { type: "participants", participants: this.participants(room) });
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

  private participants(room: Room): Participant[] {
    return [...room.clients.values()].map(({ id, nickname }) => ({ clientId: id, nickname }));
  }

  private participantEvent(
    type: "participant_joined" | "participant_left",
    client: ClientPeer,
  ): ActivityEvent {
    return {
      id: randomUUID(),
      type,
      actorClientId: client.id,
      nickname: client.nickname,
      createdAt: Date.now(),
    };
  }

  private addHistory(room: Room, event: ActivityEvent): void {
    room.history.push(event);
    if (room.history.length > 100) room.history.splice(0, room.history.length - 100);
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
