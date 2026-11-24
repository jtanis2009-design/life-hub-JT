# Life Hub

My all-in-one everyday app. One icon on my phone for travel, workouts and (soon) everything else.

## What's in it

- **Today**: everything at a glance. Weather and when rain is coming, the next bus on my saved trip with live delays, today's workout, and water, protein and caffeine from the Workout app.
- **Travel** (`travel/`): my Traveler app with live departures, delays and the live vehicle map.
- **Workout** (`workout/`): my Workout Log with the plan, sets, food, water, caffeine, coach, strength ranks and cloud sync.
- **Privacy lock**: a PIN when the app opens or comes back after being away (Settings). It keeps people out of the app; it doesn't encrypt the data.
- **Backup**: download every app's data in one file and restore it later (Settings). Logins and the AI key are left out.
- **Coming next**: To-do and reminders, School, Calendar, Habits, Sleep, Countdowns, Shopping and wishlist, Money, Notes, and an AI assistant for everything.

## How it's built

Plain web pages, no build step. Each app lives in its own folder and keeps working on its own. Shared parts:

| File | What it does |
| --- | --- |
| `index.html` | The hub: Today screen, all apps, settings |
| `hub.js` | Loaded by every page: PIN lock and the Home button |
| `sw.js` | One offline cache for the whole hub (network first) |
| `manifest.webmanifest` | Makes it one installable app |

All pages are on the same website, so they share the phone's saved data: `traveler.*` (Travel), `wl_*` (Workout), `hub.*` (hub settings). If the old Traveler and Workout apps ran on `jtanis2009-design.github.io` too, their data is already there when the hub opens.

Live data: [Transitous](https://transitous.org) for trips, [Open-Meteo](https://open-meteo.com) for weather. Neither needs an API key.

## Put it on your phone (GitHub Pages)

1. On GitHub, open this repository's **Settings → Pages**.
2. Under **Build and deployment**, choose **Deploy from a branch**, pick `main` and `/ (root)`, and save.
3. After a minute it's live at `https://jtanis2009-design.github.io/life-hub-jt/`.
4. Open that link in **Chrome on Android** → ⋮ menu → **Install app** / **Add to Home screen**.
