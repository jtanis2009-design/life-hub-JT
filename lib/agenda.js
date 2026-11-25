/* Life Hub: everything that happens on a day, from every app, plus the reminder engine.
   Used by Calendar, the Today screen and each app. Needs kit.js first. */
(function () {
  const K = window.K;

  /* ---------- data from each app ---------- */
  K.tasks = K.coll('tasks');
  K.homework = K.coll('homework');
  K.grades = K.coll('grades');
  K.events = K.coll('events');
  K.habits = K.coll('habits');
  K.countdowns = K.coll('countdowns');
  K.sleepLog = K.coll('sleep');
  K.notes = K.coll('notes');
  K.money = K.coll('money');
  K.savings = K.coll('savings');
  K.subs = K.coll('subscriptions');
  K.shop = K.coll('shopping');
  K.wish = K.coll('wishlist');
  K.anime = K.coll('anime');
  K.animeAirsToday = a => a.airing && a.airDay != null && +a.airDay === new Date().getDay() && a.status === 'watching';
  K.shaveCfg = () => Object.assign({ areas: ['Face'], every: { Face: 3 }, bladeLife: 6, bladeSince: '', bladesLeft: '', remindAt: '' }, K.get('shavecfg', {}) || {});
  K.shaveDue = () => { const c = K.shaveCfg(), log = K.coll('shave').all().sort((a, b) => a.date < b.date ? 1 : -1);
    return c.areas.filter(a => { const l = log.find(e => (e.areas || []).includes(a)); return l && -K.daysUntil(l.date) >= +(c.every[a] || 3); }); };
  K.alarms = K.coll('alarms');
  /* the alarm's time on a day ("HH:MM") or null when it doesn't ring that day */
  K.alarmTime = (a, s) => {
    if (a.smart) {
      const first = K.lessonsOn(s)[0];
      if (!first) return a.time || null;
      const mp = K.morningPlan(s); if (mp && mp.wake) return mp.wake;     /* from the real bus times */
      const [h, m] = first.start.split(':').map(Number), t = h * 60 + m - (+K.sleepCfg().wakeBefore || 75);
      return t > 0 ? K.pad(Math.floor(t / 60)) + ':' + K.pad(t % 60) : null;
    }
    if (a.days && a.days.length) return a.days.includes(K.fromYmd(s).getDay()) ? a.time : null;
    return a.once === s ? a.time : null;
  };
  K.alarmNextOnce = t => (t > K.hm(new Date()) ? K.ymd() : K.addDays(K.ymd(), 1));
  K.nextAlarm = (from = Date.now()) => {
    let best = null;
    for (const a of K.alarms.all()) if (a.on) for (let i = 0; i < 8; i++) {
      const s = K.addDays(K.ymd(), i), t = K.alarmTime(a, s); if (!t) continue;
      const [h, m] = t.split(':').map(Number), d = K.fromYmd(s); d.setHours(h, m, 0, 0);
      if (d.getTime() > from && (!best || d.getTime() < best.at)) best = { a, at: d.getTime(), key: a.id + ':' + s };
      if (d.getTime() > from) break;
    }
    return best;
  };
  K.sleepCfg = () => Object.assign({ goal: 8.5, wakeBefore: 75, remind: false }, K.get('sleepcfg', {}) || {});
  /* minutes asleep for one log entry (bed and wake are full ISO-like local times "YYYY-MM-DDTHH:MM") */
  K.sleepMins = e => { const m = Math.round((new Date(e.wake) - new Date(e.bed)) / 60000); return isFinite(m) && m > 0 ? m : 0; };
  K.lastSleep = () => K.sleepLog.all().filter(e => e.bed && e.wake && K.sleepMins(e)).sort((a, b) => a.wake < b.wake ? 1 : -1)[0];
  /* tomorrow's (or a day's) suggested bedtime from the first lesson, the sleep goal and getting-ready time */
  K.bedtimeFor = s => {
    const c = K.sleepCfg(), first = K.lessonsOn(s)[0];
    const mp = first && K.morningPlan(s);
    const wakeHm = mp && mp.wake ? mp.wake : first ? first.start : (c.wakeDefault || '08:00');
    const [h, m] = wakeHm.split(':').map(Number);
    const wake = K.fromYmd(s); wake.setHours(h, m - (first && !(mp && mp.wake) ? +c.wakeBefore : 0), 0, 0);
    const bed = new Date(wake.getTime() - c.goal * 36e5);
    return { wake, bed, first };
  };
  /* ---------- school mornings from real bus times ----------
     first lesson − “be there early” → the latest connection that still gets you there (Traveler’s trip,
     home → school) → leave time − “getting ready” = wake time. Cached per day in hub.mornings. */
  K.morningCfg = () => Object.assign({ ready: 45, early: 10, bus: true }, K.get('morning', {}) || {});
  const TRIPS = [{ id: 'mh-glr', a: { short: 'Middelharnis', place: '51.7554,4.160899' }, b: { short: 'Grafisch Lyceum', place: '51.9275955,4.478099' } },
    { id: 'ot-glr', a: { short: 'Oude-Tonge', place: '51.695873,4.2125177' }, b: { short: 'Grafisch Lyceum', place: '51.9275955,4.478099' } }];
  K.schoolTrip = () => { const ts = K.raw('traveler.trips', null) || TRIPS, sel = K.raw('traveler.selected', 'mh-glr'); return ts.find(t => t.id === sel) || ts[0] || null; };
  K.morningPlan = s => { const m = (K.get('mornings', {}) || {})[s]; const first = K.lessonsOn(s)[0]; return m && first && m.first === first.start ? m : null; };
  const MODE = { BUS: 'Bus', TRAM: 'Tram', SUBWAY: 'Metro', METRO: 'Metro', RAIL: 'Train', REGIONAL_RAIL: 'Train', COACH: 'Bus', FERRY: 'Ferry' };
  K.planMorning = async (s, force) => {
    const first = K.lessonsOn(s)[0], c = K.morningCfg(); if (!first || c.bus === false) return null;
    const all = K.get('mornings', {}) || {}, old = all[s];
    const fresh = old && old.first === first.start && Date.now() - (old.at || 0) < (K.daysUntil(s) <= 0 ? 15 * 60e3 : 6 * 36e5);
    if (fresh && !force) return old;
    const trip = K.schoolTrip(); if (!trip) return null;
    const [h, m] = first.start.split(':').map(Number), target = K.fromYmd(s); target.setHours(h, m - (+c.early || 0), 0, 0);
    try {
      const q = new URLSearchParams({ fromPlace: trip.a.place, toPlace: trip.b.place, time: target.toISOString(), arriveBy: 'true' });
      const r = await fetch('https://api.transitous.org/api/v5/plan?' + q); if (!r.ok) throw new Error(r.status);
      const its = ((await r.json()).itineraries || []).filter(it => Date.parse(it.endTime) <= target.getTime() + 60000 && !it.legs.some(l => l.cancelled));
      if (!its.length) return old || null;
      const it = its.sort((x, y) => Date.parse(y.startTime) - Date.parse(x.startTime))[0];
      const ride = it.legs.find(l => !['WALK', 'BIKE', 'CAR'].includes(l.mode));
      const leave = new Date(it.startTime), wake = new Date(leave.getTime() - (+c.ready || 45) * 60000);
      const plan = { first: first.start, subject: first.subject, leave: K.hm(leave), arrive: K.hm(new Date(it.endTime)), wake: K.hm(wake),
        line: ride ? `${MODE[ride.mode] || 'Ride'} ${ride.routeShortName || ride.displayName || ''}`.trim() : '', from: trip.a.short || trip.a.name, at: Date.now() };
      for (const k in all) if (k < K.addDays(K.ymd(), -2)) delete all[k];
      all[s] = plan; K.put('mornings', all);
      return plan;
    } catch { return old || null; }
  };
  /* the next school day with lessons (today if school hasn't started yet) */
  K.nextSchoolDay = () => { for (let i = 0; i < 10; i++) { const d = K.addDays(K.ymd(), i), f = K.lessonsOn(d)[0]; if (f && (i > 0 || f.start > K.hm(new Date()))) return d; } return null; };

  /* ---------- morning brief: one notification that sums up the day ---------- */
  K.briefCfg = () => Object.assign({ on: false, time: '07:00', days: 'all' }, K.get('brief', {}) || {});
  K.briefFor = s => {
    const L = [], ls = K.lessonsOn(s), hol = K.isHoliday(s), mp = K.morningPlan(s), w = K.workoutData();
    if (hol) L.push(`🌴 ${hol.name || 'Holiday'}`);
    else if (ls.length) L.push(`🏫 ${K.plural(ls.length, 'lesson')}, first ${ls[0].subject} ${ls[0].start}, done ${ls[ls.length - 1].end}`);
    if (mp) L.push(`🚌 Leave ${mp.leave}${mp.line ? ' · ' + mp.line : ''} (at school ${mp.arrive})`);
    const tests = K.homework.all().filter(h => !h.done && h.type === 'test' && h.due === s);
    if (tests.length) L.push(`📝 Test${tests.length > 1 ? 's' : ''}: ${tests.map(h => h.subject || h.title).join(', ')}`);
    const hw = K.homework.all().filter(h => !h.done && h.type !== 'test' && h.due === s);
    if (hw.length) L.push(`📚 Due today: ${hw.map(h => (h.subject ? h.subject + ' ' : '') + h.title).slice(0, 3).join(', ')}`);
    const t2 = K.homework.all().filter(h => !h.done && h.type === 'test' && h.due === K.addDays(s, 1));
    if (t2.length) L.push(`⚠️ Test tomorrow: ${t2.map(h => h.subject || h.title).join(', ')}`);
    const ev = K.events.all().filter(e => K.occursOn(e.date, e.repeat, s));
    for (const e of ev.slice(0, 2)) L.push(`${e.birthday ? '🎂' : '📅'} ${e.title}${e.start ? ' ' + e.start : ''}`);
    const todo = K.tasks.all().filter(t => !t.done && t.due && t.due <= s), late = todo.filter(t => t.due < s).length;
    if (todo.length) L.push(`✅ ${K.plural(todo.length, 'to-do')}${late ? ` (${late} overdue)` : ''}: ${todo.slice(0, 2).map(t => t.title).join(', ')}${todo.length > 2 ? '…' : ''}`);
    const plan = K.workoutPlan(s, w); if (plan && (plan.exercises || []).length && !(w.skips || []).some(x => x.date === s)) L.push(`🏋️ ${plan.name || 'Workout'}`);
    for (const c of K.countdowns.all()) if (K.occursOn(c.date, c.yearly ? 'yearly' : '', s)) L.push(`🎉 ${c.title} is today!`);
    const d = K.fromYmd(s);
    return { title: `☀️ Good morning! ${K.DAYS[d.getDay()]} ${d.getDate()} ${K.MONTHS[d.getMonth()].slice(0, 3)}`, body: L.length ? L.join('\n') : 'Nothing planned today. Enjoy! 😎' };
  };
  K.briefToday = s => { const c = K.briefCfg(); if (!c.on) return false; const wd = K.fromYmd(s).getDay();
    return c.days === 'all' || (c.days === 'weekdays' && wd >= 1 && wd <= 5) || (c.days === 'school' && K.lessonsOn(s).length > 0); };

  K.monthSpent = (ym = K.ymd().slice(0, 7)) => K.money.all().filter(t => t.type !== 'in' && String(t.date).slice(0, 7) === ym).reduce((a, t) => a + K.num(t.amount), 0);
  K.eur = n => { const v = Math.round(K.num(n) * 100) / 100, [a, c] = Math.abs(v).toFixed(2).split('.'); return (v < 0 ? '-' : '') + '€' + a.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + c; };
  K.school = () => Object.assign({ lessons: [], subjects: [], holidays: [], remindHw: true, remindTime: '19:00', firstLesson: '' }, K.get('school', {}) || {});
  K.saveSchool = s => K.put('school', s);

  K.subjectColor = name => {
    const s = K.school().subjects.find(x => x.name.toLowerCase() === String(name || '').toLowerCase());
    if (s && s.color) return s.color;
    let h = 0; for (const ch of String(name || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return K.colors[h % (K.colors.length - 1)];
  };
  K.isHoliday = s => K.school().holidays.find(h => h.from && s >= h.from && s <= (h.to || h.from));
  K.lessonsOn = s => {
    if (K.isHoliday(s)) return [];
    const wd = K.fromYmd(s).getDay();
    return K.school().lessons.filter(l => +l.day === wd).sort((a, b) => a.start < b.start ? -1 : 1);
  };

  /* ---------- workout data (from the Workout app, read only) ---------- */
  const W = () => ({
    days: K.raw('wl_days', []) || [], routines: K.raw('wl_rt', []) || [], sessions: K.raw('wl_ses', []) || [],
    water: K.raw('wl_water', []) || [], weights: K.raw('wl_wt', []) || [], skips: K.raw('wl_skips', []) || [],
    meals: K.raw('wl_meals', []) || [], prof: K.raw('wl_prof', {}) || {},
  });
  K.workoutPlan = (s, w = W()) => {
    const d = w.days.find(x => x.date === s); if (d) return d;
    const wd = K.fromYmd(s).getDay();
    return w.routines.filter(r => (r.weekday | 0) === wd && (!r.effectiveFrom || String(r.effectiveFrom) <= s))
      .sort((a, b) => String(a.effectiveFrom || '') < String(b.effectiveFrom || '') ? 1 : -1)[0] || null;
  };
  K.workoutDone = (s, w = W()) => w.sessions.find(x => x.finishedAt && K.ymd(new Date(x.finishedAt)) === s);
  K.waterOn = (s, w = W()) => {
    const e = w.water.find(x => x.date === s) || {};
    const ws = w.weights.filter(x => +x.kg > 0).sort((a, b) => a.date < b.date ? -1 : 1);
    const kg = ws.length ? +ws[ws.length - 1].kg : K.num(w.prof.weightKg);
    let goal = K.num(w.prof.waterGoal) || (kg ? Math.round(kg * 35 / 250) * 250 : 2500);
    const plan = K.workoutPlan(s, w);
    if (K.workoutDone(s, w) || (plan && (plan.exercises || []).length)) goal += 500;
    return { ml: K.num(e.ml), goal };
  };
  K.proteinOn = (s, w = W()) => ({ g: Math.round(w.meals.filter(m => m.date === s).reduce((a, m) => a + K.num(m.protein), 0)), goal: K.num(w.prof.proteinGoal) });
  K.workoutData = W;

  /* ---------- habits ---------- */
  K.AUTO = [['', 'I tick it myself'], ['gym', 'Finished a workout'], ['water', 'Hit my water goal'], ['protein', 'Hit my protein goal'], ['tasks', 'Did all of today’s to-dos'], ['homework', 'No homework left for tomorrow'], ['sleep', 'Slept my sleep goal']];
  K.habitDone = (h, s) => {
    if (h.log && h.log[s]) return true;
    if (!h.auto) return false;
    const w = W();
    if (h.auto === 'gym') return !!K.workoutDone(s, w);
    if (h.auto === 'water') { const x = K.waterOn(s, w); return x.ml > 0 && x.ml >= x.goal; }
    if (h.auto === 'protein') { const x = K.proteinOn(s, w); return x.goal > 0 && x.g >= x.goal; }
    if (h.auto === 'tasks') { const t = K.tasks.all().filter(t => t.due === s || (t.done && t.doneAt && K.ymd(new Date(t.doneAt)) === s)); return t.length > 0 && t.every(x => x.done || (x.repeat && x.due > s)); }
    if (h.auto === 'sleep') { const e = K.sleepLog.all().find(x => x.wake && x.wake.slice(0, 10) === s); return !!e && K.sleepMins(e) >= K.sleepCfg().goal * 60 - 15; }
    if (h.auto === 'homework') { if (s !== K.ymd()) return false; return K.homework.all().filter(x => x.due === K.addDays(s, 1)).every(x => x.done) && K.homework.all().some(x => x.due === K.addDays(s, 1)); }
    return false;
  };
  /* is the habit planned on that day? daily habits: every day (or chosen weekdays); "n per week": any day */
  K.habitDueOn = (h, s) => !h.days || !h.days.length || h.days.includes(K.fromYmd(s).getDay());
  K.habitStreak = h => {
    let n = 0, s = K.ymd();
    if (h.goal && h.goal !== 'daily') {          /* weekly goal: count full weeks that hit it */
      let wk = K.weekStart(s);
      const cnt = w => { let c = 0; for (let i = 0; i < 7; i++) if (K.habitDone(h, K.addDays(w, i))) c++; return c; };
      if (cnt(wk) >= +h.goal) n++;
      wk = K.addDays(wk, -7);
      for (let i = 0; i < 104 && cnt(wk) >= +h.goal; i++) { n++; wk = K.addDays(wk, -7); }
      return { n, unit: 'week' };
    }
    if (!K.habitDone(h, s)) s = K.addDays(s, -1);   /* today isn't over yet */
    for (let i = 0; i < 1000; i++) {
      if (!K.habitDueOn(h, s)) { s = K.addDays(s, -1); continue; }
      if (!K.habitDone(h, s)) break;
      n++; s = K.addDays(s, -1);
    }
    return { n, unit: 'day' };
  };

  /* ---------- one day, every app ----------
     returns [{ kind, time, end, title, sub, color, href, done, id }] sorted by time (all-day first) */
  K.agenda = (s, opts = {}) => {
    const out = [], R = K.root, w = W();
    for (const e of K.events.all()) if (K.occursOn(e.date, e.repeat, s) && (!e.until || s <= e.until))
      out.push({ kind: 'event', id: e.id, time: e.start || '', end: e.end || '', title: e.title, sub: e.repeat === 'yearly' && e.birthday ? 'Birthday' : (e.place || ''), color: e.color || '#56ccf2', href: R + 'calendar/#' + s });
    if (opts.lessons !== false) for (const l of K.lessonsOn(s))
      out.push({ kind: 'lesson', id: l.id, time: l.start, end: l.end, title: l.subject, sub: [l.room, l.teacher].filter(Boolean).join(' · '), color: K.subjectColor(l.subject), href: R + 'school/' });
    for (const h of K.homework.all()) if (h.due === s)
      out.push({ kind: h.type === 'test' ? 'test' : 'homework', id: h.id, time: '', title: (h.type === 'test' ? 'Test: ' : '') + (h.subject ? h.subject + ' — ' : '') + h.title, sub: h.type === 'test' ? 'Test' : 'Homework', color: K.subjectColor(h.subject), done: h.done, href: R + 'school/#homework' });
    for (const t of K.tasks.all()) if (t.due === s && (!t.done || opts.done))
      out.push({ kind: 'task', id: t.id, time: t.time || '', title: t.title, sub: t.list && t.list !== 'Inbox' ? t.list : 'To-do', color: '#8b7cff', done: t.done, href: R + 'todo/' });
    for (const c of K.countdowns.all()) if (K.occursOn(c.date, c.yearly ? 'yearly' : '', s))
      out.push({ kind: 'countdown', id: c.id, time: '', title: (c.emoji ? c.emoji + ' ' : '') + c.title, sub: 'Countdown day', color: c.color || '#ffcf5c', href: R + 'countdowns/' });
    const plan = K.workoutPlan(s, w), done = K.workoutDone(s, w);
    if (done) out.push({ kind: 'workout', time: K.hm(new Date(done.startedAt || done.finishedAt)), title: done.dayName || 'Workout', sub: 'Workout done', color: '#ff5a5a', done: true, href: R + 'workout/' });
    else if (plan && (plan.exercises || []).length && s >= K.ymd()) out.push({ kind: 'workout', time: '', title: plan.name || 'Workout', sub: `Workout · ${(plan.exercises || []).length} exercises`, color: '#ff5a5a', href: R + 'workout/' });
    const hol = K.isHoliday(s);
    if (hol && opts.lessons !== false) out.push({ kind: 'holiday', time: '', title: hol.name || 'School holiday', sub: 'No school', color: '#6fdc8c', href: R + 'school/#settings' });
    return out.sort((a, b) => (a.time || '') < (b.time || '') ? -1 : (a.time || '') > (b.time || '') ? 1 : 0);
  };

  /* ---------- reminders ----------
     Every reminder has an id, a time and a text. While Life Hub is open (or was opened recently),
     due reminders show as phone notifications. Each one only shows once. */
  const at = (s, hm) => { const [h, m] = (hm || '08:00').split(':').map(Number); const d = K.fromYmd(s); d.setHours(h, m || 0, 0, 0); return d.getTime(); };
  K.reminders = () => {
    const out = [], R = K.root;
    for (const t of K.tasks.all()) if (!t.done && t.remind && t.due)
      out.push({ id: `task:${t.id}:${t.due}:${t.time}`, at: at(t.due, t.time || '08:00'), title: t.title, body: t.time ? `To-do · ${t.time}` : 'To-do today', url: R + 'todo/' });
    const sc = K.school();
    if (sc.remindHw !== false) for (const h of K.homework.all()) if (!h.done && h.due) {
      const label = h.type === 'test' ? 'Test tomorrow' : 'Due tomorrow';
      out.push({ id: `hw:${h.id}:${h.due}`, at: at(K.addDays(h.due, -1), sc.remindTime || '19:00'), title: `${label}: ${h.subject ? h.subject + ' — ' : ''}${h.title}`, body: h.type === 'test' ? 'Time to study.' : 'Is it finished?', url: R + 'school/#homework' });
      if (h.type === 'test') out.push({ id: `test3:${h.id}:${h.due}`, at: at(K.addDays(h.due, -3), sc.remindTime || '19:00'), title: `Test in 3 days: ${h.subject || ''} ${h.title}`.trim(), body: 'Start studying today.', url: R + 'school/#homework' });
    }
    const today = K.ymd();
    for (const e of K.events.all()) if (e.remind !== '' && e.remind != null) for (const s of [today, K.addDays(today, 1)]) if (K.occursOn(e.date, e.repeat, s)) {
      const min = +e.remind, t0 = at(s, e.start || '09:00') - min * 60000;
      out.push({ id: `ev:${e.id}:${s}`, at: t0, title: e.title, body: e.start ? `${min ? `In ${min >= 60 ? min / 60 + ' h' : min + ' min'} · ` : ''}${e.start}${e.place ? ' · ' + e.place : ''}` : (e.birthday ? 'Birthday today 🎂' : 'Today'), url: R + 'calendar/' });
    }
    for (const h of K.habits.all()) if (h.remindAt && K.habitDueOn(h, today) && !K.habitDone(h, today))
      out.push({ id: `hb:${h.id}:${today}`, at: at(today, h.remindAt), title: `${h.emoji || '🔥'} ${h.name}`, body: `Keep your streak going (${K.habitStreak(h).n}).`, url: R + 'habits/' });
    for (const c of K.countdowns.all()) for (const s of [today]) if (K.occursOn(c.date, c.yearly ? 'yearly' : '', s))
      out.push({ id: `cd:${c.id}:${s}`, at: at(s, '08:00'), title: `${c.emoji || '🎉'} ${c.title}`, body: 'It’s today!', url: R + 'countdowns/' });
    if (K.briefToday(today)) { const b = K.briefFor(today); out.push({ id: `brief:${today}`, at: at(today, K.briefCfg().time), title: b.title, body: b.body, url: R }); }
    const sc2 = K.sleepCfg();
    if (sc2.remind) { const b = K.bedtimeFor(K.addDays(today, 1)).bed; const t0 = b.getTime() - 30 * 60000;
      out.push({ id: `bed:${today}`, at: t0, title: '😴 Bedtime in 30 minutes', body: `Be in bed by ${K.hm(b)} to get ${sc2.goal} h of sleep.`, url: R + 'sleep/' }); }
    for (const a of K.anime.all()) if (a.remind && K.animeAirsToday(a))
      out.push({ id: `ani:${a.id}:${today}`, at: at(today, a.airTime || '18:00') + 60 * 60000, title: `🎬 New episode: ${a.title}`, body: `Episode ${(a.ep || 0) + 1} should be out now.`, url: R + 'anime/' });
    const shc = K.shaveCfg(), due = K.shaveDue();
    if (shc.remindAt && due.length) out.push({ id: `shave:${today}`, at: at(today, shc.remindAt), title: '🪒 Time to shave', body: due.join(', '), url: R + 'shaving/' });
    if (!document.getElementById('night')) for (const a of K.alarms.all()) if (a.on) { const t = K.alarmTime(a, today);
      if (t) out.push({ id: `alarm:${a.id}:${today}`, at: at(today, t), title: '⏰ ' + (a.label || 'Alarm'), body: 'Your alarm. (Use night mode or the Clock app for a loud alarm.)', url: R + 'alarm/' }); }
    for (const sb of K.subs.all()) if (sb.day) {
      const d = new Date(); const next = new Date(d.getFullYear(), d.getMonth(), +sb.day); if (K.ymd(next) < today) next.setMonth(next.getMonth() + 1);
      if (sb.cycle === 'yearly' && sb.month && next.getMonth() + 1 !== +sb.month) continue;
      const due = K.ymd(next);
      out.push({ id: `sub:${sb.id}:${due}`, at: at(K.addDays(due, -1), '19:00'), title: `💳 ${sb.name} renews tomorrow`, body: `${K.eur(sb.amount)} will be charged. Still using it?`, url: R + 'money/#subs' });
    }
    return out;
  };

  K.canNotify = () => 'Notification' in window;
  K.notifyOn = () => K.canNotify() && Notification.permission === 'granted';
  K.askNotify = async () => {
    if (!K.canNotify()) { K.toast('This browser can’t show notifications'); return false; }
    const p = await Notification.requestPermission();
    if (p !== 'granted') K.toast('Notifications are blocked. Allow them in Chrome’s site settings.');
    return p === 'granted';
  };
  K.showNotification = async (title, body, url, tag) => {
    const opts = { body, tag, icon: K.root + 'icons/icon-192.png', badge: K.root + 'icons/icon-192.png', data: { url }, vibrate: [200, 100, 200] };
    try { const reg = await navigator.serviceWorker?.ready; if (reg) { await reg.showNotification(title, opts); return; } } catch {}
    try { new Notification(title, opts); } catch {}
  };
  K.checkReminders = () => {
    const fired = K.get('fired', {}) || {}, now = Date.now(); let changed = false;
    for (const r of K.reminders()) {
      if (fired[r.id] || r.at > now || r.at < now - 12 * 36e5) continue;   /* only ones due in the last 12 hours */
      fired[r.id] = now; changed = true;
      if (K.notifyOn()) K.showNotification(r.title, r.body, r.url, r.id); else K.toast('🔔 ' + r.title);
    }
    if (changed) {                                   /* forget ones older than 3 weeks */
      for (const k in fired) if (now - fired[k] > 21 * 864e5) delete fired[k];
      try { localStorage.setItem('hub.fired', JSON.stringify(fired)); } catch {}
    }
  };
  /* the next reminder coming up, for "next reminder at ..." */
  K.nextReminder = () => K.reminders().filter(r => r.at > Date.now()).sort((a, b) => a.at - b.at)[0];
  /* when you're logged in, wait for the first cloud sync, so reminders already sent while Life Hub was closed don't show twice */
  const firstCheck = () => { let auth = null; try { auth = JSON.parse(localStorage.getItem('wl_auth') || 'null'); } catch {} if (auth && auth.rt) setTimeout(K.checkReminders, 4000); else K.checkReminders(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', firstCheck, { once: true }); else firstCheck();
  setInterval(K.checkReminders, 30000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') K.checkReminders(); });
})();
