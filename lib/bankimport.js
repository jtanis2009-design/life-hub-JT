/* Life Hub bank import: reads the transaction file (CSV / TAB / TXT) you download from your bank's
   app or website and turns it into Money entries.
   Knows ING, Rabobank, ABN AMRO, bunq, and guesses the columns for other banks (SNS, ASN, RegioBank, Knab, Triodos...). */
(function () {
  const K = window.K;
  const B = K.bank = {};

  /* read the file: banks use UTF-8 or the older Windows encoding */
  B.readText = async file => {
    const buf = await file.arrayBuffer();
    try { return new TextDecoder('utf-8', { fatal: true }).decode(buf).replace(/^﻿/, ''); }
    catch { return new TextDecoder('windows-1252').decode(buf); }
  };

  /* split CSV with quotes; delimiter is detected */
  B.parseCsv = text => {
    const first = text.split(/\r?\n/).find(l => l.trim()) || '';
    const counts = [';', ',', '\t'].map(d => [d, (first.match(new RegExp(d === '\t' ? '\t' : '\\' + d, 'g')) || []).length]);
    const delim = counts.sort((a, b) => b[1] - a[1])[0][0];
    const rows = []; let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
      else if (c === '"') q = true;
      else if (c === delim) { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); if (row.some(x => x.trim())) rows.push(row); row = []; cell = ''; }
      else cell += c;
    }
    row.push(cell); if (row.some(x => x.trim())) rows.push(row);
    return { rows: rows.map(r => r.map(x => x.trim())), delim };
  };

  B.parseDate = s => {
    s = String(s || '').trim(); let m;
    if ((m = s.match(/^(\d{4})(\d{2})(\d{2})$/))) return `${m[1]}-${m[2]}-${m[3]}`;
    if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return `${m[1]}-${K.pad(+m[2])}-${K.pad(+m[3])}`;
    if ((m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/))) return `${m[3]}-${K.pad(+m[2])}-${K.pad(+m[1])}`;
    if ((m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2})$/))) return `20${m[3]}-${K.pad(+m[2])}-${K.pad(+m[1])}`;
    return '';
  };
  B.parseAmount = s => {
    s = String(s || '').replace(/[€\s]|EUR/gi, ''); if (!s) return NaN;
    const neg = /^-|-$|^\(.*\)$/.test(s); s = s.replace(/[-+()]/g, '');
    const lc = s.lastIndexOf(','), ld = s.lastIndexOf('.');
    if (lc > -1 && ld > -1) s = lc > ld ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
    else if (lc > -1) s = s.replace(',', '.');
    const n = parseFloat(s); return isFinite(n) ? (neg ? -n : n) : NaN;
  };

  /* make bank descriptions readable */
  B.clean = (name, desc) => {
    let n = String(name || '').trim(), d = String(desc || '').trim(), m;
    const all = (n + ' ' + d);
    if ((m = all.match(/\/NAME\/([^/]+)/i))) n = m[1];                         /* SEPA: /TRTP/.../NAME/Jan/REMI/... */
    if ((m = all.match(/\/REMI\/(?:USTD\/\/)?([^/]+)/i))) d = m[1];
    if (!n && (m = d.match(/(?:BEA|GEA)[,:]?\s*(?:Betaalpas|Apple Pay|Google Pay)?\s+(.+?)(?:,PAS\d+|\s{2,}NR:|$)/i))) n = m[1];  /* ABN card payments */
    if ((m = n.match(/^(?:BEA|GEA)[,:]?\s*(?:Betaalpas|Apple Pay|Google Pay)?\s+(.+?)(?:,PAS\d+|\s{2,}|$)/i))) n = m[1];
    if (!n && (m = d.match(/Naam:\s*(.+?)(?:\s{2,}|Omschrijving:|IBAN:|$)/i))) n = m[1];
    if ((m = d.match(/Omschrijving:\s*(.+?)(?:\s{2,}IBAN:|Kenmerk:|$)/i))) d = m[1];
    n = n.replace(/\s+/g, ' ').replace(/^(CCV|SumUp|Zettle|PAY\.nl)\s*\*?\s*/i, '').replace(/\s*\d{4,}$/, '').trim();
    d = d.replace(/\s+/g, ' ').replace(/Pasvolgnr:\s*\d+|Transactie:\s*\w+|Term:\s*\w+|Apple Pay|Google Pay|NR:\w+/gi, '').trim();
    if (!n) n = d.split(/[,/]/)[0].trim();
    return { name: n.slice(0, 60), desc: d.slice(0, 140) };
  };

  /* find which bank made the file and which column is which */
  function layout(rows, delim) {
    const h = rows[0].map(x => x.toLowerCase());
    const col = re => h.findIndex(x => re.test(x));
    /* ABN AMRO .TAB: no header; account, currency, date, start, end, date, amount, description */
    if (delim === '\t' && /^\d{8}$/.test(rows[0][2] || '') && rows[0].length >= 8)
      return { bank: 'ABN AMRO', header: false, date: 2, amount: 6, name: -1, desc: 7 };
    if (col(/^af ?bij$/) > -1)
      return { bank: 'ING', header: true, date: col(/^datum/), amount: col(/^bedrag/), sign: col(/^af ?bij$/), name: col(/naam/), desc: col(/mededeling/), counter: col(/tegenrekening/) };
    if (col(/naam tegenpartij/) > -1)
      return { bank: 'Rabobank', header: true, date: col(/^datum$/), amount: col(/^bedrag$/), name: col(/naam tegenpartij/), desc: [col(/omschrijving-1/), col(/omschrijving-2/), col(/omschrijving-3/)], counter: col(/tegenrekening/) };
    if (col(/^counterparty$/) > -1 || (col(/^amount$/) > -1 && col(/^date$/) > -1))
      return { bank: 'bunq', header: true, date: col(/^date$/), amount: col(/^amount$/), name: col(/^name$/) > -1 ? col(/^name$/) : col(/counterparty/), desc: col(/description/), counter: col(/^counterparty$/) };
    /* any other bank with a header row */
    if (h.some(x => /datum|date/.test(x)) && h.some(x => /bedrag|amount/.test(x)))
      return { bank: 'your bank', header: true, date: col(/boekdatum|transactiedatum|^datum|date/), amount: col(/bedrag|amount/), sign: col(/af ?bij|debet|credit|d\/c/), name: col(/naam|tegenpartij|counterparty|name|begunstigde/), desc: col(/omschrijving|mededeling|description|memo/), counter: col(/tegenrekening|iban tegen/) };
    /* no header: guess from the values */
    const r = rows[Math.min(1, rows.length - 1)], g = { bank: 'your bank', header: false, date: -1, amount: -1, name: -1, desc: -1 };
    r.forEach((v, i) => {
      if (g.date < 0 && B.parseDate(v)) g.date = i;
      else if (g.amount < 0 && /^[-+]?\s*[\d.]*\d[,.]\d{2}$/.test(v.replace(/\s|€/g, ''))) g.amount = i;
    });
    const texts = r.map((v, i) => [i, v]).filter(([i, v]) => i !== g.date && i !== g.amount && /[a-z]{3}/i.test(v) && !/^[A-Z]{2}\d{2}[A-Z]{4}\d+$/.test(v)).sort((a, b) => a[1].length - b[1].length);
    if (texts.length) { g.name = texts[0][0]; g.desc = texts.length > 1 ? texts[texts.length - 1][0] : -1; }
    return g.date > -1 && g.amount > -1 ? g : null;
  }

  /* returns { bank, items: [{ date, amount (positive), type 'in'|'out', name, desc, counter }] } */
  B.parse = async file => {
    const text = await B.readText(file);
    const { rows, delim } = B.parseCsv(text);
    if (rows.length < 1) throw new Error('The file is empty.');
    const L = layout(rows, delim);
    if (!L) throw new Error('I couldn’t find a date and an amount in this file. Download it as CSV from your bank.');
    const items = [];
    for (const r of rows.slice(L.header ? 1 : 0)) {
      const date = B.parseDate(r[L.date]); let amt = B.parseAmount(r[L.amount]);
      if (!date || !isFinite(amt) || amt === 0) continue;
      if (L.sign > -1 && L.sign != null) { const s = (r[L.sign] || '').toLowerCase(); if (/^(af|d|debet|debit)/.test(s)) amt = -Math.abs(amt); else if (/^(bij|c|credit)/.test(s)) amt = Math.abs(amt); }
      const desc = Array.isArray(L.desc) ? L.desc.map(i => r[i] || '').join(' ') : (L.desc > -1 ? r[L.desc] : '');
      const c = B.clean(L.name > -1 ? r[L.name] : '', desc);
      items.push({ date, amount: Math.round(Math.abs(amt) * 100) / 100, type: amt < 0 ? 'out' : 'in', name: c.name, desc: c.desc, counter: L.counter > -1 ? (r[L.counter] || '') : '' });
    }
    if (!items.length) throw new Error('No payments found in this file.');
    return { bank: L.bank, items };
  };

  /* same payment imported before? */
  B.key = t => `${t.date}|${t.type}|${(+t.amount).toFixed(2)}|${String(t.name || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 16)}`;
  /* money moved between your own accounts shouldn't count as spending */
  B.isTransfer = (t, ownIbans) => /spaarrekening|spaar ?rek|savings|oranje spaar|eigen rekening|overboeking eigen|own account|naar spaar|van spaar|bunq savings|sparen/i.test(t.name + ' ' + t.desc) || (t.counter && ownIbans.has(t.counter.replace(/\s/g, '').toUpperCase()));
})();
