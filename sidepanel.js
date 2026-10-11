const els = {
  countText: document.getElementById("countText"),
  saveCurrentBtn: document.getElementById("saveCurrentBtn"),
  searchInput: document.getElementById("searchInput"),
  sortSelect: document.getElementById("sortSelect"),
  foldersBtn: document.getElementById("foldersBtn"),
  moreBtn: document.getElementById("moreBtn"),
  moreMenu: document.getElementById("moreMenu"),
  exportBtn: document.getElementById("exportBtn"),
  importBtn: document.getElementById("importBtn"),
  backupBtn: document.getElementById("backupBtn"),
  importFile: document.getElementById("importFile"),
  folderChips: document.getElementById("folderChips"),
  statusBox: document.getElementById("statusBox"),
  chatList: document.getElementById("chatList"),
  emptyState: document.getElementById("emptyState"),
  editDialog: document.getElementById("editDialog"),
  editForm: document.getElementById("editForm"),
  editTitle: document.getElementById("editTitle"),
  editFolder: document.getElementById("editFolder"),
  editNote: document.getElementById("editNote"),
  deleteChatBtn: document.getElementById("deleteChatBtn"),
  foldersDialog: document.getElementById("foldersDialog"),
  closeFoldersBtn: document.getElementById("closeFoldersBtn"),
  newFolderForm: document.getElementById("newFolderForm"),
  newFolderName: document.getElementById("newFolderName"),
  newFolderColor: document.getElementById("newFolderColor"),
  folderManagerList: document.getElementById("folderManagerList")
};

let state = null;
let activeFolder = "all";
let editingItemId = null;
let draggedId = null;

async function send(message) {
  const response = await chrome.runtime.sendMessage(message);
  if (!response?.ok) throw new Error(response?.error || "Ошибка расширения.");
  return response.result;
}

async function refresh() {
  state = await send({ type: "get-state" });
  render();
}

function render() {
  if (!state) return;
  els.sortSelect.value = state.settings?.sort || "manual";
  renderFolderChips();
  renderChats();
  renderSyncStatus();
}

function renderSyncStatus() {
  const status = state?.meta?.syncStatus;
  const message = state?.meta?.syncMessage || "";
  if (!message || status === "ok") {
    els.statusBox.classList.add("hidden");
    return;
  }
  els.statusBox.textContent = message;
  els.statusBox.classList.remove("hidden");
}

function renderFolderChips() {
  els.folderChips.replaceChildren();

  const allBtn = makeChip("all", "Все", null, state.items.length);
  els.folderChips.appendChild(allBtn);

  for (const folder of state.folders) {
    const count = state.items.filter(item => item.folderId === folder.id).length;
    els.folderChips.appendChild(makeChip(folder.id, folder.name, folder.color, count));
  }

  const noFolderCount = state.items.filter(item => !item.folderId).length;
  if (noFolderCount) {
    els.folderChips.appendChild(makeChip("none", "Без папки", "#71717a", noFolderCount));
  }
}

function makeChip(id, label, color, count) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `folderChip${activeFolder === id ? " active" : ""}`;
  button.dataset.folderId = id;

  if (color) {
    const dot = document.createElement("span");
    dot.className = "folderDot";
    dot.style.background = color;
    button.appendChild(dot);
  }

  const text = document.createElement("span");
  text.textContent = `${label} · ${count}`;
  button.appendChild(text);

  button.addEventListener("click", () => {
    activeFolder = id;
    render();
  });

  if (id !== "all") {
    button.title = id === "none"
      ? "Перетащи сюда чат, чтобы убрать его из папки"
      : `Перетащи сюда чат, чтобы добавить в «${label}»`;

    button.addEventListener("dragover", event => {
      if (!draggedId) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      button.classList.add("dropTarget");
    });

    button.addEventListener("dragleave", () => {
      button.classList.remove("dropTarget");
    });

    button.addEventListener("drop", async event => {
      event.preventDefault();
      button.classList.remove("dropTarget");
      if (!draggedId) return;

      const itemId = draggedId;
      const folderId = id === "none" ? null : id;

      try {
        state = await send({
          type: "update-item",
          payload: { id: itemId, folderId }
        });
        render();
        showStatus(id === "none" ? "Чат убран из папки." : `Чат перемещён в «${label}».`);
      } catch (error) {
        showStatus(error.message);
      }
    });
  }

  return button;
}

function getVisibleItems() {
  const q = els.searchInput.value.trim().toLocaleLowerCase("ru");

  let items = state.items.filter(item => {
    if (activeFolder === "none" && item.folderId) return false;
    if (activeFolder !== "all" && activeFolder !== "none" && item.folderId !== activeFolder) return false;

    if (!q) return true;
    const folder = state.folders.find(f => f.id === item.folderId);
    const haystack = [
      item.title,
      item.originalTitle,
      item.note,
      folder?.name || ""
    ].join("\n").toLocaleLowerCase("ru");
    return haystack.includes(q);
  });

  const sort = state.settings?.sort || "manual";
  if (sort === "recent") {
    items = [...items].sort((a, b) =>
      (b.lastOpenedAt || b.updatedAt || b.createdAt || 0) -
      (a.lastOpenedAt || a.updatedAt || a.createdAt || 0)
    );
  } else if (sort === "title") {
    items = [...items].sort((a, b) =>
      a.title.localeCompare(b.title, "ru", { sensitivity: "base" })
    );
  } else {
    items = [...items].sort((a, b) => (a.order || 0) - (b.order || 0));
  }

  return items;
}

function renderChats() {
  els.chatList.replaceChildren();

  const items = getVisibleItems();
  const total = state.items.length;
  els.countText.textContent = total
    ? `${total} ${plural(total, "чат", "чата", "чатов")}`
    : "Ни одного сохранённого чата";

  const searching = Boolean(els.searchInput.value.trim());
  const filtered = activeFolder !== "all" || searching;
  const manualDrag = (state.settings?.sort || "manual") === "manual" && !filtered;

  els.emptyState.classList.toggle("hidden", items.length > 0);
  if (!items.length && total > 0) {
    els.emptyState.querySelector("h2").textContent = "Ничего не нашлось";
    els.emptyState.querySelector("p").textContent = "Попробуй другой запрос или выбери другую папку.";
  } else {
    els.emptyState.querySelector("h2").textContent = "Пока пусто";
    els.emptyState.querySelector("p").textContent = "Открой нужный чат ChatGPT и нажми «+ Текущий чат» или кнопку «Сохранить чат» прямо на странице.";
  }

  for (const item of items) {
    els.chatList.appendChild(makeChatCard(item, manualDrag));
  }
}

function makeChatCard(item, allowReorder) {
  const folder = state.folders.find(f => f.id === item.folderId);

  const card = document.createElement("article");
  card.className = "chatCard";
  card.dataset.id = item.id;
  card.draggable = true;

  const handle = document.createElement("div");
  handle.className = "dragHandle";
  handle.textContent = "⋮⋮";
  handle.title = allowReorder
    ? "Перетащи для сортировки или брось на папку"
    : "Перетащи чат на нужную папку";

  const main = document.createElement("div");
  main.className = "chatMain";
  main.title = "Открыть чат";

  const title = document.createElement("h3");
  title.className = "chatTitle";
  title.textContent = item.title;

  const meta = document.createElement("div");
  meta.className = "chatMeta";

  if (folder) {
    const badge = document.createElement("span");
    badge.className = "folderBadge";

    const dot = document.createElement("span");
    dot.className = "folderDot";
    dot.style.background = folder.color;

    const label = document.createElement("span");
    label.textContent = folder.name;

    badge.append(dot, label);
    meta.appendChild(badge);
  }

  const date = document.createElement("span");
  const timestamp = item.lastOpenedAt || item.createdAt;
  date.textContent = item.lastOpenedAt
    ? `Открыт ${formatDate(timestamp)}`
    : `Добавлен ${formatDate(timestamp)}`;
  meta.appendChild(date);

  main.append(title, meta);

  if (item.note) {
    const note = document.createElement("div");
    note.className = "notePreview";
    note.textContent = item.note;
    main.appendChild(note);
  }

  main.addEventListener("click", event => {
    openChat(item.id, event.ctrlKey || event.metaKey || event.shiftKey);
  });

  const actions = document.createElement("div");
  actions.className = "cardActions";

  const editBtn = document.createElement("button");
  editBtn.type = "button";
  editBtn.textContent = "✎";
  editBtn.title = "Название, папка и заметка";
  editBtn.addEventListener("click", () => openEdit(item.id));

  const newTabBtn = document.createElement("button");
  newTabBtn.type = "button";
  newTabBtn.textContent = "↗";
  newTabBtn.title = "Открыть в новой вкладке";
  newTabBtn.addEventListener("click", () => openChat(item.id, true));

  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.textContent = "×";
  deleteBtn.className = "quickDeleteBtn";
  deleteBtn.title = "Удалить из ChatPins";
  deleteBtn.addEventListener("click", async event => {
    event.stopPropagation();
    try {
      state = await send({ type: "delete-item", id: item.id });
      render();
      showStatus("Чат удалён из ChatPins. Сам чат ChatGPT остался на месте.");
    } catch (error) {
      showStatus(error.message);
    }
  });

  actions.append(editBtn, newTabBtn, deleteBtn);
  card.append(handle, main, actions);

  card.addEventListener("dragstart", event => {
    draggedId = item.id;
    card.classList.add("dragging");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", item.id);
  });

  card.addEventListener("dragend", () => {
    draggedId = null;
    card.classList.remove("dragging");
    els.folderChips.querySelectorAll(".dropTarget").forEach(el => el.classList.remove("dropTarget"));
  });

  if (allowReorder) {
    card.addEventListener("dragover", event => {
      event.preventDefault();
      const dragging = els.chatList.querySelector(".dragging");
      if (!dragging || dragging === card) return;

      const rect = card.getBoundingClientRect();
      const before = event.clientY < rect.top + rect.height / 2;
      els.chatList.insertBefore(dragging, before ? card : card.nextSibling);
    });

    card.addEventListener("drop", async event => {
      event.preventDefault();
      const ids = [...els.chatList.querySelectorAll(".chatCard")].map(el => el.dataset.id);
      try {
        state = await send({ type: "reorder-items", ids });
        render();
      } catch (error) {
        showStatus(error.message);
      }
    });
  }

  return card;
}

async function openChat(id, newTab) {
  try {
    state = await send({
      type: "open-chat",
      payload: { id, newTab: Boolean(newTab) }
    });
    render();
  } catch (error) {
    showStatus(error.message);
  }
}

function openEdit(id) {
  const item = state.items.find(x => x.id === id);
  if (!item) return;

  editingItemId = id;
  els.editTitle.value = item.title;
  els.editNote.value = item.note || "";

  els.editFolder.replaceChildren();
  const none = document.createElement("option");
  none.value = "";
  none.textContent = "Без папки";
  els.editFolder.appendChild(none);

  for (const folder of state.folders) {
    const option = document.createElement("option");
    option.value = folder.id;
    option.textContent = folder.name;
    els.editFolder.appendChild(option);
  }

  els.editFolder.value = item.folderId || "";
  els.editDialog.showModal();
}

function renderFolderManager() {
  els.folderManagerList.replaceChildren();

  if (!state.folders.length) {
    const empty = document.createElement("div");
    empty.className = "folderManagerEmpty";
    empty.textContent = "Папок пока нет. Добавь первую сверху.";
    els.folderManagerList.appendChild(empty);
    return;
  }

  for (const folder of state.folders) {
    const row = document.createElement("div");
    row.className = "folderManagerItem";

    const color = document.createElement("input");
    color.type = "color";
    color.value = folder.color;

    const name = document.createElement("input");
    name.type = "text";
    name.value = folder.name;
    name.maxLength = 80;

    const del = document.createElement("button");
    del.type = "button";
    del.textContent = "×";
    del.title = "Удалить папку";

    const saveChanges = async () => {
      try {
        state = await send({
          type: "update-folder",
          payload: {
            id: folder.id,
            name: name.value,
            color: color.value
          }
        });
        render();
      } catch (error) {
        showStatus(error.message);
      }
    };

    name.addEventListener("change", saveChanges);
    color.addEventListener("change", saveChanges);

    del.addEventListener("click", async () => {
      if (!confirm(`Удалить папку «${folder.name}»? Чаты останутся и перейдут в «Без папки».`)) return;
      try {
        state = await send({ type: "delete-folder", id: folder.id });
        if (activeFolder === folder.id) activeFolder = "all";
        renderFolderManager();
        render();
      } catch (error) {
        showStatus(error.message);
      }
    });

    row.append(color, name, del);
    els.folderManagerList.appendChild(row);
  }
}

function exportJson() {
  const exportState = structuredClone(state);
  const blob = new Blob([JSON.stringify(exportState, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `chatpins-backup-${stamp}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

async function importJson(file) {
  const text = await file.text();
  const parsed = JSON.parse(text);

  if (!parsed || !Array.isArray(parsed.items) || !Array.isArray(parsed.folders)) {
    throw new Error("Это не похоже на резервную копию ChatPins.");
  }

  if (!confirm(`Импорт заменит текущий список (${state.items.length} чатов) содержимым файла. Продолжить?`)) {
    return;
  }

  state = await send({ type: "import-state", state: parsed });
  activeFolder = "all";
  els.searchInput.value = "";
  render();
}

function showStatus(message) {
  els.statusBox.textContent = message;
  els.statusBox.classList.remove("hidden");
  setTimeout(() => {
    if (els.statusBox.textContent === message) {
      els.statusBox.classList.add("hidden");
    }
  }, 3500);
}

function formatDate(ts) {
  if (!ts) return "—";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit"
  }).format(new Date(ts));
}

function plural(n, one, few, many) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

els.saveCurrentBtn.addEventListener("click", async () => {
  const old = els.saveCurrentBtn.textContent;
  els.saveCurrentBtn.disabled = true;
  els.saveCurrentBtn.textContent = "Сохраняю…";
  try {
    const result = await send({ type: "save-active-chat" });
    state = result.state;
    render();
    showStatus(result.existed ? "Этот чат уже был сохранён." : "Чат сохранён ⭐");
  } catch (error) {
    showStatus(error.message);
  } finally {
    els.saveCurrentBtn.disabled = false;
    els.saveCurrentBtn.textContent = old;
  }
});

els.searchInput.addEventListener("input", renderChats);

els.sortSelect.addEventListener("change", async () => {
  try {
    state = await send({ type: "set-sort", sort: els.sortSelect.value });
    render();
  } catch (error) {
    showStatus(error.message);
  }
});

els.foldersBtn.addEventListener("click", () => {
  renderFolderManager();
  els.foldersDialog.showModal();
});

els.closeFoldersBtn.addEventListener("click", () => els.foldersDialog.close());

els.moreBtn.addEventListener("click", () => {
  els.moreMenu.classList.toggle("hidden");
});

document.addEventListener("click", event => {
  if (
    !els.moreMenu.classList.contains("hidden") &&
    !els.moreMenu.contains(event.target) &&
    event.target !== els.moreBtn
  ) {
    els.moreMenu.classList.add("hidden");
  }
});

els.exportBtn.addEventListener("click", () => {
  els.moreMenu.classList.add("hidden");
  exportJson();
});

els.importBtn.addEventListener("click", () => {
  els.moreMenu.classList.add("hidden");
  els.importFile.click();
});

els.importFile.addEventListener("change", async () => {
  const file = els.importFile.files?.[0];
  els.importFile.value = "";
  if (!file) return;

  try {
    await importJson(file);
    showStatus("Резервная копия импортирована.");
  } catch (error) {
    showStatus(error.message);
  }
});

els.backupBtn.addEventListener("click", async () => {
  els.moreMenu.classList.add("hidden");
  try {
    state = await send({ type: "force-backup" });
    render();
    showStatus(state.meta?.syncStatus === "ok"
      ? "Облачная резервная копия обновлена."
      : (state.meta?.syncMessage || "Локальная копия сохранена.")
    );
  } catch (error) {
    showStatus(error.message);
  }
});

els.editForm.addEventListener("submit", async event => {
  event.preventDefault();
  if (!editingItemId) return;

  try {
    state = await send({
      type: "update-item",
      payload: {
        id: editingItemId,
        title: els.editTitle.value,
        note: els.editNote.value,
        folderId: els.editFolder.value || null
      }
    });
    els.editDialog.close();
    editingItemId = null;
    render();
  } catch (error) {
    showStatus(error.message);
  }
});

els.deleteChatBtn.addEventListener("click", async () => {
  if (!editingItemId) return;
  const item = state.items.find(x => x.id === editingItemId);
  if (!item) return;
  if (!confirm(`Удалить «${item.title}» из ChatPins? Сам чат ChatGPT останется на месте.`)) return;

  try {
    state = await send({ type: "delete-item", id: editingItemId });
    els.editDialog.close();
    editingItemId = null;
    render();
  } catch (error) {
    showStatus(error.message);
  }
});

els.newFolderForm.addEventListener("submit", async event => {
  event.preventDefault();
  try {
    const result = await send({
      type: "create-folder",
      payload: {
        name: els.newFolderName.value,
        color: els.newFolderColor.value
      }
    });
    state = result.state;
    els.newFolderName.value = "";
    renderFolderManager();
    render();
  } catch (error) {
    showStatus(error.message);
  }
});

refresh().catch(error => showStatus(error.message));
