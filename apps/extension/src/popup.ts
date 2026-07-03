import type { ExtensionStatus, PopupMessage } from "./messages";
import type { ActivityEvent } from "./protocol";

const DEFAULT_SERVER_URL = "ws://localhost:8787";

const unsupported = element("unsupported");
const disconnected = element("disconnected");
const connected = element("connected");
const createButton = button("create");
const joinButton = button("join");
const leaveButton = button("leave");
const copyButton = button("copy-code");
const roomCodeInput = input("room-code");
const nicknameInput = input("nickname");
const serverUrlInput = input("server-url");
const playerStatus = element("player-status");
const participantCount = element("participant-count");
const roleDescription = element("role-description");
const participantList = element("participant-list");
const historyPanel = element("history-panel");
const historyList = element("history") as HTMLOListElement;
const historyCount = element("history-count");
const error = element("error");

let activeTabId: number | null = null;

async function initialize(): Promise<void> {
  const stored = await chrome.storage.local.get(["serverUrl", "nickname"]);
  serverUrlInput.value = typeof stored.serverUrl === "string" ? stored.serverUrl : DEFAULT_SERVER_URL;
  nicknameInput.value = typeof stored.nickname === "string" ? stored.nickname : "";

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  activeTabId = tab?.id ?? null;
  const supported = Boolean(tab?.url?.startsWith("https://www.crunchyroll.com/"));
  if (!supported || activeTabId === null) {
    render({
      supported: false,
      playerFound: false,
      connection: "disconnected",
      roomCode: null,
      role: null,
      clientId: null,
      participantCount: 0,
      participants: [],
      history: [],
      error: null,
    });
    return;
  }

  try {
    render(await sendToContent({ type: "get_status" }) as ExtensionStatus);
  } catch {
    render({
      supported: true,
      playerFound: false,
      connection: "disconnected",
      roomCode: null,
      role: null,
      clientId: null,
      participantCount: 0,
      participants: [],
      history: [],
      error: "Odśwież kartę Crunchyroll po zainstalowaniu rozszerzenia.",
    });
  }
}

createButton.addEventListener("click", async () => {
  const nickname = await saveNickname();
  if (!nickname) return;
  await runAction({ type: "create_room", serverUrl: await saveServerUrl(), nickname });
});

joinButton.addEventListener("click", async () => {
  const roomCode = roomCodeInput.value.trim().toUpperCase();
  if (!/^[A-Z2-9]{6}$/.test(roomCode)) {
    showError("Wpisz sześciocyfrowy kod pokoju.");
    return;
  }
  const nickname = await saveNickname();
  if (!nickname) return;
  await runAction({ type: "join_room", serverUrl: await saveServerUrl(), roomCode, nickname });
});

roomCodeInput.addEventListener("input", () => {
  roomCodeInput.value = roomCodeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
});
roomCodeInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") joinButton.click();
});

leaveButton.addEventListener("click", () => runAction({ type: "leave_room" }));
copyButton.addEventListener("click", async () => {
  await navigator.clipboard.writeText(copyButton.textContent ?? "");
  const original = copyButton.textContent;
  copyButton.textContent = "SKOPIOWANO";
  window.setTimeout(() => { copyButton.textContent = original; }, 900);
});

chrome.runtime.onMessage.addListener((message: unknown) => {
  if (
    typeof message === "object" && message !== null &&
    "type" in message && message.type === "watchgether_status" &&
    "status" in message
  ) {
    render(message.status as ExtensionStatus);
  }
});

async function runAction(message: PopupMessage): Promise<void> {
  setBusy(true);
  try {
    await sendToContent(message);
  } catch {
    showError("Nie udało się skontaktować z kartą Crunchyroll.");
    setBusy(false);
  }
}

async function sendToContent(message: PopupMessage): Promise<unknown> {
  if (activeTabId === null) throw new Error("No active tab");
  return chrome.tabs.sendMessage(activeTabId, message);
}

async function saveServerUrl(): Promise<string> {
  const value = serverUrlInput.value.trim().replace(/\/$/, "");
  if (!/^wss?:\/\//i.test(value)) throw new Error("Invalid WebSocket URL");
  await chrome.storage.local.set({ serverUrl: value });
  return value;
}

async function saveNickname(): Promise<string | null> {
  const nickname = nicknameInput.value.trim();
  if (nickname.length < 2 || nickname.length > 20) {
    showError("Nick musi mieć od 2 do 20 znaków.");
    nicknameInput.focus();
    return null;
  }
  await chrome.storage.local.set({ nickname });
  return nickname;
}

function render(status: ExtensionStatus): void {
  unsupported.classList.toggle("hidden", status.supported);
  disconnected.classList.toggle("hidden", !status.supported || status.connection === "connected");
  connected.classList.toggle("hidden", status.connection !== "connected");

  playerStatus.textContent = status.playerFound ? "Odtwarzacz gotowy" : "Szukam odtwarzacza…";
  playerStatus.className = `status ${status.playerFound ? "ready" : "warning"}`;
  copyButton.textContent = status.roomCode ?? "";
  participantCount.textContent = `${status.participantCount} z 2 osób`;
  roleDescription.textContent = status.role === "host"
    ? "Jesteś hostem. Zamknięcie karty zakończy pokój."
    : "Sterowanie odtwarzaniem działa w obie strony.";
  participantList.replaceChildren(...status.participants.map((participant) => {
    const chip = document.createElement("span");
    chip.className = `participant-chip${participant.clientId === status.clientId ? " self" : ""}`;
    chip.textContent = participant.clientId === status.clientId
      ? `${participant.nickname} (Ty)`
      : participant.nickname;
    return chip;
  }));
  renderHistory(status.history);
  createButton.disabled = status.connection === "connecting";
  joinButton.disabled = status.connection === "connecting";
  showError(status.error);
}

function renderHistory(history: ActivityEvent[]): void {
  historyPanel.classList.toggle("hidden", history.length === 0);
  historyCount.textContent = `${history.length}/100`;
  historyList.replaceChildren(...[...history].reverse().map((event) => {
    const item = document.createElement("li");
    const time = document.createElement("time");
    time.dateTime = new Date(event.createdAt).toISOString();
    time.textContent = new Intl.DateTimeFormat("pl", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(event.createdAt);

    const description = document.createElement("span");
    const actor = document.createElement("strong");
    actor.textContent = event.nickname;
    const detail = document.createElement("span");
    detail.className = "detail";
    detail.textContent = ` ${activityDescription(event)}`;
    description.append(actor, detail);
    item.append(time, description);
    return item;
  }));
}

function activityDescription(event: ActivityEvent): string {
  switch (event.type) {
    case "participant_joined":
      return "dołączył(a) do pokoju";
    case "participant_left":
      return "opuścił(a) pokój";
    case "playback":
      switch (event.action) {
        case "play": return `wznowił(a) od ${formatTime(event.currentTime)}`;
        case "pause": return `wstrzymał(a) na ${formatTime(event.currentTime)}`;
        case "seek": return `przeskoczył(a) do ${formatTime(event.currentTime)}`;
        case "rate": return `ustawił(a) prędkość ${formatRate(event.playbackRate)}×`;
      }
  }
}

function formatRate(rate: number): string {
  return rate.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function formatTime(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`
    : `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function showError(message: string | null): void {
  error.textContent = message ?? "";
  error.classList.toggle("hidden", !message);
}

function setBusy(busy: boolean): void {
  createButton.disabled = busy;
  joinButton.disabled = busy;
}

function element(id: string): HTMLElement {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing #${id}`);
  return found;
}

function button(id: string): HTMLButtonElement {
  return element(id) as HTMLButtonElement;
}

function input(id: string): HTMLInputElement {
  return element(id) as HTMLInputElement;
}

void initialize();
