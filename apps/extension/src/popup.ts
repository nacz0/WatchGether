import type { ExtensionStatus, PopupMessage } from "./messages";

const DEFAULT_SERVER_URL = "ws://localhost:8787";

const unsupported = element("unsupported");
const disconnected = element("disconnected");
const connected = element("connected");
const createButton = button("create");
const joinButton = button("join");
const leaveButton = button("leave");
const copyButton = button("copy-code");
const roomCodeInput = input("room-code");
const serverUrlInput = input("server-url");
const playerStatus = element("player-status");
const participantCount = element("participant-count");
const roleDescription = element("role-description");
const error = element("error");

let activeTabId: number | null = null;

async function initialize(): Promise<void> {
  const stored = await chrome.storage.local.get("serverUrl");
  serverUrlInput.value = typeof stored.serverUrl === "string" ? stored.serverUrl : DEFAULT_SERVER_URL;

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
      participantCount: 0,
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
      participantCount: 0,
      error: "Odśwież kartę Crunchyroll po zainstalowaniu rozszerzenia.",
    });
  }
}

createButton.addEventListener("click", async () => {
  await runAction({ type: "create_room", serverUrl: await saveServerUrl() });
});

joinButton.addEventListener("click", async () => {
  const roomCode = roomCodeInput.value.trim().toUpperCase();
  if (!/^[A-Z2-9]{6}$/.test(roomCode)) {
    showError("Wpisz sześciocyfrowy kod pokoju.");
    return;
  }
  await runAction({ type: "join_room", serverUrl: await saveServerUrl(), roomCode });
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
  createButton.disabled = status.connection === "connecting";
  joinButton.disabled = status.connection === "connecting";
  showError(status.error);
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
