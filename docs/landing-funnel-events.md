# Landing funnel events

The `/start` ad landing → `/download` → Sidekick pairing → first upload funnel.
These events give the three ratios that judge an ad push:

| Ratio | Definition | Source |
| --- | --- | --- |
| Watch rate | `hero_play_3s` / `land` | GA4 |
| Install intent | `cta_sidekick` / `land`, per `utm_content` | GA4 |
| Loop close | `first_upload` / `download_start` | Postgres / GA4 |

No event carries PII: no user, account, installation or log ids, no names,
emails or IPs. The only params are the ones listed below.

## Frontend (GA4, via gtag.js)

Sent by `trackFunnel` (`frontend/chronicle/src/utils/funnel.ts`). Nothing is
sent when no GA4 measurement ID is configured, because index.html then does not
load gtag.js.

Every frontend event also carries the visitor's campaign: each `utm_*` param
(`utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`) that is
on the current URL, or else stored in the `chronicle_utm` cookie set on landing
(`frontend/chronicle/src/utils/utm.ts`). A param that has no value is left out.

| Event | When | Params |
| --- | --- | --- |
| `land` | `/start` is opened (once per visit to the page). | utm only |
| `hero_play_3s` | Once per page view: the 3D hero has rendered and played for 3 s without a break while on screen in a visible tab, or, when 3D is suppressed (reduced motion, data saver, no WebGL2, or no featured run), the poster was on screen for 3 s once the featured run lookup has finished. | `mode`: `3d` or `poster` |
| `scrub_or_bossjump` | The first use of the hero scrubber's controls in a page view (a click, a drag on the bar, or Space while the scrubber has focus). | `control`: `play_pause` (the button or Space), `boss_jump` (a boss chip), `drag` (dragging the bar), `death_jump` (a death dot) |
| `cta_sidekick` | Any Get Sidekick / Download click on `/start`, or Get yours / Get Sidekick in the run page's Sidekick strip. | `placement`: `nav` (top bar), `hero` (hero button), `band` (closing download band), `ghost_card` ("Your run goes here" card), `koth` (King of the Hill "Get your guild on the board"), `run_strip` (run page Sidekick strip) |
| `explore_3d_open` | The Explore in 3D modal opens on `/start`. | `placement`: `hero` (the button by the hero scrubber), `hero_chip` (the "Live 3D · explore" chip on the hero stage), `recent` (a recent run card), `koth` (King of the Hill "Watch the record in 3D") |
| `explore_3d_full_run` | "Open the full run →" is clicked in the Explore in 3D modal. | `placement`: where the modal was opened from, as for `explore_3d_open` |
| `meter_drill` | A bar on the glass meter's Damage Done or Healing Done pane is clicked, drilling into that player's ability breakout (sent on every drill-in). | `pane`: `damage_done` or `healing_done`; `placement`: `hero` (the hero's stats column), `strip` (the meter strip under the replay below 900 px), `explore` (the Explore in 3D modal's meter) |
| `download_start` | A Sidekick asset link is clicked on `/download` (the main button or the "Also for" links). | `os`: `macos`, `windows` or `linux` |

If the 3D hero fails to load, the poster stays up but `hero_play_3s` is not sent.
The event only counts a replay that plays or a poster shown because 3D is
suppressed.

To break these down in GA4 explorations, register `utm_content`, `placement`,
`mode`, `control`, `pane` and `os` as event-scoped custom dimensions (Admin → Custom
definitions). GA4 only fills a custom dimension for events sent after it is
registered.

## Backend (structured logs)

The backend has no analytics sink, so these are info log lines with the message
`funnel event` and an `event` attribute. Search the service logs for
`funnel event`.

| Event | When | Params |
| --- | --- | --- |
| `pair_complete` | A signed-in user approves a Sidekick device code on `/oauth/device` (`internal/services/serviceoauth`). | The pairing browser's `utm_*` params from the `chronicle_utm` cookie, if present |
| `first_upload` | A Sidekick upload makes the account's first log group from any Sidekick installation (`internal/services/servicesidekick` `RecordUpload`). | The uploading installation's stored `utm_*` params, if any |

## The three ratios

GA4 counts the frontend events. Postgres counts first uploads:
`wow_log_groups.sidekick_installation_id` has been recorded since #1313, so the
account's first Sidekick log group is its `first_upload`. The campaign comes
from `sidekick_installations.utm_*`, written once when the installation is first
approved with a `chronicle_utm` cookie and never overwritten (#1319). Paste the
GA4 event totals for the same window, per `utm_content`, into the `ga` CTE
(Explore → Free form: rows `utm_content`, columns `Event name`, values `Event
count`, filtered to the four events):

```sql
WITH params AS (
  SELECT timestamptz '2026-10-01' AS since, timestamptz '2026-11-01' AS until
),
-- GA4 event totals for the same window, per utm_content (pasted from the exploration).
ga (utm_content, land, hero_play_3s, cta_sidekick, download_start) AS (
  VALUES ('hero-a', 1000, 640, 120, 80),
         ('hero-b', 900, 510, 70, 50)
),
-- Each account's first Sidekick log group, with the campaign of the
-- installation that uploaded it ('(not set)' without one, as in GA4).
firsts AS (
  SELECT DISTINCT ON (si.user_id)
         g.created_at AS first_at,
         COALESCE(si.utm_content, '(not set)') AS utm_content
  FROM wow_log_groups g
  JOIN sidekick_installations si ON si.id = g.sidekick_installation_id
  ORDER BY si.user_id, g.created_at
),
-- First uploads that arrived in the window, per utm_content.
first_uploads AS (
  SELECT f.utm_content, COUNT(*) AS n
  FROM firsts f, params p
  WHERE f.first_at >= p.since AND f.first_at < p.until
  GROUP BY f.utm_content
)
SELECT ga.utm_content,
       round(hero_play_3s::numeric / NULLIF(land, 0), 3) AS watch_rate,
       round(cta_sidekick::numeric / NULLIF(land, 0), 3) AS install_intent,
       round(COALESCE(fu.n, 0)::numeric / NULLIF(download_start, 0), 3) AS loop_close
FROM ga
LEFT JOIN first_uploads fu ON fu.utm_content = ga.utm_content
UNION ALL
SELECT 'all',
       round(sum(hero_play_3s)::numeric / NULLIF(sum(land), 0), 3),
       round(sum(cta_sidekick)::numeric / NULLIF(sum(land), 0), 3),
       round((SELECT COALESCE(sum(n), 0) FROM first_uploads)::numeric / NULLIF(sum(download_start), 0), 3)
FROM ga;
```

`loop_close` per `utm_content` only counts installations approved after #1319
shipped; older installations have no stored campaign and fall under
`(not set)`, which only shows up in the `all` row unless `ga` has a
`(not set)` row too. The campaign is the pairing browser's, so an install
paired from a different browser than the one that saw the ad is `(not set)`.
A Sidekick log group whose installation was deleted no longer counts, because
`sidekick_installation_id` is set to NULL on delete.
