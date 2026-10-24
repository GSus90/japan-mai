/* Erkennt Restaurant/Ort aus einer TikTok-Bildunterschrift (Text von TikTok oder per Texterkennung aus einem Screenshot)
   und schlägt einen passenden Reisetag vor. Läuft komplett im Browser, ohne Konto und ohne Kosten. */
(function (root) {
  // Stadtteile → Stadt. Reihenfolge egal; Treffer im Ortsblock zählen am meisten.
  const AREAS = {
    Tokyo: ['tokyo','shibuya','shinjuku','kabukicho','harajuku','omotesando','ginza','tsukiji','toyosu','roppongi','asakusa','ueno','akihabara','ikebukuro','otsuka','nihonbashi','marunouchi','shimokitazawa','ebisu','nakameguro','meguro','daikanyama','aoyama','azabu','sangenjaya','koenji','kichijoji','yurakucho','shimbashi','shinbashi','ningyocho','kagurazaka'],
    Kyoto: ['kyoto','gion','pontocho','kawaramachi','kiyamachi','sanjo','shijo','nishiki','arashiyama','fushimi','higashiyama','kiyomizu','kinkakuji','karasuma','demachiyanagi'],
    Osaka: ['osaka','namba','dotonbori','shinsaibashi','umeda','kitashinchi','shinsekai','tennoji','tsuruhashi','kuromon','nakazakicho','honmachi','nipponbashi','abeno','kyobashi','tenma','temma'],
    Kobe: ['kobe','sannomiya','motomachi','kitano','nankinmachi','harborland','arima'],
    Nara: ['nara','naramachi'],
    Okayama: ['okayama','kurashiki'],
    Naoshima: ['naoshima'],
    Hiroshima: ['hiroshima','miyajima','itsukushima','hondori']
  };
  const AREA_LIST = Object.entries(AREAS).flatMap(([city, a]) => a.map(k => [k, city])).sort((a, b) => b[0].length - a[0].length);

  // Wo bist du mittags / abends? (Index = Tag-1). Entspricht der Route im Reiseführer.
  const SLOTS = [
    ['Tokyo','Tokyo'],['Tokyo','Tokyo'],['Tokyo','Tokyo'],['Tokyo','Tokyo'],
    ['Kyoto','Kyoto'],['Kyoto','Kyoto'],['Kyoto','Osaka'],
    ['Osaka','Osaka'],['Osaka','Osaka'],['Nara','Osaka'],
    ['Kobe','Kobe'],['Okayama','Naoshima'],['Hiroshima','Hiroshima'],['Hiroshima','Tokyo']
  ];
  // Tage, an denen du ohnehin im jeweiligen Viertel bist
  const PREF = {
    namba:[9,6], dotonbori:[9,6], shinsaibashi:[9,6], nipponbashi:[9,6], kuromon:[9,6],
    umeda:[8,7], kitashinchi:[8,7], nakazakicho:[8], shinsekai:[8], tennoji:[7,8], abeno:[7,8], kyobashi:[7], tenma:[7], temma:[7],
    gion:[4,5], pontocho:[4,5], kiyamachi:[4,5], kawaramachi:[4,5], sanjo:[4,5], shijo:[4,5], nishiki:[5], higashiyama:[5], kiyomizu:[5], arashiyama:[6], kinkakuji:[6], fushimi:[4],
    harajuku:[2], omotesando:[2], shibuya:[2,1], shinjuku:[2], kabukicho:[2], ikebukuro:[2], otsuka:[2],
    ginza:[3,0], tsukiji:[3], toyosu:[3], yurakucho:[3,0], nihonbashi:[0], marunouchi:[0], ningyocho:[0], roppongi:[1], azabu:[1], shimokitazawa:[13]
  };

  const LABEL = /(📍|📌|🏠|location|address|adress|restaurant name|shop name|store name|shop|place|name|店名|住所|場所)\s*[:：\-–|]?/i;
  const STOP_LABEL = /(🕒|🕐|⏰|💰|💴|💵|💸|🥩|🍣|🍜|⭐|✅|❌|#|\bhours?\b|\bopen(?:ing)?\b|\bclosed?\b|\bbudget\b|\bprice\b|\bcost\b|\bfeatured\b|\bmenu\b|\bmust[- ]?try\b|\border(?:ed)?\b|\brating\b|\breservation|\bbooking\b|\bwait(?:ing)?\b|\bstation\b|\baccess\b|\bpost \d)/i;
  const DAY_EN = {sun:'So',mon:'Mo',tue:'Di',wed:'Mi',thu:'Do',fri:'Fr',sat:'Sa'};

  const clean = s => String(s || '')
    .replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, ' ')
    .replace(/^[^A-Za-z0-9぀-ヿ一-龯]+|[^A-Za-z0-9぀-ヿ一-龯)'’.!&]+$/g, '')
    .replace(/\s{2,}/g, ' ').trim();

  function normalizeText(raw) {
    let t = String(raw || '').replace(/\r/g, '');
    // TikTok liefert die Beschreibung manchmal einzeilig: vor bekannten Stichworten Zeilen umbrechen
    if (t.split('\n').filter(Boolean).length <= 2) {
      t = t.replace(/\s*(📍|📌|🕒|🕐|⏰|💰|💴|💵|🥩|🍣|🍜|⭐|✅|\bLocation\b|\bAddress\b|\bHours\b|\bOpen\b|\bBudget\b|\bPrice\b|\bFeatured Menu\b|\bMenu\b|\bMust[- ]try\b|\bReservation)/g, '\n$1');
      t = t.replace(/\s+(#\w)/, '\n$1');
    }
    return t;
  }

  function cityScan(text, weight, score, hits) {
    const low = text.toLowerCase().replace(/kobe\s?beef|kobebeef|wagyu kobe/g, ' ');
    for (const [k, city] of AREA_LIST) {
      const re = new RegExp('(^|[^a-z])' + k + '(?![a-z]{3,})', 'g');
      const n = (low.match(re) || []).length;
      if (n) { score[city] = (score[city] || 0) + n * weight; hits.push(k); }
    }
  }

  const isAreaWord = w => !!w && (AREA_LIST.some(([k]) => k === w) || /^(station|city|ward|ku|shi|japan|prefecture|area|eki)$/.test(w));
  function splitNameArea(seg) {
    // „Name, Gegend“: vor dem ersten Komma steht der Name – Gegend-Wörter am Ende abschneiden
    if (/,/.test(seg)) {
      const [head, ...rest] = seg.split(',');
      const words = head.trim().split(/\s+/);
      let k = words.length;
      while (k > 1 && isAreaWord(words[k - 1].toLowerCase().replace(/[^a-z]/g, ''))) k--;
      const name = clean(words.slice(0, k).join(' '));
      if (name.length >= 2) return { name, area: clean([words.slice(k).join(' '), ...rest].filter(s => s.trim()).join(', ')) };
    }
    const low = seg.toLowerCase();
    let cut = -1, area = null;
    for (const [k] of AREA_LIST) {
      const m = new RegExp('(^|[^a-z])' + k + '(?![a-z]{3,})').exec(low);
      if (m) { const i = m.index + m[1].length; if (cut < 0 || i < cut) { cut = i; area = k; } }
    }
    if (cut > 2) return { name: clean(seg.slice(0, cut).replace(/[,(\-–|·]+\s*$/, '')), area: clean(seg.slice(cut)) };
    const parts = seg.split(/\s*[,(|·]\s*/);
    return { name: clean(parts[0]), area: clean(parts.slice(1).join(', ')) };
  }

  function sectionAfter(lines, re) {
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(re); if (!m) continue;
      let rest = lines[i].slice(m.index + m[0].length).replace(/^\s*[:：\-–]\s*/, '');
      rest = clean(rest);
      if (rest.length >= 3) return rest;
      for (let j = i + 1; j < lines.length && j <= i + 2; j++) { const c = clean(lines[j]); if (c) return c; }
    }
    return '';
  }

  function fromText(raw) {
    const text = normalizeText(raw);
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const out = { name: '', area: '', city: '', kind: 'Essen', info: '', hours: '', budget: '', closed: [], res: '', sure: false };

    // 1) Ortsblock: Zeile mit 📍/Location … plus die folgenden Zeilen bis zum nächsten Stichwort
    let loc = '';
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(LABEL);
      if (!m || /hours|budget|menu/i.test(lines[i].slice(0, m.index))) continue;
      if (/^(name)$/i.test(m[1]) && i > 0 && !/^name\b/i.test(lines[i])) continue;
      let seg = lines[i].slice(m.index + m[0].length).replace(/^\s*(location|address|place|name|shop)\s*[:：\-–|]?/i, '');
      const before = clean(lines[i].slice(0, m.index).replace(/post\s*\d+\s*\|?/i, ''));
      // „Ramen Nagi 📍 Shinjuku“: Name steht vor der Nadel
      if (m[1] === '📍' && before.length >= 3 && !STOP_LABEL.test(before)) { seg = before + ', ' + seg; }
      if (clean(seg).length < 4 || /^[a-z]{1,3},?$/i.test(clean(seg))) seg = '';
      for (let j = i + 1; j < lines.length && j <= i + 3; j++) {
        if (STOP_LABEL.test(lines[j]) || LABEL.test(lines[j])) break;
        seg += (seg ? '\n' : '') + lines[j];
      }
      if (clean(seg)) { loc = seg; break; }
    }
    if (loc) {
      const ls = loc.split('\n').map(clean).filter(Boolean);
      if (ls.length >= 2) {
        // erste Zeile = Name, falls sie nicht selbst schon die Gegend ist
        const first = splitNameArea(ls[0]);
        out.name = first.name || ls[0];
        out.area = [first.area, ...ls.slice(1)].filter(Boolean).join(', ');
      } else { const r = splitNameArea(ls[0]); out.name = r.name; out.area = r.area; }
      out.sure = !!out.name;
    }
    // 2) Kein Ortsblock: erste sinnvolle Zeile als Name (unsicher)
    if (!out.name) {
      const cand = lines.map(clean).find(l => l.length >= 3 && l.length <= 60 && !/^#/.test(l) && !STOP_LABEL.test(l) && !/^(post|part|day|tag)\s*\d+/i.test(l));
      if (cand) { const r = splitNameArea(cand); out.name = r.name; out.area = out.area || r.area; }
    }
    out.name = out.name.replace(/^(post\s*\d+\s*)/i, '').replace(/\s+(in|at|near|@|bei|im)$/i, '').replace(/\s*[|·]\s*$/, '').trim();

    // 3) Stadt: Ortsblock zählt fünffach, Text doppelt, Hashtags einfach
    const score = {}, hits = [];
    const body = lines.filter(l => !/^#/.test(l)).join('\n');
    const tags = (text.match(/#[\w぀-ヿ一-龯]+/g) || []).join(' ');
    cityScan(loc || '', 5, score, hits); cityScan(body, 2, score, hits); cityScan(tags.replace(/#/g, ' '), 1, score, hits);
    const best = Object.entries(score).sort((a, b) => b[1] - a[1])[0];
    if (best) out.city = best[0];
    out.areaKey = (loc ? [] : []).concat(hits).find(k => PREF[k]) || null;
    const locLow = (loc || '').toLowerCase();
    const locKey = Object.keys(PREF).find(k => new RegExp('(^|[^a-z])' + k).test(locLow));
    if (locKey) out.areaKey = locKey;

    // 4) Art
    const low = text.toLowerCase();
    if (/\b(temple|shrine|jinja|castle|museum|garden|park|observatory|view ?point|viewpoint|tower|onsen|market street|torii|pagoda|art ?site|gallery)\b|寺|神社|城/.test(low) && !/\b(restaurant|ramen|sushi|wagyu|yakiniku|steak|cafe|café|bakery|izakaya|udon|soba|tempura|okonomiyaki|takoyaki|menu|eat|food|dessert|bar)\b/.test(low)) out.kind = 'Sehen';
    else if (/\b(cocktail|bar|speakeasy|whisk(e)?y|sake bar|nightlife|club|highball)\b/.test(low) && !/\b(restaurant|ramen|sushi|wagyu|yakiniku|steak|cafe|bakery|menu)\b/.test(low)) out.kind = 'Abend';

    // 5) Details
    out.hours = sectionAfter(lines, /\b(hours?|open(?:ing)?(?: hours)?|営業時間)\b/i).replace(/everyday/i, 'täglich').replace(/daily/i, 'täglich');
    out.budget = sectionAfter(lines, /\b(budget|price|cost|予算)\b/i);
    const menu = sectionAfter(lines, /\b(featured menu|menu|must[- ]?try|what (?:i|we) (?:ate|ordered)|ordered)\b/i);
    const cm = low.match(/closed(?: on)?\s*[:：]?\s*((?:(?:sun|mon|tue|wed|thu|fri|sat)[a-z]*[\s,&/and]*)+)/);
    if (cm) out.closed = [...new Set((cm[1].match(/sun|mon|tue|wed|thu|fri|sat/g) || []).map(d => DAY_EN[d]))];
    if (/reservation (?:is )?(?:required|needed|essential|a must)|must (?:book|reserve)|予約必須|booking required/.test(low)) out.res = 'nötig';
    else if (/reserv|book ahead|booking|予約/.test(low)) out.res = 'empfohlen';
    out.info = [out.area && out.area.toLowerCase() !== (out.city || '').toLowerCase() ? out.area : '', out.hours, out.budget ? 'Budget ' + out.budget : '', menu].filter(Boolean).join(' · ').slice(0, 220);
    return out;
  }

  // stops(i) → Stopps des Tages i (mit zeit, typ). Liefert {day, time, why}
  function suggest(rec, stops, dayLabel, weekday) {
    const isClosed = i => weekday && rec.closed && rec.closed.includes(weekday(i));
    const hasFood = (i, from, to) => stops(i).some(s => s.typ === 'Essen' && s.zeit >= from && s.zeit <= to);
    const order = [...(PREF[rec.areaKey] || []), ...SLOTS.map((_, i) => i)].filter((v, i, a) => a.indexOf(v) === i && !isClosed(v));
    const opensLate = /\b(1[7-9]|2[0-3]):\d\d\b.*[-–~]|\b([5-9])(?::\d\d)?\s*pm\s*[-–~]/i.test(rec.hours || '') && !/\b(1[01]|12):\d\d\s*(am)?\s*[-–~]|\b(11|12)(?::\d\d)?\s*(am)\s*[-–~]/i.test(rec.hours || '');
    if (!rec.city) return { day: null, time: '', why: 'Stadt nicht erkannt – auf die Merkliste ohne Tag.' };
    if (rec.kind === 'Sehen') {
      const d = order.find(i => SLOTS[i][0] === rec.city || SLOTS[i][1] === rec.city);
      return d == null ? { day: null, time: '', why: 'Liegt nicht auf deiner Route – auf die Merkliste.' } : { day: d, time: '15:30', why: `Du bist an ${dayLabel(d)} in ${rec.city}.` };
    }
    if (rec.kind === 'Abend') {
      const d = order.find(i => SLOTS[i][1] === rec.city);
      return d == null ? { day: null, time: '', why: 'Liegt nicht auf deiner Route – auf die Merkliste.' } : { day: d, time: '21:30', why: `Du bist an ${dayLabel(d)} abends in ${rec.city}.` };
    }
    const meals = opensLate ? [['dinner', 1]] : [['lunch', 0], ['dinner', 1]];
    for (const d of order) for (const [meal, idx] of meals) {
      if (SLOTS[d][idx] !== rec.city) continue;
      const free = meal === 'lunch' ? !hasFood(d, '11:00', '14:59') : !hasFood(d, '17:00', '22:30');
      if (free) return { day: d, time: meal === 'lunch' ? '12:30' : '19:00', why: `${meal === 'lunch' ? 'Mittagessen' : 'Abendessen'} an ${dayLabel(d)} in ${rec.city} ist noch frei.` };
    }
    const d = order.find(i => SLOTS[i][1] === rec.city || SLOTS[i][0] === rec.city);
    if (d == null) return { day: null, time: '', why: 'Liegt nicht auf deiner Route – auf die Merkliste.' };
    const dinner = SLOTS[d][1] === rec.city;
    return { day: d, time: dinner ? '19:00' : '12:30', why: `In ${rec.city} ist jedes Essen schon verplant – als Alternative an ${dayLabel(d)}.` };
  }

  root.Rec = { fromText, suggest, AREAS };
})(typeof window !== 'undefined' ? window : globalThis);
