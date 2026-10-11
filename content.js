(() => {
  let lastUrl = "";
  let saved = false;
  let controls = null;
  let saveButton = null;
  let openButton = null;
  let toastTimer = null;

  function isConversationUrl(url) {
    try {
      const u = new URL(url);
      return /\/c\/[^/?#]+/i.test(u.pathname);
    } catch (_) {
      return false;
    }
  }

  function getPageTitle() {
    const title = (document.title || "").replace(/\s*[-–—]\s*ChatGPT\s*$/i, "").trim();
    return title || "Без названия";
  }

  function ensureControls() {
    if (controls?.isConnected) return controls;

    controls = document.createElement("div");
    controls.id = "chatpins-floating-controls";

    saveButton = document.createElement("button");
    saveButton.id = "chatpins-save-button";
    saveButton.type = "button";
    saveButton.setAttribute("aria-label", "Сохранить текущий чат в ChatPins");
    saveButton.addEventListener("click", saveCurrentChat);

    openButton = document.createElement("button");
    openButton.id = "chatpins-open-button";
    openButton.type = "button";
    openButton.textContent = "☰";
    openButton.title = "Открыть ChatPins";
    openButton.setAttribute("aria-label", "Открыть список ChatPins");
    openButton.addEventListener("click", openSidePanel);

    controls.append(saveButton, openButton);
    document.documentElement.appendChild(controls);
    return controls;
  }

  function updateButton() {
    if (!saveButton) return;
    saveButton.dataset.saved = String(saved);
    saveButton.textContent = saved ? "★ Сохранён в ChatPins" : "☆ Сохранить чат";
    saveButton.title = saved
      ? "Этот чат уже есть в ChatPins"
      : "Добавить текущий чат в ChatPins";
  }

  function showToast(text) {
    let toast = document.getElementById("chatpins-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "chatpins-toast";
      document.documentElement.appendChild(toast);
    }

    toast.textContent = text;
    toast.dataset.show = "true";
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.dataset.show = "false";
    }, 2200);
  }

  async function checkSaved() {
    if (!isConversationUrl(location.href)) {
      controls?.remove();
      controls = null;
      saveButton = null;
      openButton = null;
      return;
    }

    ensureControls();
    try {
      const response = await chrome.runtime.sendMessage({
        type: "is-saved",
        url: location.href
      });
      saved = Boolean(response?.ok && response.result?.saved);
    } catch (_) {
      saved = false;
    }
    updateButton();
  }

  async function saveCurrentChat() {
    if (!saveButton || saveButton.dataset.busy === "true") return;

    if (saved) {
      showToast("Этот чат уже сохранён.");
      return;
    }

    saveButton.dataset.busy = "true";
    saveButton.textContent = "Сохраняю…";

    try {
      const response = await chrome.runtime.sendMessage({
        type: "save-chat",
        payload: {
          url: location.href,
          title: getPageTitle()
        }
      });

      if (!response?.ok) throw new Error(response?.error || "Не удалось сохранить чат.");
      saved = true;
      updateButton();
      showToast("Чат добавлен в ChatPins ⭐");
    } catch (error) {
      showToast(error?.message || "Не удалось сохранить чат.");
    } finally {
      saveButton.dataset.busy = "false";
    }
  }

  async function openSidePanel() {
    if (!openButton || openButton.dataset.busy === "true") return;
    openButton.dataset.busy = "true";
    try {
      const response = await chrome.runtime.sendMessage({ type: "open-side-panel" });
      if (!response?.ok) throw new Error(response?.error || "Не удалось открыть ChatPins.");
    } catch (error) {
      showToast(error?.message || "Не удалось открыть ChatPins.");
    } finally {
      openButton.dataset.busy = "false";
    }
  }

  async function onUrlMaybeChanged() {
    const current = location.href;
    if (current === lastUrl) return;
    lastUrl = current;
    saved = false;
    await checkSaved();
  }

  onUrlMaybeChanged();
  setInterval(onUrlMaybeChanged, 700);

  const titleObserver = new MutationObserver(() => {
    if (saveButton && !saved) {
      saveButton.title = `Сохранить: ${getPageTitle()}`;
    }
  });
  const titleNode = document.querySelector("title");
  if (titleNode) titleObserver.observe(titleNode, { childList: true });
})();
