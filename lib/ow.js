/* Overwatch stats via OverFast (free, unofficial: reads your PUBLIC Overwatch career profile by BattleTag).
   Saves a daily snapshot in hub.owsnaps so Life Hub can show what changed per day (your game log). */
(function () {
  if (window.OW) return;
  var API = 'https://overfast-api.tekrop.fr/';
  var J = function (k, d) { try { var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
  var S = function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); localStorage.setItem('hub.changedAt', String(Date.now())); } catch (e) {} };
  var ymd = function (d) { d = d || new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); };
  var cap = function (s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; };
  /* "Name#12345" → "Name-12345" */
  function tagId(tag) { return encodeURIComponent(String(tag || '').trim().replace('#', '-')); }
  async function get(path) {
    var r = await fetch(API + path), j = await r.json().catch(function () { return {}; });
    if (r.status === 404) throw Object.assign(new Error('notfound'), { code: 404 });
    if (r.status === 429) throw Object.assign(new Error('Overwatch stats are busy. Try again in a few minutes.'), { code: 429 });
    if (!r.ok) throw new Error((j.error && (j.error.error || j.error)) || j.error || 'Overwatch stats unavailable (' + r.status + ')');
    return j;
  }
  function rankText(r) { return r && r.division ? cap(r.division) + ' ' + r.tier : ''; }
  function ranks(summary) {
    var c = (summary && summary.competitive) || {}, out = {};
    ['pc', 'console'].forEach(function (p) { var x = c[p]; if (!x) return; ['tank', 'damage', 'support', 'open'].forEach(function (role) { if (x[role]) out[(p === 'console' ? 'console ' : '') + role] = rankText(x[role]); }); if (x.season) out.season = x.season; });
    return out;
  }
  function gen(stats) { var g = stats && stats.general; return g ? { gp: g.games_played || 0, gw: g.games_won || 0, gl: g.games_lost || 0, tp: g.time_played || 0 } : null; }
  async function fetchAll(tag) {
    var id = tagId(tag);
    var summary = await get('players/' + id + '/summary');
    var res = await Promise.all(['quickplay', 'competitive'].map(function (m) { return get('players/' + id + '/stats/summary?gamemode=' + m).catch(function () { return null; }); }));
    var data = { summary: summary, qp: res[0], comp: res[1], at: Date.now() };
    data.private = !(gen(res[0]) || gen(res[1]));
    try { localStorage.setItem('hub.ow.cache', JSON.stringify(data)); } catch (e) {}
    snapshot(data);
    return data;
  }
  /* one snapshot per day (the latest of that day wins) */
  function snapshot(data) {
    if (data.private) return;
    var snaps = J('hub.owsnaps', []) || [], d = ymd();
    var snap = { d: d, at: Date.now(), qp: gen(data.qp), comp: gen(data.comp), ranks: ranks(data.summary), endorse: ((data.summary || {}).endorsement || {}).level || 0 };
    snaps = snaps.filter(function (s) { return s.d !== d; }).concat(snap).sort(function (a, b) { return a.d < b.d ? -1 : 1; }).slice(-400);
    S('hub.owsnaps', snaps);
  }
  async function heroes() {
    var c = J('hub.owheroes', null);
    if (c && c.list && Date.now() - c.at < 7 * 864e5) return c.list;
    try { var list = await get('heroes'); S('hub.owheroes', { at: Date.now(), list: list.map(function (h) { return { key: h.key, name: h.name, role: h.role, portrait: h.portrait }; }) }); return J('hub.owheroes').list; }
    catch (e) { return (c && c.list) || []; }
  }
  /* quietly log once every 6 hours from any page */
  async function auto() {
    var cfg = J('hub.ow', {}) || {}; if (!cfg.tag || !navigator.onLine) return;
    var snaps = J('hub.owsnaps', []) || [], last = snaps.length ? snaps[snaps.length - 1].at : 0;
    if (Date.now() - last < 6 * 36e5) return;
    try { await fetchAll(cfg.tag); } catch (e) {}
  }
  window.OW = { get: get, fetchAll: fetchAll, heroes: heroes, rankText: rankText, ranks: ranks, gen: gen, tagId: tagId, auto: auto, cap: cap };
})();
