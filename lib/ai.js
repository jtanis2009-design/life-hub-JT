/* Life Hub AI (Google Gemini), using the same key you saved in the Workout app (You tab → AI coach).
   Picks a free-tier model and falls back to the next one if a model is unavailable or out of quota. */
(function () {
  const K = window.K;
  const GEM = 'https://generativelanguage.googleapis.com/v1beta/';
  const PREF = ['gemini-flash-latest', 'gemini-2.5-flash', 'gemini-flash-lite-latest', 'gemini-2.5-flash-lite', 'gemini-2.0-flash', 'gemini-2.0-flash-lite'];
  const AVOID = /embedding|image|tts|audio|live|vision|omni|computer|robotics|pro|preview|exp|thinking|aqa|learnlm|nano|veo|lyria|imagen/;
  const key = () => { try { return String(localStorage.getItem('wl_aikey') || '').replace(/^"|"$/g, '').trim(); } catch { return ''; } };
  K.aiReady = () => !!key();
  /* the key goes in a header; if Google says no (some newer “AQ.” keys), try it in the address instead and remember that */
  async function gfetch(url, opts = {}) {
    const viaUrl = () => fetch(url + (url.includes('?') ? '&' : '?') + 'key=' + encodeURIComponent(key()), Object.assign({}, opts, { headers: Object.assign({}, opts.headers) }));
    let mode = ''; try { mode = localStorage.getItem('wl_aiauth') || ''; } catch {}
    if (mode === 'url') return viaUrl();
    const r = await fetch(url, Object.assign({}, opts, { headers: Object.assign({ 'x-goog-api-key': key() }, opts.headers) }));
    if (r.status !== 401 && r.status !== 403) return r;
    const r2 = await viaUrl().catch(() => null);
    if (r2 && r2.ok) { try { localStorage.setItem('wl_aiauth', 'url'); } catch {} return r2; }
    return r;
  }

  async function candidates() {
    const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), 15000);
    let r; try { r = await gfetch(GEM + 'models?pageSize=200', { signal: ctl.signal }); } catch (e) { throw Object.assign(new Error(e.name === 'AbortError' ? 'Google’s AI didn’t answer. Try again in a minute.' : 'Couldn’t reach the AI. Are you online?'), { net: true }); } finally { clearTimeout(tm); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error((j.error && j.error.message) || 'HTTP ' + r.status), { status: r.status });
    const all = (j.models || []).filter(m => !m.supportedGenerationMethods || m.supportedGenerationMethods.includes('generateContent')).map(m => String(m.name).replace(/^models\//, ''));
    /* newest Gemini flash models first (Google retires old ones for new users), then the “-latest” names; skip ones that told us they're retired */
    const dead = deadList(), ver = n => { const m = n.match(/gemini-(\d+(?:\.\d+)?)/); return m ? parseFloat(m[1]) : 0; };
    const out = all.filter(n => /^gemini-/.test(n) && !AVOID.test(n) && /flash/.test(n) && !dead.includes(n))
      .sort((x, y) => (ver(y) - ver(x)) || (/lite/.test(x) - /lite/.test(y)));
    return out.length ? out : PREF.filter(n => !dead.includes(n)).slice(0, 2);
  }
  /* ask through the service worker: keeps going while you're in another app; the page picks up the answer when you're back */
  const swReady = () => !!(navigator.serviceWorker && navigator.serviceWorker.controller && window.caches);
  function swFetch(url, init, ms) {
    const id = 'ai' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    K.put('ai.waiting', { id, at: Date.now() });
    return new Promise((res, rej) => {
      let done = false;
      const finish = d => { if (done) return; done = true; navigator.serviceWorker.removeEventListener('message', onMsg); document.removeEventListener('visibilitychange', onVis); clearTimeout(tm);
        caches.open('lh-ai').then(c => c.delete(location.origin + '/__lhai/' + id)).catch(() => {});
        if (d.error) rej(Object.assign(new Error(d.error), d.slow ? { slow: true } : { net: true })); else res(new Response(d.body, { status: d.status, headers: { 'Content-Type': 'application/json' } })); };
      const look = async () => { try { const r = await (await caches.open('lh-ai')).match(location.origin + '/__lhai/' + id); if (r) finish(await r.json()); } catch {} };
      const onMsg = e => { if (e.data && e.data.type === 'ai-done' && e.data.id === id) finish(e.data); };
      const onVis = () => { if (document.visibilityState === 'visible') look(); };
      navigator.serviceWorker.addEventListener('message', onMsg); document.addEventListener('visibilitychange', onVis);
      const tm = setTimeout(async () => { await look(); finish({ error: 'The AI took too long to answer.', slow: true }); }, ms + 8000);
      navigator.serviceWorker.controller.postMessage({ type: 'ai', id, url, init, ms, notify: swNotify });
    });
  }
  let swNotify = '';
  async function bgFetch(url, opts, ms) {
    const k = key(), plain = { method: opts.method || 'GET', body: opts.body, headers: Object.assign({}, opts.headers) };
    let mode = ''; try { mode = localStorage.getItem('wl_aiauth') || ''; } catch {}
    const viaUrl = () => swFetch(url + (url.includes('?') ? '&' : '?') + 'key=' + encodeURIComponent(k), plain, ms);
    if (mode === 'url') return viaUrl();
    const r = await swFetch(url, Object.assign({}, plain, { headers: Object.assign({ 'x-goog-api-key': k }, plain.headers) }), ms);
    if (r.status !== 401 && r.status !== 403) return r;
    const r2 = await viaUrl().catch(() => null);
    if (r2 && r2.ok) { try { localStorage.setItem('wl_aiauth', 'url'); } catch {} return r2; }
    return r;
  }
  /* models that refuse the “no thinking” setting (remembered on this device) */
  const noThink = { has: m => { try { return JSON.parse(localStorage.getItem('wl_ainothink') || '[]').includes(m); } catch { return false; } },
    add: m => { try { const l = JSON.parse(localStorage.getItem('wl_ainothink') || '[]'); if (!l.includes(m)) localStorage.setItem('wl_ainothink', JSON.stringify(l.concat(m))); } catch {} } };
  const deadList = () => { try { return JSON.parse(localStorage.getItem('wl_aidead') || '[]'); } catch { return []; } };
  const markDead = m => { try { localStorage.setItem('wl_aidead', JSON.stringify([...new Set(deadList().concat(m))])); } catch {} };
  const RETIRED = /no longer available|not found|deprecated|retired|is not supported|not available to new/i;
  async function once(model, contents, opts) {
    const body = { contents };
    if (opts.system) body.systemInstruction = { parts: [{ text: opts.system }] };
    body.generationConfig = Object.assign(opts.json ? { responseMimeType: 'application/json' } : {},
      /* answer straight away instead of “thinking” first: much faster, and plenty for an assistant */
      noThink.has(model) ? {} : { thinkingConfig: { thinkingBudget: 0 } });
    if (opts.tools && opts.tools.length) { body.tools = [{ functionDeclarations: opts.tools }]; body.toolConfig = { functionCallingConfig: { mode: 'AUTO' } }; }
    const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), opts.timeout || 35000);
    let r;
    try { const u = GEM + 'models/' + encodeURIComponent(model) + ':generateContent', o = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
      if (opts.bg && swReady()) { clearTimeout(tm); swNotify = opts.notify || ''; r = await bgFetch(u, o, opts.timeout || 35000); } else r = await gfetch(u, Object.assign({ signal: ctl.signal }, o)); }
    catch (e) { if (e.name === 'AbortError') throw Object.assign(new Error('The AI took too long to answer.'), { slow: true }); throw Object.assign(new Error('Couldn’t reach the AI. Are you online?'), { net: true }); }
    finally { clearTimeout(tm); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const msg = (j.error && j.error.message) || 'HTTP ' + r.status;
      /* this model doesn't take the “don't think” setting: remember, and ask again without it */
      if (r.status === 400 && !/api key/i.test(msg) && !noThink.has(model)) { noThink.add(model); return once(model, contents, opts); }
      /* still refused: ask with only the last message (an odd old chat message can make Google refuse the whole request) */
      if (r.status === 400 && !/api key/i.test(msg) && contents.length > 1 && !opts._short) { const last = contents.filter(c => c.role === 'user' && c.parts.some(p => p.text)).pop(); if (last) return once(model, [last], Object.assign({}, opts, { _short: true })); }
      throw Object.assign(new Error(r.status === 400 ? `Google refused the question (${model}): ${msg}` : msg), { status: r.status });
    }
    const cand = (j.candidates || [])[0] || {}, parts = (cand.content || {}).parts || [];
    const text = parts.filter(p => !p.thought).map(p => p.text || '').join('').trim();
    const calls = parts.filter(p => p.functionCall).map(p => ({ name: p.functionCall.name, args: p.functionCall.args || {} }));
    if (!text && !calls.length) throw Object.assign(new Error(cand.finishReason === 'SAFETY' ? 'The AI wouldn’t answer that.' : 'The AI sent back an empty answer.'), { empty: true });
    return { text, calls, parts };
  }
  /* one request with model fallback; contents in Gemini format */
  async function call(contents, opts) {
    if (!key()) throw Object.assign(new Error('No AI key yet. Add your free Gemini key in Settings → AI assistant.'), { nokey: true });
    let saved = ''; try { saved = localStorage.getItem('wl_aimodel') || ''; } catch {}
    let queue = saved && !AVOID.test(saved) && !deadList().includes(saved) ? [saved] : (await candidates()).slice(0, 4), loaded = !saved, lastErr = null;
    const tried = [];
    while (tried.length < 5) {
      const m = queue.shift();
      if (!m) { if (loaded) break; loaded = true; queue = (await candidates()).filter(n => !tried.includes(n)); continue; }
      tried.push(m);
      try { const res = await once(m, contents, opts); try { localStorage.setItem('wl_aimodel', m); } catch {} return res; }
      catch (e) {
        lastErr = e;
        if (e.slow && tried.filter(x => x).length >= 3) break;
        if (e.slow) { try { if (localStorage.getItem('wl_aimodel') === m) localStorage.removeItem('wl_aimodel'); } catch {} continue; }
        if (e.net || e.status === 401 || (e.status === 400 && /api key/i.test(e.message)) || (e.status === 403 && !/model/i.test(e.message))) break;
        if (e.status === 404 || RETIRED.test(e.message)) markDead(m);
        try { if (localStorage.getItem('wl_aimodel') === m) localStorage.removeItem('wl_aimodel'); } catch {}
      }
    }
    if (lastErr && lastErr.slow) throw Object.assign(new Error(`Gemini didn’t answer in time (tried ${K.plural(tried.length, 'model')}). Google’s AI is probably busy right now. Try again in a minute.`), { slow: true });
    throw lastErr || new Error('The AI isn’t available right now.');
  }
  const toContents = msgs => msgs.map(m => m.parts ? { role: m.role === 'assistant' || m.role === 'model' ? 'model' : 'user', parts: m.parts } : { role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: String(m.content) }] });
  /* K.ai(messages or text, { system, json }) → answer text */
  const b64 = blob => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.onerror = () => rej(r.error); r.readAsDataURL(blob); });
  /* K.ai(messages or text, { system, json, images: [Blob] }) → answer text. Images go with the last message. */
  K.ai = async (msgs, opts = {}) => {
    if (typeof msgs === 'string') msgs = [{ role: 'user', content: msgs }];
    const contents = toContents(msgs);
    for (const img of opts.images || []) contents[contents.length - 1].parts.push({ inline_data: { mime_type: /^image\/(png|jpeg|webp|heic|heif)$/.test(img.type) ? img.type : 'image/jpeg', data: await b64(img) } });
    return (await call(contents, opts)).text;
  };
  /* 🩺 AI check: every step with timings and Google's own answers (never the key), for a screenshot */
  K.aiCheck = async log => {
    const k = key(), t = () => performance.now(), sec = a => ((t() - a) / 1000).toFixed(1) + ' s';
    const one = async (label, url, opts, ms) => {
      const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), ms), a = t();
      try { const r = await fetch(url, Object.assign({ signal: ctl.signal }, opts)); const j = await r.json().catch(() => ({}));
        log(`${r.ok ? '✅' : '❌'} ${label}: ${r.status} in ${sec(a)}${r.ok ? '' : ' · ' + String((j.error && (j.error.status + ' ' + j.error.message)) || '').slice(0, 160)}`); return { r, j };
      } catch (e) { log(`❌ ${label}: ${e.name === 'AbortError' ? 'no answer after ' + ms / 1000 + ' s' : 'connection failed (' + e.message + ')'} after ${sec(a)}`); return null; }
      finally { clearTimeout(tm); }
    };
    log(`Key: starts with ${k.slice(0, 4)}…, ${k.length} characters${/\s/.test(k) ? ', HAS SPACES' : ''} · online: ${navigator.onLine} · saved model: ${localStorage.getItem('wl_aimodel') || 'none'} · skipped: ${deadList().join(', ') || 'none'} · way: ${localStorage.getItem('wl_aiauth') || 'header'}`);
    if (!k) return log('No key saved.');
    const H = { headers: { 'x-goog-api-key': k } }, U = '?key=' + encodeURIComponent(k);
    let res = await one('Model list (key in header)', GEM + 'models?pageSize=200', H, 20000), way = 'header';
    if (!res || !res.r.ok) { const r2 = await one('Model list (key in address)', GEM + 'models?pageSize=200&key=' + encodeURIComponent(k), {}, 20000); if (r2 && r2.r.ok) { res = r2; way = 'url'; } }
    if (!res || !res.r.ok) return log('Stopped: Google refused or couldn’t be reached for the model list.');
    const names = (res.j.models || []).map(m => String(m.name).replace(/^models\//, '')), flash = names.filter(n => /flash/.test(n) && !AVOID.test(n));
    log(`Models for this key: ${names.length}, usable flash: ${flash.slice(0, 8).join(', ') || 'none'}`);
    const order = await candidates().catch(() => flash);
    const body = think => JSON.stringify(Object.assign({ contents: [{ role: 'user', parts: [{ text: 'Reply with exactly: OK' }] }] }, think ? { generationConfig: { thinkingConfig: { thinkingBudget: 0 } } } : {}));
    for (const m of order.slice(0, 3)) {
      const url = GEM + 'models/' + encodeURIComponent(m) + ':generateContent' + (way === 'url' ? U : ''), hd = Object.assign({ 'Content-Type': 'application/json' }, way === 'url' ? {} : { 'x-goog-api-key': k });
      const r = await one(`${m} (no thinking)`, url, { method: 'POST', headers: hd, body: body(true) }, 40000);
      if (r && r.r.ok) { log(`   answer: “${((((r.j.candidates || [])[0] || {}).content || {}).parts || []).map(p => p.text || '').join('').slice(0, 40)}”`); continue; }
      await one(`${m} (normal)`, url, { method: 'POST', headers: hd, body: body(false) }, 40000);
    }
    log('Done.');
  };
  /* K.aiTools(messages, { system, tools }) → { text, calls: [{name,args}], parts } (messages may hold raw "parts") */
  K.aiTools = async (msgs, opts = {}) => call(toContents(msgs), opts);
  /* very small markdown → HTML for AI answers (bold, lists, paragraphs) */
  K.md = t => K.esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/^#{1,3} (.+)$/gm, '<b>$1</b>')
    .replace(/^(?:[-*] )(.+)$/gm, '<li>$1</li>').replace(/(<li>.*<\/li>\n?)+/g, m => `<ul>${m}</ul>`).replace(/\n{2,}/g, '<br><br>').replace(/\n/g, '<br>');
})();
