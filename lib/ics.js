/* Life Hub: read a school timetable from a calendar (iCal / .ics), e.g. Osiris "Agenda koppelen" or "Exporteren".
   Turns it into dated lessons (hub.schoolfeed), which School, Calendar, alarms and the morning brief use
   instead of the weekly timetable for the weeks the calendar covers. Needs kit.js. */
(function () {
  const K = window.K; if (!K || K.ics) return;
  const pad = K.pad;

  /* "20261126T083000Z", "20261126T083000" (+TZID: local), "20261126" (all day) */
  function when(v, params) {
    const m = String(v).match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/); if (!m) return null;
    if (!m[4]) return { date: `${m[1]}-${m[2]}-${m[3]}`, allDay: true };
    let d;
    if (m[7]) d = new Date(Date.UTC(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)));
    else if (params && /TZID=/.test(params) && !/Europe\/(Amsterdam|Brussels|Berlin|Paris)|W\. Europe|Romance/i.test(params)) d = new Date(Date.UTC(+m[1], m[2] - 1, +m[3], +m[4], +m[5])); /* other zones: best effort */
    else d = new Date(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));      /* local (Dutch) time */
    return { d, date: K.ymd(d), time: K.hm(d) };
  }
  const unesc = s => String(s || '').replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1').trim();

  /* events from .ics text; repeating events are expanded between `from` and `to` (YYYY-MM-DD) */
  function parse(text, from, to) {
    const lines = String(text).replace(/\r\n?/g, '\n').replace(/\n[ \t]/g, '').split('\n');
    const evs = []; let cur = null;
    for (const line of lines) {
      if (line === 'BEGIN:VEVENT') { cur = { ex: [] }; continue; }
      if (line === 'END:VEVENT') { if (cur) evs.push(cur); cur = null; continue; }
      if (!cur) continue;
      const i = line.indexOf(':'); if (i < 0) continue;
      const head = line.slice(0, i), val = line.slice(i + 1), name = head.split(';')[0].toUpperCase(), params = head.slice(name.length);
      if (name === 'DTSTART') cur.start = when(val, params);
      else if (name === 'DTEND') cur.end = when(val, params);
      else if (name === 'SUMMARY') cur.summary = unesc(val);
      else if (name === 'LOCATION') cur.location = unesc(val);
      else if (name === 'DESCRIPTION') cur.description = unesc(val);
      else if (name === 'STATUS') cur.status = val.toUpperCase();
      else if (name === 'RRULE') cur.rrule = val;
      else if (name === 'EXDATE') val.split(',').forEach(x => { const w = when(x, params); if (w) cur.ex.push(w.date); });
      else if (name === 'UID') cur.uid = val;
    }
    const out = [];
    for (const e of evs) {
      if (!e.start) continue;
      const len = e.end && e.start.d && e.end.d ? e.end.d - e.start.d : 0;
      const push = (date, d) => { if (date < from || date > to || e.ex.includes(date)) return;
        out.push({ uid: e.uid, date, allDay: !!e.start.allDay, start: d ? K.hm(d) : '', end: d ? K.hm(new Date(d.getTime() + len)) : '', summary: e.summary || '', location: e.location || '', description: e.description || '', cancelled: e.status === 'CANCELLED' || /^(vervallen|vervalt|uitval|geannuleerd|cancelled|canceled)\b/i.test(e.summary || '') }); };
      if (!e.rrule) { push(e.start.date, e.start.d); continue; }
      const r = Object.fromEntries(e.rrule.split(';').map(p => p.split('='))), step = +(r.INTERVAL || 1);
      const until = r.UNTIL ? (when(r.UNTIL) || {}).date : null, count = r.COUNT ? +r.COUNT : 400;
      let d = e.start.d ? new Date(e.start.d) : K.fromYmd(e.start.date);
      for (let n = 0; n < count && n < 400; n++) {
        const ds = K.ymd(d); if ((until && ds > until) || ds > to) break;
        push(ds, e.start.d ? d : null);
        if (r.FREQ === 'DAILY') d.setDate(d.getDate() + step); else if (r.FREQ === 'WEEKLY') d.setDate(d.getDate() + 7 * step); else break;
      }
    }
    return out.sort((a, b) => (a.date + a.start) < (b.date + b.start) ? -1 : 1);
  }
  const teacherOf = desc => { const m = String(desc || '').match(/(?:docent(?:en)?|teacher|leraar)\s*[:\-]\s*([^\n,;]+)/i); return m ? m[1].trim() : ''; };

  /* calendar text → the dated timetable Life Hub keeps */
  function toFeed(text, meta) {
    const from = K.addDays(K.ymd(), -21), to = K.addDays(K.ymd(), 150);
    const evs = parse(text, from, to);
    const lessons = evs.filter(e => !e.allDay && e.start).map(e => ({ id: (e.uid || '') + '|' + e.date + e.start, date: e.date, start: e.start, end: e.end, subject: e.summary, room: e.location, teacher: teacherOf(e.description), cancelled: e.cancelled }));
    const holidays = evs.filter(e => e.allDay && /vakantie|holiday|vrij\b|studiedag|lesvrij|vacation|break/i.test(e.summary)).map(e => ({ date: e.date, name: e.summary }));
    if (!lessons.length) throw new Error('No lessons found in this calendar.');
    const dates = lessons.map(l => l.date).sort();
    return Object.assign({ at: Date.now(), from: K.weekStart(dates[0]), to: K.addDays(K.weekStart(dates[dates.length - 1]), 6), lessons, holidays }, meta || {});
  }

  K.ics = { parse, toFeed, when };
  K.feed = () => K.get('schoolfeed', null);
})();
