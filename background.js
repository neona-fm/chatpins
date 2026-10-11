const LOCAL_KEY = "chatpins_state_v1";
const SYNC_META_KEY = "chatpins_backup_meta_v1";
const SYNC_CHUNK_PREFIX = "chatpins_backup_chunk_v1_";
const MAX_SYNC_CHUNK_BYTES = 7000;

const DEFAULT_STATE = {
  version: 1,
  items: [],
  folders: [],
  settings: {
    sort: "manual"
  },
  meta: {
    updatedAt: 0,
    syncStatus: "never",
    syncMessage: ""
  }
};

chrome.runtime.onInstalled.addListener(async () => {
  try {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  } catch (_) {}
  await ensureState();
});

chrome.runtime.onStartup.addListener(async () => {
  try {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  } catch (_) {}
  await ensureState();
});

async function ensureState() {
  const local = await chrome.storage.local.get(LOCAL_KEY);
  if (local[LOCAL_KEY]) {
    const normalized = normalizeState(local[LOCAL_KEY]);
    await chrome.storage.local.set({ [LOCAL_KEY]: normalized });
    return normalized;
  }

  const restored = await restoreFromSync();
  if (restored) {
    await chrome.storage.local.set({ [LOCAL_KEY]: restored });
    return restored;
  }

  const fresh = structuredClone(DEFAULT_STATE);
  await chrome.storage.local.set({ [LOCAL_KEY]: fresh });
  return fresh;
}

function normalizeState(raw) {
  const state = raw && typeof raw === "object" ? raw : {};
  return {
    version: 1,
    items: Array.isArray(state.items) ? state.items.map(normalizeItem).filter(Boolean) : [],
    folders: Array.isArray(state.folders) ? state.folders.map(normalizeFolder).filter(Boolean) : [],
    settings: {
      sort: ["manual", "recent", "title"].includes(state?.settings?.sort)
        ? state.settings.sort
        : "manual"
    },
    meta: {
      updatedAt: Number(state?.meta?.updatedAt) || 0,
      syncStatus: typeof state?.meta?.syncStatus === "string" ? state.meta.syncStatus : "never",
      syncMessage: typeof state?.meta?.syncMessage === "string" ? state.meta.syncMessage : ""
    }
  };
}

function normalizeItem(item) {
  if (!item || typeof item !== "object" || !item.url) return null;
  return {
    id: String(item.id || crypto.randomUUID()),
    url: String(item.url),
    title: String(item.title || "Без названия"),
    originalTitle: String(item.originalTitle || item.title || "Без названия"),
    note: String(item.note || ""),
    folderId: item.folderId ? String(item.folderId) : null,
    createdAt: Number(item.createdAt) || Date.now(),
    updatedAt: Number(item.updatedAt) || Date.now(),
    lastOpenedAt: Number(item.lastOpenedAt) || 0,
    order: Number.isFinite(Number(item.order)) ? Number(item.order) : 0
  };
}

function normalizeFolder(folder) {
  if (!folder || typeof folder !== "object" || !folder.name) return null;
  return {
    id: String(folder.id || crypto.randomUUID()),
    name: String(folder.name),
    color: /^#[0-9a-f]{6}$/i.test(folder.color || "") ? folder.color : "#7c3aed",
    createdAt: Number(folder.createdAt) || Date.now()
  };
}

async function getState() {
  const data = await chrome.storage.local.get(LOCAL_KEY);
  return normalizeState(data[LOCAL_KEY] || await ensureState());
}

async function saveState(nextState, { backup = true } = {}) {
  const state = normalizeState(nextState);
  state.meta.updatedAt = Date.now();
  await chrome.storage.local.set({ [LOCAL_KEY]: state });

  if (backup) {
    backupToSync(state).catch(() => {});
  }
  return state;
}

function makeChatIdFromUrl(url) {
  try {
    const u = new URL(url);
    const match = u.pathname.match(/\/c\/([^/?#]+)/i);
    if (match) return `chat:${match[1]}`;
    return `url:${u.origin}${u.pathname}${u.search}`;
  } catch (_) {
    return `url:${url}`;
  }
}

function isChatGptUrl(url) {
  try {
    const u = new URL(url);
    return ["chatgpt.com", "www.chatgpt.com", "chat.openai.com"].includes(u.hostname);
  } catch (_) {
    return false;
  }
}

function cleanTitle(title) {
  let t = String(title || "").trim();
  t = t.replace(/\s*[-–—]\s*ChatGPT\s*$/i, "").trim();
  return t || "Без названия";
}

async function saveChat({ url, title }) {
  if (!isChatGptUrl(url)) {
    throw new Error("Открытая страница не относится к ChatGPT.");
  }

  const state = await getState();
  const id = makeChatIdFromUrl(url);
  const existing = state.items.find(item => item.id === id || item.url === url);

  if (existing) {
    existing.originalTitle = cleanTitle(title) || existing.originalTitle;
    if (!existing.title || existing.title === "Без названия") {
      existing.title = existing.originalTitle;
    }
    existing.updatedAt = Date.now();
    await saveState(state);
    return { state, item: existing, existed: true };
  }

  const maxOrder = state.items.reduce((max, item) => Math.max(max, Number(item.order) || 0), -1);
  const item = {
    id,
    url,
    title: cleanTitle(title),
    originalTitle: cleanTitle(title),
    note: "",
    folderId: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    lastOpenedAt: 0,
    order: maxOrder + 1
  };

  state.items.push(item);
  await saveState(state);
  return { state, item, existed: false };
}

async function saveActiveChat() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (!tab?.url || !isChatGptUrl(tab.url)) {
    throw new Error("Сейчас открыт не чат ChatGPT.");
  }
  return saveChat({ url: tab.url, title: tab.title || "Без названия" });
}

async function isSaved(url) {
  const state = await getState();
  const id = makeChatIdFromUrl(url);
  const item = state.items.find(x => x.id === id || x.url === url);
  return { saved: Boolean(item), item: item || null };
}

async function updateItem(payload) {
  const state = await getState();
  const item = state.items.find(x => x.id === payload.id);
  if (!item) throw new Error("Чат не найден.");

  if (typeof payload.title === "string") item.title = payload.title.trim() || item.originalTitle || "Без названия";
  if (typeof payload.note === "string") item.note = payload.note;
  if (payload.folderId === null || typeof payload.folderId === "string") {
    item.folderId = payload.folderId || null;
  }
  item.updatedAt = Date.now();

  await saveState(state);
  return state;
}

async function deleteItem(id) {
  const state = await getState();
  state.items = state.items.filter(x => x.id !== id);
  state.items
    .sort((a, b) => (a.order || 0) - (b.order || 0))
    .forEach((item, index) => item.order = index);
  await saveState(state);
  return state;
}

async function createFolder({ name, color }) {
  const trimmed = String(name || "").trim();
  if (!trimmed) throw new Error("Введите название папки.");

  const state = await getState();
  const folder = {
    id: crypto.randomUUID(),
    name: trimmed,
    color: /^#[0-9a-f]{6}$/i.test(color || "") ? color : "#7c3aed",
    createdAt: Date.now()
  };
  state.folders.push(folder);
  await saveState(state);
  return { state, folder };
}

async function updateFolder(payload) {
  const state = await getState();
  const folder = state.folders.find(x => x.id === payload.id);
  if (!folder) throw new Error("Папка не найдена.");

  if (typeof payload.name === "string" && payload.name.trim()) folder.name = payload.name.trim();
  if (/^#[0-9a-f]{6}$/i.test(payload.color || "")) folder.color = payload.color;

  await saveState(state);
  return state;
}

async function deleteFolder(id) {
  const state = await getState();
  state.folders = state.folders.filter(x => x.id !== id);
  state.items.forEach(item => {
    if (item.folderId === id) item.folderId = null;
  });
  await saveState(state);
  return state;
}

async function reorderItems(ids) {
  const state = await getState();
  const rank = new Map(ids.map((id, index) => [id, index]));
  let next = ids.length;

  state.items
    .sort((a, b) => (a.order || 0) - (b.order || 0))
    .forEach(item => {
      item.order = rank.has(item.id) ? rank.get(item.id) : next++;
    });

  await saveState(state);
  return state;
}

async function setSort(sort) {
  const state = await getState();
  state.settings.sort = ["manual", "recent", "title"].includes(sort) ? sort : "manual";
  await saveState(state);
  return state;
}

async function openChat({ id, newTab }) {
  const state = await getState();
  const item = state.items.find(x => x.id === id);
  if (!item) throw new Error("Чат не найден.");

  item.lastOpenedAt = Date.now();
  await saveState(state);

  if (newTab) {
    await chrome.tabs.create({ url: item.url });
  } else {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];
    if (tab?.id) {
      await chrome.tabs.update(tab.id, { url: item.url });
    } else {
      await chrome.tabs.create({ url: item.url });
    }
  }

  return state;
}

async function importState(raw) {
  const incoming = normalizeState(raw);
  const folderIds = new Set(incoming.folders.map(f => f.id));
  incoming.items.forEach(item => {
    if (item.folderId && !folderIds.has(item.folderId)) item.folderId = null;
  });
  incoming.items
    .sort((a, b) => (a.order || 0) - (b.order || 0))
    .forEach((item, index) => item.order = index);

  return saveState(incoming);
}

function splitUtf8String(str, maxBytes) {
  const chunks = [];
  let current = "";
  let currentBytes = 0;

  for (const char of str) {
    const bytes = new TextEncoder().encode(char).length;
    if (current && currentBytes + bytes > maxBytes) {
      chunks.push(current);
      current = "";
      currentBytes = 0;
    }
    current += char;
    currentBytes += bytes;
  }
  if (current) chunks.push(current);
  return chunks;
}

async function backupToSync(state) {
  const copy = structuredClone(state);
  copy.meta.syncStatus = "ok";
  copy.meta.syncMessage = "";
  const json = JSON.stringify(copy);
  const chunks = splitUtf8String(json, MAX_SYNC_CHUNK_BYTES);

  const old = await chrome.storage.sync.get(SYNC_META_KEY);
  const oldCount = Number(old?.[SYNC_META_KEY]?.chunkCount) || 0;

  const payload = {};
  chunks.forEach((chunk, index) => {
    payload[`${SYNC_CHUNK_PREFIX}${index}`] = chunk;
  });
  payload[SYNC_META_KEY] = {
    version: 1,
    chunkCount: chunks.length,
    updatedAt: Date.now()
  };

  for (let i = chunks.length; i < oldCount; i++) {
    await chrome.storage.sync.remove(`${SYNC_CHUNK_PREFIX}${i}`);
  }

  try {
    await chrome.storage.sync.set(payload);
    const local = await getState();
    local.meta.syncStatus = "ok";
    local.meta.syncMessage = "Резервная копия синхронизирована.";
    await chrome.storage.local.set({ [LOCAL_KEY]: local });
  } catch (error) {
    const local = await getState();
    local.meta.syncStatus = "error";
    local.meta.syncMessage = "Локально всё сохранено; облачная копия не обновилась.";
    await chrome.storage.local.set({ [LOCAL_KEY]: local });
    throw error;
  }
}

async function restoreFromSync() {
  try {
    const metaData = await chrome.storage.sync.get(SYNC_META_KEY);
    const meta = metaData[SYNC_META_KEY];
    const count = Number(meta?.chunkCount) || 0;
    if (!count) return null;

    const keys = Array.from({ length: count }, (_, i) => `${SYNC_CHUNK_PREFIX}${i}`);
    const data = await chrome.storage.sync.get(keys);
    let json = "";
    for (let i = 0; i < count; i++) {
      const chunk = data[`${SYNC_CHUNK_PREFIX}${i}`];
      if (typeof chunk !== "string") return null;
      json += chunk;
    }

    const parsed = JSON.parse(json);
    return normalizeState(parsed);
  } catch (_) {
    return null;
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      let result;
      switch (message?.type) {
        case "get-state":
          result = await getState();
          break;
        case "save-chat":
          result = await saveChat(message.payload || {});
          break;
        case "save-active-chat":
          result = await saveActiveChat();
          break;
        case "is-saved":
          result = await isSaved(message.url || "");
          break;
        case "update-item":
          result = await updateItem(message.payload || {});
          break;
        case "delete-item":
          result = await deleteItem(message.id);
          break;
        case "create-folder":
          result = await createFolder(message.payload || {});
          break;
        case "update-folder":
          result = await updateFolder(message.payload || {});
          break;
        case "delete-folder":
          result = await deleteFolder(message.id);
          break;
        case "reorder-items":
          result = await reorderItems(message.ids || []);
          break;
        case "set-sort":
          result = await setSort(message.sort);
          break;
        case "open-chat":
          result = await openChat(message.payload || {});
          break;
        case "open-side-panel": {
          const windowId = sender?.tab?.windowId;
          if (typeof windowId !== "number") {
            throw new Error("Не удалось определить окно браузера.");
          }
          await chrome.sidePanel.open({ windowId });
          result = true;
          break;
        }
        case "import-state":
          result = await importState(message.state);
          break;
        case "force-backup":
          result = await getState();
          await backupToSync(result);
          result = await getState();
          break;
        default:
          throw new Error("Неизвестная команда расширения.");
      }
      sendResponse({ ok: true, result });
    } catch (error) {
      sendResponse({ ok: false, error: error?.message || String(error) });
    }
  })();
  return true;
});
