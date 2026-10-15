<p align="center">
  <a href="https://chronicleclassic.com/?utm_source=github&amp;utm_medium=referral&amp;utm_campaign=readme&amp;utm_id=chronicle&amp;utm_content=logo">
    <img src="frontend/chronicle/public/c/chronicle/ChronicleLogoCenter.svg" alt="Chronicle" width="320" />
  </a>
</p>

<h3 align="center">Combat log analysis for Classic World of Warcraft</h3>

<p align="center">
  <a href="https://chronicleclassic.com/?utm_source=github&amp;utm_medium=referral&amp;utm_campaign=readme&amp;utm_id=chronicle&amp;utm_content=site_link">chronicleclassic.com</a>
  &nbsp;·&nbsp;
  <a href="https://github.com/sponsors/Emyrk">💖 Sponsor</a>
</p>

---

> [!IMPORTANT]
> **The Chronicle license permits non-commercial hosting, subject to the Self Hosted Requirements.** Every hosted deployment must retain the required Chronicle branding, the linked **Powered by Chronicle** footer mark, and the support banner. Read the [Self Hosted Requirements](https://chronicleclassic.com/self-hosting/) before operating a copy.

Chronicle transforms raid logs into a live, interactive breakdown of everything that happened in your raid.

![Overview](.github/assets/overview.png)

## Features

<!-- screenshot: live playback in action — panels animating with a YouTube video embedded and synced -->

🎬 **Live Playback** — Replay logs in real time with animated meters. Link a YouTube video and it syncs automatically — switch fights and the video seeks to match.

🔍 **Custom Filters** — Filter any panel by ability, school, hit type, source, target, and more. [See it in action →](https://chrn.link/1WyKHE)

<details>
<summary>Filters use boolean `AND/OR/NOT` blocks to filter events</summary>

![Custom Filters](.github/assets/filter.png)

</details>

🔗 **Shareable Links** — Every view is URL-encoded — encounters, filters, layout, time range. Copy the link and anyone sees exactly what you see.

📐 **Customizable Layouts** — Resize, rearrange, and swap panels. Save layouts and share them with your guild.

<details>
<summary>Mainhand vs Offhand damage layout</summary>

![Custom Layout](.github/assets/customlayout.png)

</details>

⏱️ **Time Range Selection** — Drag-select on the timeline to filter every panel to that slice.

<details>
<summary>Time range selection example</summary>

![Time Range](.github/assets/timerange.png)

</details>

🎒 **Loot & Gear** — See what dropped and inspect player gear from the log.

<details>
<summary>Loot</summary>

![Loot](.github/assets/loot.png)

</details>

<details>
<summary>Equipment</summary>

![Equipment](.github/assets/equipment.png)

</details>

⚔️ **Class-Specific Panels** — Sunder Armor uptime, debuff tracking, and more.

---

## Chronicle Uploader (automatic log upload)

The Chronicle Uploader is a small helper that sits in your menu bar (Mac) or system tray (Windows/Linux)
and uploads your World of Warcraft Forever combat log to Chronicle after you play. There is nothing to
configure for most people.

**Setting it up**

1. Start the uploader. A stone with a coloured swirl appears in your menu bar / system tray.
2. If the swirl is yellow, choose **Connect to Chronicle…** and sign in.
3. In game, type `/combatlog` once before you pull. The uploader cannot see your fights until you do.
4. Play. When you quit WoW, the uploader sends your log and shows a notification. Choose **Open last report**
   from the menu to see it.

**What the icon means**

The stone is the app; the colour of its swirl is the state.

| Swirl          | Meaning                                                                    |
| -------------- | -------------------------------------------------------------------------- |
| Grey           | Waiting for WoW                                                            |
| Red            | Not logging yet. Type `/combatlog` in game, then fight something           |
| Orange         | Combat logging is on. Waiting for your first fight                         |
| Green          | Recording your combat log                                                  |
| Blue           | Uploading (if you are offline it keeps trying until you are back)          |
| Green          | Uploaded (the menu line and the notification say "Uploaded")               |
| Yellow         | Not connected to Chronicle (or it needs reconnecting)                      |

**Menu**

- **Upload now** sends your latest log immediately.
- **Choose WoW folder…** is only needed if WoW is installed somewhere unusual. Pick the World of Warcraft
  folder (or the game's own folder, or the WoW app). The uploader looks in the usual places by itself.
- **Also upload when the log goes quiet** uploads after 5 minutes without new combat, instead of only when you quit WoW.
- **Start at login** launches the uploader when you log in to your computer.

**Logs it has already sent**

The uploader keeps a ledger of the logs Chronicle has, so it never sends the same bytes twice. A log is
identified by its contents — the hash of its first 64 KiB, which stays the same as the file grows — and not
by its path, so renaming it, copying it, restoring the archived copy or moving it to another folder does not
make the uploader send it again. Next to each id the ledger records how many bytes reached Chronicle and the
report link, in `logs` in the uploader's `state.json`. A log the ledger already covers is skipped before any
of it is sent: that is not an error, and the menu keeps pointing at the report that exists. A log that has
grown since it was sent goes up again in full, under the same id, and Chronicle replaces the report it
parsed instead of making a second one.

The ledger only knows what this computer uploaded. On a fresh install, after a reset state file, or on a
second PC sharing the same Logs folder, the uploader sends a log it has not seen before and Chronicle tells
it that it already has it — harmless, but it costs the upload. A pre-flight check that would save that round
trip needs an API that can answer "do you have this?" before the body ([#1112](https://github.com/Emyrk/chronicle/issues/1112)).

**Building it**

```bash
# Windows and Linux (no C compiler needed)
CGO_ENABLED=0 go build ./cmd/uploader
# macOS (needs the Xcode command line tools)
go build ./cmd/uploader
```

**Connecting**

Choose **Connect to Chronicle…** from the tray menu. Your browser opens a Chronicle page showing a pairing code;
sign in if needed and press **Approve**. The tray then shows *Connected*, and the uploader keeps a per-device
upload token in your OS keychain. You can revoke the device any time under Settings → Devices, after which the
tray shows *Needs reconnect*. **Disconnect** removes the token from this computer.

`--server` points the uploader at another Chronicle instance, and `--wow-path` sets the WoW folder.
Developers can skip pairing by setting `CHRONICLE_UPLOADER_TOKEN` (hidden `--dev-token` flag).

## Development

### Full Docker Stack

```bash
# Optional: copy defaults before customizing
cp .env.example .env

# Build and start Chronicle, Postgres, SpiceDB, and OCR
docker compose up --build
```

The app will be available at `http://localhost:4000`.

The supporting services stay on the Docker network by default so the stack does not collide with local Postgres, SpiceDB, or OCR processes you may already have running.

To build a different embedded server dataset, override `SERVER`, for example `SERVER=azerothcore docker compose up --build`.

### Local Hybrid Development

```bash
# Start local dependencies first (Postgres on :5433, SpiceDB, OCR)
make services-up

# Full dev server: backend on :4000 with built frontend assets served by Go
make develop

# Backend only: no embedded dist build required, uses slim frontend assets
make develop-backend

# Frontend with hot reload (proxies to backend on :4000)
cd frontend/chronicle
pnpm install
pnpm dev

# Optional: create the chronicle database when using a local Postgres client
make create-db
```

## Tech Stack

| Layer | Technology |
|-------|------------|
| Backend | Go |
| Frontend | React + TypeScript + Vite + Tailwind CSS |
| Database | PostgreSQL |
| Auth | OAuth (Discord) |
