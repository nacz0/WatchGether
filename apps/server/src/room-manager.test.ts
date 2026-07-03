import assert from "node:assert/strict";
import { test } from "node:test";
import type { ServerMessage } from "./protocol.js";
import { RoomManager, type ClientPeer } from "./room-manager.js";

function peer(id: string): ClientPeer & { messages: ServerMessage[] } {
  const messages: ServerMessage[] = [];
  return { id, messages, send: (message) => messages.push(message) };
}

test("creates a room and allows exactly one guest", () => {
  const manager = new RoomManager();
  const host = peer("host");
  const guest = peer("guest");
  const third = peer("third");
  const code = manager.create(host);

  assert.equal(code.length, 6);
  assert.equal(manager.join(guest, code.toLowerCase()), true);
  assert.equal(manager.join(third, code), false);
  assert.deepEqual(third.messages.at(-1), {
    type: "error",
    code: "ROOM_FULL",
    message: "W pokoju są już dwie osoby.",
  });
});

test("broadcasts playback and closes the room when host leaves", () => {
  const manager = new RoomManager();
  const host = peer("host");
  const guest = peer("guest");
  const code = manager.create(host);
  manager.join(guest, code);

  manager.updatePlayback("guest", "seek", {
    currentTime: 42,
    paused: true,
    playbackRate: 1,
  });

  const playback = [...host.messages].reverse().find((message) => message.type === "playback");
  assert.equal(playback?.type, "playback");
  if (playback?.type === "playback") assert.equal(playback.state.currentTime, 42);

  manager.leave("host");
  assert.equal(guest.messages.at(-1)?.type, "room_closed");
  assert.equal(manager.hasClient("guest"), false);
});
