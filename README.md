# ⭐ ChatPins

**ChatPins** is a lightweight browser extension for keeping important ChatGPT conversations organized beyond the native pinned-chat limit.

It adds a dedicated side panel with unlimited saved chats, folders, search, notes, custom titles, sorting, drag-and-drop organization, and JSON backup/restore.

> Created by **Natalia Orlovskaya (NeonaFM)**. First public release: **October 2026**.

## Features

- Save important ChatGPT conversations without relying on native pins.
- Open ChatPins in the browser side panel.
- Save the current chat from the panel or directly from the ChatGPT page.
- Organize chats into color-coded folders.
- Search by chat title, notes, and folder name.
- Rename saved chats without changing the original ChatGPT conversation.
- Add notes to saved chats.
- Reorder chats manually with drag and drop.
- Sort by title or most recently opened.
- Open chats in the current tab or a new tab.
- Export and import the full library as JSON.
- Store the primary library locally and create a backup through `chrome.storage.sync` when browser sync is available.

## Install

### Microsoft Edge

1. Download or clone this repository.
2. Open `edge://extensions/`.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select the repository folder containing `manifest.json`.
6. Optionally pin ChatPins to the browser toolbar.

### Google Chrome

ChatPins uses Manifest V3 and the Side Panel API. Installation is the same through `chrome://extensions/` → **Developer mode** → **Load unpacked**.

Microsoft Edge is the primary target. Modern Chromium browsers with compatible Side Panel support may work as well, but have not all been individually tested.

## Usage

Open a normal ChatGPT conversation whose URL contains `/c/...`.

You can then:

- click **☆ Save chat** on the ChatGPT page;
- or open ChatPins and click **+ Current chat**.

Click a saved card to open it in the current tab. `Ctrl`/`Shift` + click, or the `↗` button, opens it in a new tab.

## Data and privacy

ChatPins does **not** send your saved-chat library to a custom server.

The primary data store is `chrome.storage.local`. ChatPins also attempts to keep a chunked backup in `chrome.storage.sync` when browser synchronization is available. Exported JSON backups are created only when you explicitly export them.

The extension requests access only to the browser features and ChatGPT domains it needs to save and open conversations.

## Supported ChatGPT domains

- `https://chatgpt.com/*`
- `https://chat.openai.com/*`

## Project structure

- `manifest.json` — extension manifest.
- `background.js` — storage, folders, import/export, opening chats, sync backup.
- `content.js` / `content.css` — controls injected into ChatGPT pages.
- `sidepanel.html` / `sidepanel.js` / `sidepanel.css` — ChatPins side-panel interface.

## Version

Current public version: **1.1.0**

See [CHANGELOG.md](CHANGELOG.md) for release notes.

## Author

**Natalia Orlovskaya / NeonaFM**

ChatPins began as a practical solution for managing a large number of long-lived ChatGPT conversations in a workflow where the native pinned-chat list was not enough.

## Disclaimer

ChatPins is an independent community project and is not affiliated with, endorsed by, or sponsored by OpenAI.

ChatGPT and OpenAI are trademarks of their respective owners.

## License

Released under the [MIT License](LICENSE).

---

## 🇷🇺 Коротко по-русски

**ChatPins** — лёгкое расширение для организации важных чатов ChatGPT в отдельной боковой панели браузера.

Что есть в версии 1.1.0:

- сохранение чатов без привязки к штатному лимиту закреплений;
- папки и цветные метки;
- поиск по названиям, заметкам и папкам;
- собственные названия и заметки;
- ручная сортировка перетаскиванием;
- сортировка по названию и последнему открытию;
- экспорт/импорт JSON;
- локальное хранение и резервная копия через синхронизацию браузера.

### Установка в Edge

1. Скачайте или клонируйте репозиторий.
2. Откройте `edge://extensions/`.
3. Включите **Режим разработчика**.
4. Нажмите **Загрузить распакованное расширение**.
5. Выберите папку репозитория, где лежит `manifest.json`.

Автор проекта: **Наталья Орловская / NeonaFM**.
