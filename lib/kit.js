/* Life Hub shared toolkit for every app page.
   Data is saved in this phone's browser storage under "hub.<name>".
   Each saved item has an id and an "updated" time so cloud sync can merge it later. */
(function () {
  const K = window.K = {};
  const ROOT = new URL('../', document.currentScript.src).href;   /* the hub's folder */
  K.root = ROOT;

  /* ---------- theme ---------- */
  try { const t = JSON.parse(localStorage.getItem('hub.theme') || '""'); if (t) document.documentElement.dataset.theme = t; } catch {}

  /* ---------- storage ---------- */
  K.get = (name, d) => { try { const v = localStorage.getItem('hub.' + name); return v == null ? d : JSON.parse(v); } catch { return d; } };
  K.put = (name, v) => {
    try { localStorage.setItem('hub.' + name, JSON.stringify(v)); }
    catch (e) { K.toast('Storage is full. Download a backup and delete old items.'); }
    try { localStorage.setItem('hub.changedAt', String(Date.now())); } catch {}
    document.dispatchEvent(new CustomEvent('hub:change', { detail: name }));
  };
  K.raw = (key, d) => { try { const v = localStorage.getItem(key); return v == null ? d : JSON.parse(v); } catch { return d; } };
  K.uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  K.stamp = o => Object.assign(o, { updated: Date.now() });
  /* a simple collection: an array of objects with ids */
  K.coll = name => ({
    all: () => K.get(name, []) || [],
    save: list => K.put(name, list),
    upsert(item) { const l = this.all(); const i = l.findIndex(x => x.id === item.id); K.stamp(item); if (i < 0) { item.created = item.created || Date.now(); l.push(item); } else l[i] = item; this.save(l); return item; },
    remove(id) { this.save(this.all().filter(x => x.id !== id)); },
    byId(id) { return this.all().find(x => x.id === id); },
  });

  /* ---------- text ---------- */
  K.esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  K.$ = s => document.querySelector(s);
  K.num = v => { const n = parseFloat(String(v).replace(',', '.')); return isFinite(n) ? n : 0; };
  K.plural = (n, w, ws) => `${n} ${n === 1 ? w : (ws || w + 's')}`;

  /* ---------- dates (always the phone's local time) ---------- */
  const pad = n => String(n).padStart(2, '0');
  K.pad = pad;
  K.ymd = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  K.fromYmd = s => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, m - 1, d); };
  K.addDays = (s, n) => { const d = K.fromYmd(s); d.setDate(d.getDate() + n); return K.ymd(d); };
  K.daysUntil = s => Math.round((K.fromYmd(s) - K.fromYmd(K.ymd())) / 864e5);
  K.hm = d => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  K.today = () => K.ymd();
  K.DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  K.DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  K.MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  K.fmtDay = (s, long) => {
    if (!s) return '';
    const n = K.daysUntil(s);
    if (n === 0) return 'Today'; if (n === 1) return 'Tomorrow'; if (n === -1) return 'Yesterday';
    const d = K.fromYmd(s);
    if (n > 1 && n < 7) return K.DAYS[d.getDay()];
    const same = d.getFullYear() === new Date().getFullYear();
    return `${(long ? K.DAYS : K.DAYS_SHORT)[d.getDay()]} ${d.getDate()} ${K.MONTHS[d.getMonth()].slice(0, 3)}${same ? '' : ' ' + d.getFullYear()}`;
  };
  /* "today" / "tomorrow" in lower case for use inside a sentence; weekday names keep their capital */
  K.fmtDayIn = s => { const t = K.fmtDay(s); return /^(Today|Tomorrow|Yesterday)$/.test(t) ? t.toLowerCase() : t; };
  K.fmtDate = s => { const d = K.fromYmd(s); return `${d.getDate()} ${K.MONTHS[d.getMonth()].slice(0, 3)} ${d.getFullYear()}`; };
  K.inDays = n => n === 0 ? 'today' : n === 1 ? 'tomorrow' : n === -1 ? 'yesterday' : n > 0 ? `in ${n} days` : `${-n} days ago`;
  K.weekStart = s => { const d = K.fromYmd(s); const off = (d.getDay() + 6) % 7; d.setDate(d.getDate() - off); return K.ymd(d); };  /* Monday */

  /* repeating: '', 'daily', 'weekdays', 'weekly', 'biweekly', 'monthly', 'yearly' */
  K.REPEATS = [['', 'Never'], ['daily', 'Every day'], ['weekdays', 'Every weekday'], ['weekly', 'Every week'], ['biweekly', 'Every 2 weeks'], ['monthly', 'Every month'], ['yearly', 'Every year']];
  K.repeatNext = (s, rep) => {
    const d = K.fromYmd(s || K.ymd());
    if (rep === 'daily') d.setDate(d.getDate() + 1);
    else if (rep === 'weekdays') { do d.setDate(d.getDate() + 1); while (d.getDay() === 0 || d.getDay() === 6); }
    else if (rep === 'weekly') d.setDate(d.getDate() + 7);
    else if (rep === 'biweekly') d.setDate(d.getDate() + 14);
    else if (rep === 'monthly') { const day = d.getDate(); d.setDate(1); d.setMonth(d.getMonth() + 1); d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate())); }
    else if (rep === 'yearly') d.setFullYear(d.getFullYear() + 1);
    return K.ymd(d);
  };
  /* does an item that starts on `start` and repeats `rep` fall on day `s`? */
  K.occursOn = (start, rep, s) => {
    if (!start) return false;
    if (s === start) return true;
    if (!rep || s < start) return false;
    const a = K.fromYmd(start), b = K.fromYmd(s), days = Math.round((b - a) / 864e5);
    if (rep === 'daily') return true;
    if (rep === 'weekdays') return b.getDay() !== 0 && b.getDay() !== 6;
    if (rep === 'weekly') return days % 7 === 0;
    if (rep === 'biweekly') return days % 14 === 0;
    if (rep === 'monthly') return a.getDate() === b.getDate();
    if (rep === 'yearly') return a.getDate() === b.getDate() && a.getMonth() === b.getMonth();
    return false;
  };

  /* ---------- quick add: "gym bag tomorrow 7am #school !!" ---------- */
  const WD = { sunday: 0, sun: 0, zondag: 0, zo: 0, monday: 1, mon: 1, maandag: 1, ma: 1, tuesday: 2, tue: 2, tues: 2, dinsdag: 2, di: 2,
    wednesday: 3, wed: 3, woensdag: 3, wo: 3, thursday: 4, thu: 4, thur: 4, thurs: 4, donderdag: 4, do: 4, friday: 5, fri: 5, vrijdag: 5, vr: 5, saturday: 6, sat: 6, zaterdag: 6, za: 6 };
  K.parseQuick = text => {
    let t = ' ' + text.trim() + ' ';
    const out = { due: '', time: '', repeat: '', priority: 0, list: '' };
    const take = (re, fn) => { const m = t.match(re); if (m) { fn(m); t = t.replace(m[0], ' '); } };
    take(/\s(!{1,3})(?=\s)/, m => out.priority = m[1].length);
    take(/\s#([\p{L}\d_-]+)(?=\s)/u, m => out.list = m[1]);
    take(/\s(?:every|elke|iedere)\s+(day|dag|weekday|werkdag|week|month|maand|year|jaar|other week|2 weeks)(?=\s)/i, m => {
      out.repeat = { day: 'daily', dag: 'daily', weekday: 'weekdays', werkdag: 'weekdays', week: 'weekly', month: 'monthly', maand: 'monthly', year: 'yearly', jaar: 'yearly', 'other week': 'biweekly', '2 weeks': 'biweekly' }[m[1].toLowerCase()];
    });
    take(/\s(?:every|elke|iedere)\s+([a-z]+)(?=\s)/i, m => { const w = WD[m[1].toLowerCase()]; if (w != null) { out.repeat = 'weekly'; const d = new Date(); d.setDate(d.getDate() + ((w - d.getDay() + 7) % 7)); out.due = K.ymd(d); } });
    take(/\s(daily|dagelijks)(?=\s)/i, () => out.repeat = 'daily');
    take(/\s(?:at|om)?\s*(\d{1,2})(?::|\.)(\d{2})\s*(am|pm)?(?=\s)/i, m => { let h = +m[1]; if (m[3]) { if (m[3].toLowerCase() === 'pm' && h < 12) h += 12; if (m[3].toLowerCase() === 'am' && h === 12) h = 0; } if (h < 24) out.time = pad(h) + ':' + m[2]; });
    if (!out.time) take(/\s(?:at|om)?\s*(\d{1,2})\s*(am|pm|uur)(?=\s)/i, m => { let h = +m[1]; const s = m[2].toLowerCase(); if (s === 'pm' && h < 12) h += 12; if (s === 'am' && h === 12) h = 0; if (h < 24) out.time = pad(h) + ':00'; });
    take(/\s(today|vandaag)(?=\s)/i, () => out.due = K.ymd());
    take(/\s(tonight|vanavond)(?=\s)/i, () => { out.due = K.ymd(); if (!out.time) out.time = '19:00'; });
    take(/\s(tomorrow|tmrw|tmr|morgen)(?=\s)/i, () => out.due = K.addDays(K.ymd(), 1));
    take(/\s(overmorgen|day after tomorrow)(?=\s)/i, () => out.due = K.addDays(K.ymd(), 2));
    take(/\s(next week|volgende week)(?=\s)/i, () => out.due = K.addDays(K.weekStart(K.ymd()), 7));
    take(/\s(?:in|over)\s+(\d+)\s+(days?|dagen|weeks?|weken)(?=\s)/i, m => out.due = K.addDays(K.ymd(), +m[1] * (/^w/i.test(m[2]) ? 7 : 1)));
    take(/\s(?:on|op)?\s*(\d{1,2})[-/](\d{1,2})(?:[-/](\d{2,4}))?(?=\s)/i, m => {
      const now = new Date(); let y = m[3] ? +m[3] : now.getFullYear(); if (y < 100) y += 2000;
      const d = new Date(y, +m[2] - 1, +m[1]); if (!m[3] && d < new Date(now.getFullYear(), now.getMonth(), now.getDate())) d.setFullYear(y + 1);
      if (!isNaN(d)) out.due = K.ymd(d);
    });
    if (!out.due) take(/\s(?:on|op|next|volgende)?\s*(sunday|sun|zondag|monday|mon|maandag|tuesday|tues|tue|dinsdag|wednesday|wed|woensdag|thursday|thurs|thur|thu|donderdag|friday|fri|vrijdag|saturday|sat|zaterdag)(?=\s)/i, m => {
      const w = WD[m[1].toLowerCase()], d = new Date(); let add = (w - d.getDay() + 7) % 7; if (add === 0) add = 7; d.setDate(d.getDate() + add); out.due = K.ymd(d);
    });
    if (out.time && !out.due) { out.due = K.ymd(); if (out.time < K.hm(new Date())) out.due = K.addDays(out.due, 1); }
    if (out.repeat && !out.due) out.due = K.ymd();
    out.title = t.replace(/\s+/g, ' ').trim();
    return out;
  };

  /* ---------- toast with optional Undo ---------- */
  K.toast = (msg, undo) => {
    if (!document.body) { document.addEventListener('DOMContentLoaded', () => K.toast(msg, undo), { once: true }); return; }
    let el = document.getElementById('toast');
    if (!el) { el = document.createElement('div'); el.id = 'toast'; el.className = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
    el.innerHTML = `<span>${K.esc(msg)}</span>${undo ? '<button type="button">Undo</button>' : ''}`;
    if (undo) el.querySelector('button').onclick = () => { undo(); el.classList.remove('on'); };
    el.classList.add('on'); clearTimeout(K.toast.t); K.toast.t = setTimeout(() => el.classList.remove('on'), undo ? 5000 : 2600);
  };

  /* ---------- icons ---------- */
  K.ICON = {
    back: '<path d="M15 5l-7 7 7 7"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>',
    bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
    travel: '<path d="M6 17V7a3 3 0 0 1 3-3h6a3 3 0 0 1 3 3v10M6 13h12M8.5 20.5l1-3M15.5 20.5l-1-3"/>',
    workout: '<path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11"/>',
    todo: '<path d="M9 11l2.5 2.5L16 9"/><rect x="4" y="4" width="16" height="16" rx="4"/>',
    school: '<path d="M2.5 9 12 4.5 21.5 9 12 13.5z"/><path d="M6.5 11v5c0 1.5 2.5 3 5.5 3s5.5-1.5 5.5-3v-5"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    habits: '<path d="M12 3c2.5 3 5 5.4 5 9a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5.3 1.6 1 2.5 2 3 0-2.5.2-5 1-7.5z"/>',
    sleep: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
    food: '<path d="M7 3v8a2 2 0 0 0 2 2v8M11 3v8a2 2 0 0 1-2 2M17 21V3c-2 1.5-3 4-3 7v4h3"/>',
    money: '<rect x="3" y="6" width="18" height="13" rx="3"/><path d="M3 10.5h18M7 15h3"/>',
    shopping: '<path d="M5 7h14l-1.3 10.2a2 2 0 0 1-2 1.8H8.3a2 2 0 0 1-2-1.8z"/><path d="M9 10V6a3 3 0 0 1 6 0v4"/>',
    notes: '<path d="M6 3.5h9l4 4V20a.5.5 0 0 1-.5.5h-12A.5.5 0 0 1 6 20z"/><path d="M14.5 3.5V8h4.5M9 12h6M9 16h6"/>',
    countdown: '<circle cx="12" cy="13" r="7.5"/><path d="M12 9v4l2.5 2M9.5 2.5h5"/>',
    ai: '<path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8zM18.5 15l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z"/>',
    trash: '<path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13"/>',
    anime: '<rect x="3" y="5" width="18" height="13" rx="3"/><path d="M8 21h8M10.5 9.5v5l4-2.5z"/>',
    coach: '<path d="M4 19V9M9.5 19V5M15 19v-7M20.5 19V8"/><path d="M3 21h19"/>',
    shave: '<path d="M7 3h10v5H7z"/><path d="M12 8v13M9 21h6"/><path d="M7 5.5h10"/>',
    clothes: '<path d="M8 3l4 2.5L16 3l5 3.5-2.5 4L16 9v12H8V9l-2.5 1.5L3 6.5z"/>',
    music: '<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>',
    alarm: '<circle cx="12" cy="13" r="7.5"/><path d="M12 9.5V13l2.5 1.5M4 4.5l3-2.5M20 4.5l-3-2.5"/>',
    left: '<path d="M15 5l-7 7 7 7"/>', right: '<path d="M9 5l7 7-7 7"/>',
    repeat: '<path d="M17 2.5l3 3-3 3"/><path d="M4 11.5v-1a5 5 0 0 1 5-5h11M7 21.5l-3-3 3-3"/><path d="M20 12.5v1a5 5 0 0 1-5 5H4"/>',
  };
  K.svg = (name, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${K.ICON[name] || ''}</svg>`;

  /* ---------- page header with a back-to-hub button ---------- */
  K.header = (title, icon, buttons = '') => `<header class="top">
      <a class="iconbtn" href="${ROOT}" aria-label="Back to Life Hub">${K.svg('back')}</a>
      <h1><span class="ic">${K.svg(icon)}</span><span>${K.esc(title)}</span></h1>${buttons}</header>`;

  /* ---------- bottom sheet form ----------
     K.form({ title, fields: [{ k, label, type, value, options, placeholder, hint, half }], save(values), del() }) */
  K.form = opts => {
    const bg = document.createElement('div'); bg.className = 'sheet-bg';
    const f = (fld) => {
      const id = 'f_' + fld.k, v = fld.value ?? '';
      const attrs = `id="${id}" name="${fld.k}" ${fld.placeholder ? `placeholder="${K.esc(fld.placeholder)}"` : ''} ${fld.required ? 'required' : ''} ${fld.attrs || ''}`;
      let input;
      if (fld.type === 'textarea') input = `<textarea ${attrs}>${K.esc(v)}</textarea>`;
      else if (fld.type === 'select') input = `<select ${attrs}>${fld.options.map(o => { const [val, lab] = Array.isArray(o) ? o : [o, o]; return `<option value="${K.esc(val)}" ${String(val) === String(v) ? 'selected' : ''}>${K.esc(lab)}</option>`; }).join('')}</select>`;
      else if (fld.type === 'checkbox') return `<div class="f inline"><label for="${id}">${K.esc(fld.label)}</label><input type="checkbox" ${attrs} ${v ? 'checked' : ''}></div>`;
      else if (fld.type === 'seg') return `<div class="f"><label>${K.esc(fld.label)}</label><div class="seg" data-seg="${fld.k}">${fld.options.map(o => { const [val, lab] = Array.isArray(o) ? o : [o, o]; return `<button type="button" data-v="${K.esc(val)}" aria-pressed="${String(val) === String(v)}">${K.esc(lab)}</button>`; }).join('')}</div></div>`;
      else if (fld.type === 'html') return fld.html;
      else input = `<input type="${fld.type || 'text'}" value="${K.esc(v)}" ${attrs} ${fld.type === 'number' ? 'inputmode="decimal" step="any"' : ''}>`;
      return `<div class="f"><label for="${id}">${K.esc(fld.label)}</label>${input}${fld.hint ? `<div class="small muted" style="margin-top:4px">${K.esc(fld.hint)}</div>` : ''}</div>`;
    };
    /* consecutive fields marked `half` sit side by side */
    let html = '', i = 0; const fs = opts.fields;
    while (i < fs.length) { if (fs[i].half && fs[i + 1] && fs[i + 1].half) { html += `<div class="two">${f(fs[i])}${f(fs[i + 1])}</div>`; i += 2; } else html += f(fs[i++]); }
    bg.innerHTML = `<form class="sheet" role="dialog" aria-label="${K.esc(opts.title)}" novalidate><div class="grab"></div><h2>${K.esc(opts.title)}</h2>${html}
      <div class="acts">${opts.del ? `<button type="button" class="btn danger" data-del aria-label="Delete">${K.svg('trash', 'width="18" height="18"')}</button>` : ''}
      <button type="button" class="btn" data-cancel>Cancel</button><button type="submit" class="btn primary">${K.esc(opts.saveLabel || 'Save')}</button></div></form>`;
    const form = bg.querySelector('form');
    const close = () => { bg.remove(); document.removeEventListener('keydown', esc); };
    const esc = e => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', esc);
    bg.addEventListener('click', e => { if (e.target === bg) close(); });
    form.querySelector('[data-cancel]').onclick = close;
    form.querySelectorAll('[data-seg]').forEach(seg => seg.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      seg.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b));
      if (opts.change) opts.change(read(), form);
    }));
    const read = () => {
      const o = {};
      fs.forEach(fld => {
        if (fld.type === 'seg') { const on = form.querySelector(`[data-seg="${fld.k}"] [aria-pressed="true"]`); o[fld.k] = on ? on.dataset.v : ''; return; }
        const el = form.elements[fld.k]; if (!el) return;
        o[fld.k] = fld.type === 'checkbox' ? el.checked : fld.type === 'number' ? (el.value === '' ? '' : K.num(el.value)) : el.value.trim();
      });
      return o;
    };
    if (opts.change) form.addEventListener('input', () => opts.change(read(), form));
    if (opts.del) form.querySelector('[data-del]').onclick = () => { if (opts.del() !== false) close(); };
    form.onsubmit = e => {
      e.preventDefault();
      const v = read();
      for (const fld of fs) if (fld.required && (v[fld.k] === '' || v[fld.k] == null)) { K.toast(`Fill in: ${fld.label}`); form.elements[fld.k]?.focus(); return; }
      if (opts.save(v) !== false) close();
    };
    document.body.appendChild(bg);
    setTimeout(() => { const first = form.querySelector('input:not([type=checkbox]),textarea'); if (first && opts.focus !== false && !first.value) first.focus(); }, 50);
    return form;
  };

  K.colors = ['#8b7cff', '#5db3e4', '#56ccf2', '#6fdc8c', '#3ecf9a', '#ffcf5c', '#f2994a', '#ff7b7b', '#f25f8a', '#b48cff', '#c9b37e', '#9097a8'];
  K.colorField = (k, value, label = 'Colour') => ({ k, label, type: 'seg', value: value || K.colors[0], options: K.colors.map(c => [c, '●']) });
  K.styleColorSeg = () => {   /* show the colour dots in their own colour */
    document.querySelectorAll('.seg button').forEach(b => { if (/^#[0-9a-f]{6}$/i.test(b.dataset.v)) { b.style.color = b.dataset.v; b.style.fontSize = '20px'; b.style.padding = '2px 9px'; } });
  };
  const mo = new MutationObserver(() => K.styleColorSeg()); mo.observe(document.documentElement, { childList: true, subtree: true });

  /* ---------- service worker (offline) ---------- */
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register(ROOT + 'sw.js', { updateViaCache: 'none' }).catch(() => {});
})();
