<p align="center">
  <a href="http://chronicleclassic.com/">
    <img src="frontend/chronicle/public/c/chronicle/ChronicleLogoCenter.svg" alt="Chronicle" width="320" />
  </a>
</p>

<h3 align="center">Combat log analysis for Classic World of Warcraft</h3>

<p align="center">
  <a href="http://chronicleclassic.com/">chronicleclassic.com</a>
  &nbsp;·&nbsp;
  <a href="https://github.com/sponsors/Emyrk">💖 Sponsor</a>
</p>

---

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

## Development

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
