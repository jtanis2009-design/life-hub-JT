# Life Hub

My all-in-one everyday app. One icon on my phone for travel, workouts and (soon) everything else.

## What's in it

- **Today**: everything at a glance. Weather and rain, the next bus with live delays, today's workout, today's plan (lessons, events, homework, to-dos), and tiles for to-dos, habits, countdowns, sleep, money, shopping, water, protein and caffeine.
- **Travel** (`travel/`): live departures, delays and the live vehicle map.
- **Workout** (`workout/`): plan, sets, food, water, caffeine, coach, strength ranks and cloud sync.
- **To-do** (`todo/`): quick add that understands dates and times ("gym bag tomorrow 7am #gym !!", Dutch too), lists, steps, repeats, reminders.
- **School** (`school/`): weekly timetable with the next lesson, homework and tests with reminders, grades with averages and a "what do I need on the next test" calculator, holidays.
- **Calendar** (`calendar/`): events, birthdays, lessons, homework, to-dos, workouts and countdowns together.
- **Habits** (`habits/`): streaks, heatmap, weekly goals, habits that tick themselves (gym, water, protein, sleep, to-dos, homework).
- **Countdowns** (`countdowns/`): days left, live timer, school days to go.
- **Sleep** (`sleep/`): one-tap bedtime and wake-up, sleep debt, 14-night chart, bedtime worked out from your first lesson, caffeine warning.
- **Shopping** (`shopping/`): groceries sorted by aisle automatically, plus a wishlist with savings progress.
- **Notes** (`notes/`): notes with pins, tags, checklists and search, plus a daily journal with a mood chart.
- **Money** (`money/`): quick add ("5,50 kebab", "+20 pocket money"), categories, monthly budgets, savings goals, subscriptions with reminders, and **bank import**: import your transactions file from ING, Rabobank, ABN AMRO, bunq (or most other Dutch banks), or a Rabobank **PDF statement** (Rekeningafschrift), also straight from WhatsApp or Gmail via Share. Shops get the right category (and remember your corrections), payments already in Life Hub are skipped, and moves to your own savings are left out.
- **Receipts** (Money → Receipts): keep PDFs, photos of paper receipts and links to online orders, linked to the payment, with warranty dates. Share a PDF or screenshot from any Android app to **Life Hub** to save it.
- **Money Coach** (`adviser/`): tips worked out from your own payments (savings rate, small buys, repeating payments, busiest day, goals), budgets from your averages, and an AI coach that only gets a summary of your numbers.
- **Anime** (`anime/`): watch list with MyAnimeList search (covers, episodes, airing day in your time), +1 episode, scores, new-episode reminders, stats.
- **Alarms** (`alarm/`): normal and school alarms (follow your first lesson), night mode that keeps the screen on and rings loudly, snooze, sleep tracking, and a button to copy an alarm into the phone's Clock app.
- **Music** (`music/`): now playing, minutes listened, top 5 songs this week with play counts and top artists, through Last.fm (free) or Spotify directly (needs Premium).
- **Clothes** (`clothes/`): wardrobe with photos, daily outfit log, outfit suggestions from the weather, laundry, cost per wear, forgotten clothes.
- **Shaving** (`shaving/`): days since and next shave per area, blade use, spare blades to the shopping list, skin tips, reminders.
- **Privacy lock**: a PIN for the whole app, with an extra lock on Notes and Money.
- **Backup**: one file with everything, restore it any time. Logins and the AI key are left out.
- **Reminders**: phone notifications for to-dos, homework, tests, events, birthdays, habits, bedtime and subscriptions while Life Hub is open or in the background.
- **Coming next**: the AI assistant for everything, automatic bank sync, cloud sync for every app, and reminders when the app is fully closed.

## How it's built

Plain web pages, no build step. Each app lives in its own folder and keeps working on its own. Shared parts:

| File | What it does |
| --- | --- |
| `index.html` | The hub: Today screen, all apps, settings |
| `hub.js` | Loaded by every page: PIN lock and the Home button |
| `lib/kit.css`, `lib/kit.js` | Shared look, saving, forms, dates and the quick-add parser |
| `lib/agenda.js` | Every app's data, the combined day agenda and the reminder engine |
| `lib/files.js` | Receipt files stored on the phone (IndexedDB) |
| `lib/ai.js` | Gemini AI with the key from the Workout app |
| `lib/bankimport.js` | Reads bank transaction files (ING, Rabobank, ABN AMRO, bunq and others) |
| `sw.js` | One offline cache for the whole hub (network first) |
| `manifest.webmanifest` | Makes it one installable app |

All pages are on the same website, so they share the phone's saved data: `traveler.*` (Travel), `wl_*` (Workout), `hub.*` (the hub and all its own apps). If the old Traveler and Workout apps ran on `jtanis2009-design.github.io` too, their data is already there when the hub opens.

Live data: [Transitous](https://transitous.org) for trips, [Open-Meteo](https://open-meteo.com) for weather. Neither needs an API key.

## Put it on your phone (GitHub Pages)

1. On GitHub, open this repository's **Settings → Pages**.
2. Under **Build and deployment**, choose **Deploy from a branch**, pick `main` and `/ (root)`, and save.
3. After a minute it's live at `https://jtanis2009-design.github.io/life-hub-JT/`.
4. Open that link in **Chrome on Android** → ⋮ menu → **Install app** / **Add to Home screen**.
