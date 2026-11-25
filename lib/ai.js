/* Life Hub AI (Google Gemini), using the same key you saved in the Workout app (You tab → AI coach).
   Picks a free-tier model and falls back to the next one if a model is unavailable or out of quota. */
(function () {
  const K = window.K;
  const GEM = 'https://generativelanguage.googleapis.com/v1beta/';
  const PREF = ['gemini-flash-latest', 'gemini-2.5-flash', 'gemini-flash-lite-latest', 'gemini-2.5-flash-lite', 'gemini-2.0-flash', 'gemini-2.0-flash-lite'];
  const AVOID = /embedding|image|tts|audio|live|vision|omni|computer|robotics|pro|preview|exp|thinking|aqa|learnlm|nano|veo|lyria|imagen/;
  const key = () => { try { return String(localStorage.getItem('wl_aikey') || '').replace(/^"|"$/g, '').trim(); } catch { return ''; } };
  K.aiReady = () => !!key();

  async function candidates() {
    const r = await fetch(GEM + 'models?pageSize=200', { headers: { 'x-goog-api-key': key() } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error((j.error && j.error.message) || 'HTTP ' + r.status), { status: r.status });
    const all = (j.models || []).filter(m => !m.supportedGenerationMethods || m.supportedGenerationMethods.includes('generateContent')).map(m => String(m.name).replace(/^models\//, ''));
    const out = PREF.filter(n => all.includes(n));
    all.filter(n => /^gemini-/.test(n) && !AVOID.test(n) && /flash/.test(n) && !out.includes(n)).forEach(n => out.push(n));
    return out.length ? out : PREF.slice(0, 2);
  }
  async function once(model, contents, opts) {
    const body = { contents };
    if (opts.system) body.systemInstruction = { parts: [{ text: opts.system }] };
    if (opts.json) body.generationConfig = { responseMimeType: 'application/json' };
    if (opts.tools && opts.tools.length) { body.tools = [{ functionDeclarations: opts.tools }]; body.toolConfig = { functionCallingConfig: { mode: 'AUTO' } }; }
    const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), 90000);
    let r;
    try { r = await fetch(GEM + 'models/' + encodeURIComponent(model) + ':generateContent', { method: 'POST', signal: ctl.signal, headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key() }, body: JSON.stringify(body) }); }
    catch (e) { throw Object.assign(new Error(e.name === 'AbortError' ? 'The AI took too long to answer.' : 'Couldn’t reach the AI. Are you online?'), { net: true }); }
    finally { clearTimeout(tm); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error((j.error && j.error.message) || 'HTTP ' + r.status), { status: r.status });
    const cand = (j.candidates || [])[0] || {}, parts = (cand.content || {}).parts || [];
    const text = parts.filter(p => !p.thought).map(p => p.text || '').join('').trim();
    const calls = parts.filter(p => p.functionCall).map(p => ({ name: p.functionCall.name, args: p.functionCall.args || {} }));
    if (!text && !calls.length) throw Object.assign(new Error(cand.finishReason === 'SAFETY' ? 'The AI wouldn’t answer that.' : 'The AI sent back an empty answer.'), { empty: true });
    return { text, calls, parts };
  }
  /* one request with model fallback; contents in Gemini format */
  async function call(contents, opts) {
    if (!key()) throw Object.assign(new Error('No AI key yet. Add your free Gemini key in Workout → You → AI coach.'), { nokey: true });
    let saved = ''; try { saved = localStorage.getItem('wl_aimodel') || ''; } catch {}
    let queue = saved && !AVOID.test(saved) ? [saved] : (await candidates()).slice(0, 4), loaded = !saved, lastErr = null;
    const tried = [];
    while (tried.length < 5) {
      const m = queue.shift();
      if (!m) { if (loaded) break; loaded = true; queue = (await candidates()).filter(n => !tried.includes(n)); continue; }
      tried.push(m);
      try { const res = await once(m, contents, opts); try { localStorage.setItem('wl_aimodel', m); } catch {} return res; }
      catch (e) {
        lastErr = e;
        if (e.net || e.status === 401 || (e.status === 400 && /api key/i.test(e.message)) || (e.status === 403 && !/model/i.test(e.message))) break;
        try { if (localStorage.getItem('wl_aimodel') === m) localStorage.removeItem('wl_aimodel'); } catch {}
      }
    }
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
  /* K.aiTools(messages, { system, tools }) → { text, calls: [{name,args}], parts } (messages may hold raw "parts") */
  K.aiTools = async (msgs, opts = {}) => call(toContents(msgs), opts);
  /* very small markdown → HTML for AI answers (bold, lists, paragraphs) */
  K.md = t => K.esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/^#{1,3} (.+)$/gm, '<b>$1</b>')
    .replace(/^(?:[-*] )(.+)$/gm, '<li>$1</li>').replace(/(<li>.*<\/li>\n?)+/g, m => `<ul>${m}</ul>`).replace(/\n{2,}/g, '<br><br>').replace(/\n/g, '<br>');
})();
