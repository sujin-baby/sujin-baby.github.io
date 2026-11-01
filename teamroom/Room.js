/** ORI-ROOM 오리 팀룸 (수진·Claude·피클·GPT·Gemini가 오리방 일로 대화하는 방)
 * 로더(teamroom/Loader.gs)가 GitHub에서 받아 돌림. 저장은 주인 드라이브의 파일 두 개: '오리 팀룸 대화.json', '오리 팀룸 열쇠.txt'
 *  (11/1: 구글 시트로 했더니 로더 권한에 시트가 없어 시트를 못 만듦 → 이미 허락된 드라이브 파일로. 다시 붙여넣기 필요 없음)
 * 참가자마다 열쇠(k). 화면: ?k=열쇠  /  AI용 API: ?k=열쇠&api=read|send|pending|ack  (doPost도 같은 이름)
 * 담당: Claude = ori/Main.js(관리 시트 서버·월급·보낼메시지·리뷰 사진), 피클 = guide/·ori/ext/(생성기·확장), GPT·Gemini = 의견·아이디어(코드 안 고침)
 * Gemini 바로 답하기 (11/1): 키가 있으면 수진 글에 Gemini가 바로 답함. @gemini·@모두 또는 아무도 안 부른 글 = Gemini가 답,
 *   @claude·@피클만 부른 글 = Gemini가 바로 "받아 적었어요"로 답하고 담당 AI 답 대기에 남김. 다른 AI가 @gemini로 불러도 답함.
 *   (예전 15분 받아 적기는 roomTick에 그대로 두어 혹시 놓친 글을 줍는 용도)
 */
const ROOM_VER = '4';
const ROOMS = ['업무', '잡담'];
const MEMBERS = [
  { id: 'owner', name: '수진', emoji: '👑', role: '사장 · 결정' },
  { id: 'claude', name: 'Claude', emoji: '🤖', role: '관리 시트 서버·월급·보낼메시지·리뷰 사진 (ori/Main.js)' },
  { id: 'pickle', name: '피클', emoji: '🥒', role: '가이드 생성기·크롬 확장 (guide/, ori/ext/)' },
  { id: 'gpt', name: 'GPT', emoji: '💬', role: '의견·아이디어·글 다듬기 (코드 안 고침)' },
  { id: 'gemini', name: 'Gemini', emoji: '✨', role: '바로 답하기 · 의견·정리 (코드 안 고침)' }
];
const ROOM_RULES = [
  '업무방 = 오리방 일 (버그·고칠 것·결정). 잡담방 = 그 밖',
  'Claude·피클: 들어오면 제일 먼저 "답 대기"(pending)를 보고 바로 답하기. 고치는 데 오래 걸리면 "확인했어요, ~분 뒤 알려 드릴게요" 먼저',
  '수진 말이 결정. 담당 일이면 바로 확인하고 고친 뒤 무엇을 고쳤는지 한 줄로',
  'Claude: 관리 시트·서버(ori/Main.js). 피클: 생성기·확장(guide/, ori/ext/). 남의 담당이면 고치지 말고 그 AI를 @로 부르기',
  'GPT·Gemini: 코드는 안 고침. 의견, 아이디어, 글 다듬기, 확인 질문',
  '@이름 으로 부르기 (예: @claude @피클). 답한 글은 그 AI의 "답 대기"에서 빠짐',
  '열쇠·API 키·비밀번호는 방에 쓰지 않기'
];
const MID = {}; MEMBERS.forEach(function (m) { MID[m.id] = m; });
const ALIAS = { '수진': 'owner', '사장': 'owner', 'owner': 'owner', 'claude': 'claude', '클로드': 'claude', 'pickle': 'pickle', '피클': 'pickle', 'gpt': 'gpt', '지피티': 'gpt', 'gemini': 'gemini', '제미나이': 'gemini', '모두': 'all', 'all': 'all' };

function rp_() { return PropertiesService.getScriptProperties(); }
// 드라이브 파일 (로더가 이미 드라이브 권한이 있어서 추가 허락 없이 됨)
function file_(prop, name, init) {
  const p = rp_(), id = p.getProperty(prop);
  if (id) { try { const f = DriveApp.getFileById(id); if (!f.isTrashed()) return f; } catch (e) {} }
  const f = DriveApp.createFile(name, init, 'text/plain');
  p.setProperty(prop, f.getId());
  return f;
}
function msgFile_() { return file_('ROOM_FILE', '오리 팀룸 대화.json', '[]'); }
function readAll_() { try { return JSON.parse(msgFile_().getBlob().getDataAsString('UTF-8') || '[]'); } catch (e) { return []; } }
function keys_() { try { return JSON.parse(rp_().getProperty('ROOM_KEYS') || '{}'); } catch (e) { return {}; } }
function who_(k) { const id = keys_()[String(k || '')]; return id && MID[id] ? id : ''; }
function url_() { try { return ScriptApp.getService().getUrl(); } catch (e) { return ''; } }
// 열쇠 파일: 참가자마다 화면 링크. 주인 드라이브에만 있고 주인만 열 수 있음. 없으면(지웠거나 예전에 못 만듦) 다시 만듦
function keyFile_() {
  const ks = keys_(), base = url_(), lines = ['오리 팀룸 열쇠 — 남에게 보여 주지 마세요. 참가자마다 자기 줄 링크만 전달', ''];
  MEMBERS.forEach(function (m) { const k = Object.keys(ks).filter(function (x) { return ks[x] === m.id; })[0]; if (k) lines.push(m.emoji + ' ' + m.name + ' (' + m.id + ')', '  링크: ' + base + '?k=' + k, '  열쇠: ' + k, '  담당: ' + m.role, ''); });
  lines.push('AI용 API 설명: https://github.com/sujin-baby/sujin-baby.github.io/blob/ori-dev/teamroom/README.md');
  const f = file_('ROOM_KEYFILE', '오리 팀룸 열쇠.txt', lines.join('\n'));
  if (rp_().getProperty('ROOM_KEYFILE_V') !== '2') { f.setContent(lines.join('\n')); rp_().setProperty('ROOM_KEYFILE_V', '2'); }
  return f;
}
// 처음 한 번: 참가자마다 열쇠
function setup_() {
  const p = rp_();
  if (p.getProperty('ROOM_KEYS')) return null;
  const ks = {};
  MEMBERS.forEach(function (m) { ks[Utilities.getUuid().replace(/-/g, '')] = m.id; });
  p.setProperty('ROOM_KEYS', JSON.stringify(ks));
  const kf = keyFile_();
  post_('owner', '업무', '🐥 오리 팀룸을 열었어요. 규칙은 오른쪽 위 📌에 있어요.', true);
  const ok = Object.keys(ks).filter(function (x) { return ks[x] === 'owner'; })[0];
  return { owner: url_() + '?k=' + ok, sheet: kf.getUrl() };
}

// ---------- 메시지 ----------
function cacheMsgs_() {
  const c = CacheService.getScriptCache(), v = c.get('ROOM_LAST');
  if (v) { try { return JSON.parse(v); } catch (e) {} }
  const out = readAll_().slice(-300);
  try { c.put('ROOM_LAST', JSON.stringify(out), 21600); } catch (e) {}
  return out;
}
function mentions_(text, from) {
  const to = [];
  String(text).replace(/@([A-Za-z가-힣]+)/g, function (_, w) { const id = ALIAS[w.toLowerCase()] || ALIAS[w]; if (id === 'all') MEMBERS.forEach(function (m) { if (m.id !== from && m.id !== 'owner' && to.indexOf(m.id) < 0) to.push(m.id); }); else if (id && id !== from && to.indexOf(id) < 0) to.push(id); });
  return to;
}
function post_(from, room, text, quiet) {
  text = String(text || '').trim().slice(0, 8000);
  if (!text) throw new Error('빈 글');
  if (ROOMS.indexOf(room) < 0) room = '업무';
  if (/AIza[\w-]{20,}|AQ\.[\w.-]{20,}|ghp_[\w]{20,}|sk-[\w-]{20,}|xox[abprs]-[\w-]{10,}/.test(text)) throw new Error('열쇠·API 키처럼 보이는 글은 못 올려요');
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const all = readAll_(), to = from === 'gemini' ? [] : mentions_(text, from), t = new Date();
    const id = all.length ? all[all.length - 1].id + 1 : 1;
    all.push({ id: id, t: t.getTime(), room: room, from: from, to: to, text: text });
    msgFile_().setContent(JSON.stringify(all));
    try { CacheService.getScriptCache().put('ROOM_LAST', JSON.stringify(all.slice(-300)), 21600); } catch (e) {}
    seen_(from);
    return { ok: true, id: id, to: to };
  } finally { lock.releaseLock(); }
}
function seen_(id) { try { CacheService.getScriptCache().put('SEEN_' + id, String(Date.now()), 21600); } catch (e) {} }
function members_() {
  const c = CacheService.getScriptCache(), got = c.getAll(MEMBERS.map(function (m) { return 'SEEN_' + m.id; }));
  return MEMBERS.map(function (m) { const s = Number(got['SEEN_' + m.id] || 0); return { id: m.id, name: m.name, emoji: m.emoji, role: m.role, seen: s }; });
}
// 답 대기: 그 AI를 부른 글(또는 수진이 업무방에 쓴 글 중 담당이 정해진 것) 뒤에 그 AI가 같은 방에 글을 안 썼으면
function pending_(id, msgs) {
  msgs = msgs || cacheMsgs_();
  return msgs.filter(function (m, i) {
    if (m.from === id || m.to.indexOf(id) < 0) return false;
    return !msgs.slice(i + 1).some(function (x) { return x.from === id && x.room === m.room; });
  });
}
function view_(m) { const mm = MID[m.from] || { name: m.from, emoji: '' }; return { id: m.id, t: m.t, room: m.room, from: m.from, name: mm.name, emoji: mm.emoji, to: m.to, text: m.text }; }

// ---------- 화면·API 공통 ----------
function api_(me, op, a) {
  a = a || {};
  seen_(me);
  try { const c = CacheService.getScriptCache(); if (!c.get('ROOM_TICK')) { c.put('ROOM_TICK', '1', 600); roomTick(); } } catch (e) {}
  if (op === 'read') {
    const since = Number(a.since || 0), room = a.room && ROOMS.indexOf(a.room) >= 0 ? a.room : '';
    const all = cacheMsgs_(), msgs = all.filter(function (m) { return m.id > since && (!room || m.room === room); }).slice(-150).map(view_);
    const pend = {}; MEMBERS.forEach(function (m) { if (m.id !== 'owner') pend[m.id] = pending_(m.id, all).length; });
    return { ok: true, me: me, rooms: ROOMS, rules: ROOM_RULES, members: members_(), pending: pend, msgs: msgs, lastId: all.length ? all[all.length - 1].id : 0, ver: ROOM_VER, gemini: !!rp_().getProperty('GEMINI_KEY'), gemErr: me === 'owner' ? (rp_().getProperty('GEMINI_ERR') || '').replace(/AIza[\w-]{20,}|AQ\.[\w.-]{20,}/g, '(키)') : '', slack: me === 'owner' ? slackStatus_() : null };
  }
  if (op === 'send') {
    const r = post_(me, String(a.room || '업무'), a.text);
    // 화면에서 보낸 글은 화면이 곧바로 'autoreply'를 따로 불러서 보내기가 느려지지 않게 함. API로 보낸 글은 여기서 바로 답함
    if (!a.defer) { try { r.reply = geminiNow_(r.id); } catch (e) {} }
    return r;
  }
  if (op === 'autoreply') return { ok: true, reply: geminiNow_(Number(a.id || 0)) };
  if (op === 'pending') return { ok: true, me: me, rules: ROOM_RULES, msgs: pending_(me).map(view_) };
  if (op === 'gemini' && me === 'owner') {
    const v = String(a.key || '').trim();
    if (v === '지움') rp_().deleteProperty('GEMINI_KEY'); else if (/^[\w.\-]{30,}$/.test(v)) rp_().setProperty('GEMINI_KEY', v); else throw new Error('키 모양이 아니에요');
    return { ok: true, gemini: !!rp_().getProperty('GEMINI_KEY') };
  }
  if (op === 'slack' && me === 'owner') return slackSetToken_(String(a.token || '').trim());
  throw new Error('모르는 요청: ' + op);
}
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function doGet(e) {
  const p = (e && e.parameter) || {};
  if (!rp_().getProperty('ROOM_KEYS')) {
    const s = setup_();
    return HtmlService.createHtmlOutput('<meta name="viewport" content="width=device-width,initial-scale=1"><div style="font-family:sans-serif;padding:24px;background:#ffe6f2;min-height:100vh"><h2>🐥 오리 팀룸 준비 완료</h2><p>수진님 링크 (즐겨찾기 해 두세요):<br><a href="' + s.owner + '">' + s.owner + '</a></p><p>다른 참가자(Claude·피클·GPT·Gemini) 링크는 내 드라이브 <a href="' + s.sheet + '">오리 팀룸 열쇠.txt</a> 파일에 있어요.</p></div>').setTitle('오리 팀룸');
  }
  const me = who_(p.k);
  if (p.api) { try { if (!me) throw new Error('열쇠가 틀렸어요'); return json_(api_(me, String(p.api), p)); } catch (err) { return json_({ ok: false, error: String(err.message || err) }); } }
  if (!me) {
    // 열쇠를 잃어버렸을 때: 열쇠가 적힌 시트 링크를 보여 줌 (시트는 주인 계정만 열 수 있어서 남이 봐도 괜찮음, 11/1)
    let sheet = '', owner = '';
    try { sheet = keyFile_().getUrl(); } catch (e) {}
    try { const em = Session.getEffectiveUser().getEmail(); owner = em.replace(/^(.{2}).*(@.*)$/, '$1***$2'); } catch (e) {}
    return HtmlService.createHtmlOutput('<meta name="viewport" content="width=device-width,initial-scale=1"><div style="font-family:sans-serif;padding:24px;background:#ffe6f2;min-height:100vh;color:#4a2b3c"><h2>🔒 오리 팀룸</h2><p>열쇠가 있는 링크로 들어와 주세요.</p>' + (sheet ? '<p style="margin-top:24px">수진님: 열쇠는 <a href="' + sheet + '" target="_blank">오리 팀룸 열쇠.txt</a> 파일에 있어요' + (owner ? ' (' + owner + ' 계정으로 열기)' : '') + '. 수진 줄 링크를 즐겨찾기 해 두세요.</p>' : '') + '</div>').setTitle('오리 팀룸');
  }
  const t = HtmlService.createTemplate(ROOM_HTML);
  t.k = p.k; t.me = me;
  return t.evaluate().setTitle('오리 팀룸').addMetaTag('viewport', 'width=device-width, initial-scale=1').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
function doPost(e) {
  try {
    let b = {}; try { b = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (x) {}
    const p = Object.assign({}, (e && e.parameter) || {}, b);
    if (p.slack || b.type === 'url_verification' || b.type === 'event_callback') return slackEvent_(b);
    const me = who_(p.k);
    if (!me) throw new Error('열쇠가 틀렸어요');
    return json_(api_(me, String(p.api || 'send'), p));
  } catch (err) { return json_({ ok: false, error: String(err.message || err) }); }
}
function roomCall(k, op, a) { const me = who_(k); if (!me) throw new Error('열쇠가 틀렸어요'); return api_(me, op, a); }

// ---------- Gemini ----------
// 모델이 없거나 바쁘면 다음 모델로. 마지막 오류는 GEMINI_ERR에 남겨 수진 화면에 보여 줌 (키는 안 남김)
function geminiAsk_(prompt) {
  const p = rp_(), key = p.getProperty('GEMINI_KEY');
  if (!key) return '';
  const models = [p.getProperty('GEMINI_MODEL'), 'gemini-2.5-flash', 'gemini-flash-latest', 'gemini-2.0-flash', 'gemini-2.5-flash-lite'].filter(function (m, i, a) { return m && a.indexOf(m) === i; });
  let text = '', err = '';
  for (let i = 0; i < models.length && !text; i++) {
    try {
      const res = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models/' + models[i] + ':generateContent', { method: 'post', contentType: 'application/json', headers: { 'x-goog-api-key': key }, payload: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }), muteHttpExceptions: true });
      const o = JSON.parse(res.getContentText() || '{}');
      text = ((((o.candidates || [])[0] || {}).content || {}).parts || []).map(function (x) { return x.text || ''; }).join('').trim();
      if (text) { if (p.getProperty('GEMINI_MODEL') !== models[i]) p.setProperty('GEMINI_MODEL', models[i]); }
      else err = models[i] + ': ' + ((o.error && (o.error.status + ' ' + o.error.message)) || (o.promptFeedback && JSON.stringify(o.promptFeedback)) || ('HTTP ' + (res.getResponseCode ? res.getResponseCode() : '?')));
      if (o.error && /API key|PERMISSION|UNAUTHENTICATED/i.test(o.error.status + ' ' + o.error.message)) break;
    } catch (e) { err = models[i] + ': ' + (e.message || e); }
  }
  if (text) p.deleteProperty('GEMINI_ERR'); else p.setProperty('GEMINI_ERR', new Date().toISOString().slice(11, 16) + ' ' + String(err).slice(0, 300));
  return text
    .replace(/AIza[\w-]{20,}|AQ\.[\w.-]{20,}|ghp_[\w]{20,}|sk-[\w-]{20,}|xox[abprs]-[\w-]{10,}/g, '(키 가림)');
}
function gemDone_(id) {
  const p = rp_(), done = JSON.parse(p.getProperty('ROOM_TICKED') || '[]');
  if (done.indexOf(id) >= 0) return false;
  done.push(id); p.setProperty('ROOM_TICKED', JSON.stringify(done.slice(-200)));
  return true;
}
function gemBase_(where, last, who, ctx) {
  return '너는 "오리 팀룸"의 Gemini야. 오리컴퍼니 체험단(리뷰 체험단 모집·관리) 일을 돕는 AI 팀원이고, 수진이 사장이야. 코드·시트는 못 고쳐.\n' +
    '팀: Claude=관리 시트·서버(ori/Main.js), 피클=가이드 생성기·크롬 확장, GPT=의견·글 다듬기.\n' +
    '한국어 존댓말, 짧고 쉽게(전문 용어 쓰지 말기). 모르는 건 지어내지 말고 모른다고 해. 열쇠·API 키는 절대 쓰지 마. 다른 AI를 @로 부르지 마.\n\n' +
    '지금 ' + where + ' 대화 (마지막 ' + last + '이 ' + who + '님 글):\n' + ctx + '\n\n';
}
function gemAsk2_(base, mode, what, names, hasOthers) {
  return mode === 'answer'
    ? base + '마지막 ' + what + '에 바로 답해 줘. 잡담이면 편하게, 일 얘기면 3~6줄로 요점만.' + (hasOthers ? ' ' + names + '도 불렸으니 그쪽 담당 일은 그 AI가 처리한다고 한 줄 덧붙여.' : '')
    : base + '마지막 ' + what + '은 ' + names + '에게 한 부탁인데 그 AI는 지금 자리에 없을 수 있어. 2~4줄로: ① 무슨 부탁인지 한 줄 정리 ② ' + names + '가 들어오면 바로 처리하도록 남겨 뒀다고 말하기 ③ 지금 수진님이 바로 해 볼 수 있는 게 있으면 하나만.';
}
// 글 하나에 Gemini가 바로 답함. 답 안 할 글이면 '' (키 없음 / Gemini 글 / 다른 AI끼리 대화 / 이미 답함 / 10분 지난 글)
function geminiNow_(id) {
  if (!rp_().getProperty('GEMINI_KEY')) return '';
  const all = cacheMsgs_(), m = all.filter(function (x) { return x.id === id; })[0];
  if (!m || m.from === 'gemini' || Date.now() - m.t > 10 * 60000) return '';
  const askG = m.to.indexOf('gemini') >= 0, others = m.to.filter(function (x) { return x !== 'gemini'; });
  let mode = '';
  if (askG || (m.from === 'owner' && !m.to.length)) mode = 'answer';
  else if (m.from === 'owner' && others.length) mode = 'receipt';
  if (!mode) return '';
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try { if (!gemDone_(m.id)) return ''; } finally { lock.releaseLock(); }
  const ctx = all.filter(function (x) { return x.room === m.room && x.id <= m.id; }).slice(-15).map(function (x) { return '#' + x.id + ' ' + (MID[x.from] || {}).name + ': ' + x.text; }).join('\n');
  const who = (MID[m.from] || {}).name, names = others.map(function (x) { return '@' + (MID[x] || {}).name; }).join(' ');
  const base = gemBase_(m.room + '방', '#' + m.id, who, ctx);
  const prompt = gemAsk2_(base, mode, '#' + m.id + ' 글', names, others.length);
  let reply = '';
  try { reply = geminiAsk_(prompt); } catch (e) {}
  if (!reply) reply = mode === 'answer' ? '지금 답을 못 만들었어요. 잠시 뒤 다시 불러 주세요.' : '받아 적어 뒀어요.';
  if (mode === 'receipt') reply += '\n\n📌 ' + names + ' 들어오면 #' + m.id + ' 확인 부탁드려요 (답 대기에 남아 있어요)';
  post_('gemini', m.room, reply);
  return mode;
}

// ---------- 슬랙: Gemini 봇이 #업무·#잡담 새 글에 바로 답함 (11/1) ----------
// 슬랙 앱 'Gemini' → Event Subscriptions 주소 = 웹 앱 URL?slack=1, 받는 일 = message.channels. 봇 토큰은 팀룸 화면(수진)에서 넣음.
// 남이 흉내 내는 요청 막기: 토큰으로 확인한 워크스페이스·봇 아이디가 맞는 이벤트만 처리.
// 슬랙은 3초 안에 답이 없으면 같은 이벤트를 다시 보냄 → 이벤트 번호로 한 번만 처리.
function slackApi_(method, payload, get) {
  const tok = rp_().getProperty('SLACK_TOKEN');
  if (!tok) throw new Error('슬랙 토큰 없음');
  const o = get
    ? { method: 'get', headers: { Authorization: 'Bearer ' + tok }, muteHttpExceptions: true }
    : { method: 'post', contentType: 'application/json; charset=utf-8', headers: { Authorization: 'Bearer ' + tok }, payload: JSON.stringify(payload || {}), muteHttpExceptions: true };
  const q = get ? '?' + Object.keys(payload || {}).map(function (k) { return k + '=' + encodeURIComponent(payload[k]); }).join('&') : '';
  return JSON.parse(UrlFetchApp.fetch('https://slack.com/api/' + method + q, o).getContentText() || '{}');
}
function slackStatus_() {
  const p = rp_();
  return { token: !!p.getProperty('SLACK_TOKEN'), team: p.getProperty('SLACK_TEAM_NAME') || '', url: url_() + '?slack=1', seen: Number(p.getProperty('SLACK_SEEN') || 0) };
}
function slackSetToken_(v) {
  const p = rp_();
  if (v === '지움') { ['SLACK_TOKEN', 'SLACK_TEAM', 'SLACK_BOT_USER', 'SLACK_TEAM_NAME'].forEach(function (k) { p.deleteProperty(k); }); return { ok: true, slack: slackStatus_() }; }
  if (!/^xoxb-[\w-]{20,}$/.test(v)) throw new Error('xoxb- 로 시작하는 봇 토큰이 아니에요');
  const r = JSON.parse(UrlFetchApp.fetch('https://slack.com/api/auth.test', { method: 'post', headers: { Authorization: 'Bearer ' + v }, muteHttpExceptions: true }).getContentText() || '{}');
  if (!r.ok) throw new Error('슬랙이 토큰을 안 받아요: ' + (r.error || '?'));
  p.setProperty('SLACK_TOKEN', v); p.setProperty('SLACK_TEAM', r.team_id); p.setProperty('SLACK_BOT_USER', r.user_id); p.setProperty('SLACK_TEAM_NAME', r.team || '');
  return { ok: true, slack: slackStatus_() };
}
function slackName_(uid) {
  const c = CacheService.getScriptCache(), hit = c.get('SLU_' + uid);
  if (hit) return hit;
  let n = uid;
  try { const r = slackApi_('users.info', { user: uid }, true); if (r.ok) { const u = r.user || {}; n = (u.profile && (u.profile.display_name || u.profile.real_name)) || u.real_name || u.name || uid; if (u.is_bot) n = '봇:' + n; } } catch (e) {}
  try { c.put('SLU_' + uid, n, 21600); } catch (e) {}
  return n;
}
function slackWho_(name) {
  const n = String(name).toLowerCase();
  if (/gemini|제미나이/.test(n)) return 'gemini';
  if (/claude|클로드/.test(n)) return 'claude';
  if (/pickle|피클/.test(n)) return 'pickle';
  if (/gpt|지피티/.test(n)) return 'gpt';
  return '';
}
function slackClean_(text, bot) {
  return String(text || '').replace(/<@(\w+)>/g, function (_, u) { return u === bot ? '@Gemini' : '@' + slackName_(u).replace(/^봇:/, ''); })
    .replace(/<!(channel|here|everyone)>/g, '@모두').replace(/<([^>|]+)\|([^>]+)>/g, '$2').replace(/<([^>]+)>/g, '$1');
}
function slackEvent_(b) {
  const p = rp_();
  if (b.type === 'url_verification') return ContentService.createTextOutput(String(b.challenge || '')).setMimeType(ContentService.MimeType.TEXT);
  const ok = ContentService.createTextOutput('ok');
  const team = p.getProperty('SLACK_TEAM'), bot = p.getProperty('SLACK_BOT_USER');
  if (b.type !== 'event_callback' || !team || b.team_id !== team || !(b.authorizations || []).some(function (a) { return a.user_id === bot; })) return ok;
  const ev = b.event || {};
  if (ev.type !== 'message' || ev.subtype || ev.bot_id || !ev.text || ev.user === bot) return ok;
  // 한 번만: 이벤트 번호 + 글 시각
  const c = CacheService.getScriptCache(), lock = LockService.getScriptLock(); lock.waitLock(20000);
  try { const id = 'SLE_' + (b.event_id || ev.channel + ev.ts); if (c.get(id)) return ok; c.put(id, '1', 21600); p.setProperty('SLACK_SEEN', String(Date.now())); } finally { lock.releaseLock(); }
  if (!p.getProperty('GEMINI_KEY')) return ok;
  try { slackReply_(ev, bot); } catch (e) {}
  return ok;
}
function slackReply_(ev, bot) {
  const ids = [], raw = String(ev.text);
  raw.replace(/<@(\w+)>/g, function (_, u) { const w = u === bot ? 'gemini' : slackWho_(slackName_(u)); if (w && ids.indexOf(w) < 0) ids.push(w); });
  if (/<!(channel|here|everyone)>/.test(raw)) ids.push('all');
  const text = slackClean_(raw, bot);
  mentions_(text, 'owner').forEach(function (w) { if (ids.indexOf(w) < 0) ids.push(w); });
  const askG = ids.indexOf('gemini') >= 0 || ids.indexOf('all') >= 0, others = ids.filter(function (x) { return x !== 'gemini' && x !== 'all' && MID[x]; });
  const mode = askG || !others.length ? 'answer' : 'receipt';
  // 앞 대화 (스레드 안이면 그 스레드)
  let hist = [];
  try {
    const r = ev.thread_ts ? slackApi_('conversations.replies', { channel: ev.channel, ts: ev.thread_ts, limit: 15 }, true) : slackApi_('conversations.history', { channel: ev.channel, limit: 12 }, true);
    hist = (r.messages || []).slice();
    if (!ev.thread_ts) hist.reverse();
  } catch (e) {}
  if (!hist.some(function (x) { return x.ts === ev.ts; })) hist.push(ev);
  const ctx = hist.slice(-15).map(function (x) { const n = x.user === bot ? 'Gemini' : x.user ? slackName_(x.user).replace(/^봇:/, '') : ((x.bot_profile && x.bot_profile.name) || x.username || '봇'); return n + ': ' + slackClean_(x.text, bot); }).join('\n');
  const who = slackName_(ev.user).replace(/^봇:/, ''), names = others.map(function (x) { return (MID[x] || {}).name; }).join('·');
  let reply = '';
  try { reply = geminiAsk_(gemAsk2_(gemBase_('슬랙 채널', '글', who, ctx), mode, '글', names, others.length)); } catch (e) {}
  if (!reply) reply = mode === 'answer' ? '지금 답을 못 만들었어요. 잠시 뒤 다시 불러 주세요.' : '받아 적어 뒀어요.';
  reply = reply.replace(/\*\*(.+?)\*\*/g, '*$1*').replace(/^#{1,6}\s*/gm, '');
  if (mode === 'receipt') reply += '\n\n📌 ' + names + ' 들어오면 이 글 확인 부탁드려요';
  slackApi_('chat.postMessage', { channel: ev.channel, text: reply, thread_ts: ev.thread_ts || undefined });
}

// ---------- 혹시 놓친 글: 15분 답 없으면 Gemini가 받아 적기 (화면·API를 쓸 때 10분에 한 번) ----------
function roomTick() {
  const key = rp_().getProperty('GEMINI_KEY');
  if (!key) return;
  const all = cacheMsgs_(), now = Date.now(), done = JSON.parse(rp_().getProperty('ROOM_TICKED') || '[]');
  const wait = all.filter(function (m, i) {
    if (m.from !== 'owner' || m.room !== '업무' || done.indexOf(m.id) >= 0 || now - m.t < 15 * 60000 || now - m.t > 24 * 3600000) return false;
    const after = all.slice(i + 1);
    const tgt = m.to.length ? m.to.filter(function (x) { return x !== 'gemini'; }) : ['claude', 'pickle'];
    return tgt.length && !after.some(function (x) { return tgt.indexOf(x.from) >= 0 && x.room === '업무'; }) && !after.some(function (x) { return x.from === 'gemini' && x.room === '업무'; });
  });
  if (!wait.length) return;
  const m = wait[wait.length - 1], ctx = all.filter(function (x) { return x.room === '업무'; }).slice(-12).map(function (x) { return (MID[x.from] || {}).name + ': ' + x.text; }).join('\n');
  let reply = '';
  try {
    const prompt = '너는 "오리 팀룸"의 Gemini야. 오리컴퍼니 체험단(리뷰 체험단 모집·관리) 일을 돕는 AI 팀원이야. 코드는 못 고쳐.\n담당: Claude=관리 시트 서버, 피클=가이드 생성기·크롬 확장.\n수진(사장)이 아래 마지막 글을 남겼는데 담당 AI가 15분째 답이 없어. 한국어 존댓말로 짧게(3~5줄): ① 무슨 요청인지 한 줄 정리 ② 담당 AI가 돌아오면 처리하도록 남겨 둔다고 말하기 ③ 지금 당장 수진이 해 볼 수 있는 게 있으면 하나. 모르는 건 지어내지 마.\n\n최근 대화:\n' + ctx;
    reply = geminiAsk_(prompt);
  } catch (e) {}
  const tgt = (m.to.length ? m.to : ['claude', 'pickle']).filter(function (x) { return x !== 'gemini'; }).map(function (x) { return '@' + (MID[x] || {}).name; }).join(' ');
  if (!gemDone_(m.id)) return;
  post_('gemini', '업무', (reply || '담당 AI가 아직 답이 없어서 제가 받아 적어 뒀어요.') + '\n\n📌 ' + tgt + ' 돌아오면 #' + m.id + ' 확인 부탁드려요 (답 대기에 남아 있어요)');
}

const ROOM_HTML = String.raw`<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@900&family=Noto+Sans+KR:wght@400;500;700;900&display=swap">
<style>
:root{--pink:#ff8fc0;--pink-deep:#ff5fa8;--pink-bg:#ffe6f2;--pink-line:#ffc6e0;--lav:#c9a7ff;--ink:#4a2b3c;--soft:#8a6076;--faint:#b98aa4;--card:#fff;--mint:#7fd8b5}
*{box-sizing:border-box}body{margin:0;font-family:"Noto Sans KR",-apple-system,sans-serif;color:var(--ink);background:var(--pink-bg);background-image:radial-gradient(var(--pink-line) 1.2px,transparent 1.2px);background-size:20px 20px;font-size:14px}
.wrap{max-width:1100px;margin:0 auto;padding:14px 16px;display:flex;flex-direction:column;height:100vh}
.bar{display:flex;align-items:center;justify-content:space-between;border:2px solid var(--ink);border-radius:14px;background:linear-gradient(90deg,var(--pink),var(--lav));color:#fff;padding:9px 14px;box-shadow:3px 3px 0 var(--ink)}
.bar b{font-family:Archivo,"Noto Sans KR",sans-serif;font-weight:900;font-size:17px}.bar .r{display:flex;gap:6px}
.btn{border:2px solid var(--ink);border-radius:10px;background:#fff;color:var(--ink);font-weight:700;padding:5px 10px;cursor:pointer;box-shadow:2px 2px 0 var(--ink);font-size:13px}.btn.on{background:var(--pink-deep);color:#fff}
.main{display:flex;gap:12px;margin-top:12px;flex:1;min-height:0}
.side{width:250px;flex:none;display:flex;flex-direction:column;gap:10px;overflow:auto}
.card{border:2px solid var(--ink);border-radius:14px;background:var(--card);padding:10px 12px;box-shadow:3px 3px 0 var(--ink)}
.card h3{margin:0 0 6px;font-size:13px}.mem{display:flex;gap:6px;align-items:flex-start;padding:4px 0;font-size:13px}.dot{width:9px;height:9px;border-radius:50%;background:#ddd;margin-top:5px;flex:none}.dot.on{background:var(--mint)}
.mem small{display:block;color:var(--soft);font-size:11px}.pend{background:var(--pink-deep);color:#fff;border-radius:8px;padding:0 6px;font-size:11px;margin-left:4px}
.chat{flex:1;display:flex;flex-direction:column;min-width:0}
.tabs{display:flex;gap:6px;margin-bottom:8px}
.list{flex:1;overflow:auto;border:2px solid var(--ink);border-radius:14px;background:#fffafd;padding:10px;box-shadow:3px 3px 0 var(--ink)}
.msg{margin:0 0 8px;padding:8px 10px;border-radius:12px;background:#fff;border:1.5px solid var(--pink-line);max-width:88%;white-space:pre-wrap;word-break:break-word}
.msg.mine{margin-left:auto;background:#fff0f7;border-color:var(--pink)}.msg .h{font-size:11px;color:var(--soft);margin-bottom:2px}.msg .h b{color:var(--ink);font-size:12px}
.msg.ai-claude{border-left:5px solid #9ec5ff}.msg.ai-pickle{border-left:5px solid #9be3a8}.msg.ai-gpt{border-left:5px solid #ffd27f}.msg.ai-gemini{border-left:5px solid var(--lav)}
.at{color:var(--pink-deep);font-weight:700}
.send{display:flex;gap:8px;margin-top:10px}.send textarea{flex:1;border:2px solid var(--ink);border-radius:12px;padding:8px 10px;font:inherit;resize:none;height:60px;box-shadow:2px 2px 0 var(--ink)}
.chips{display:flex;gap:5px;flex-wrap:wrap;margin-top:6px}.chip{border:1.5px solid var(--ink);border-radius:20px;background:#fff;padding:2px 9px;font-size:12px;cursor:pointer}
.rules{font-size:12px;color:var(--soft);margin:0;padding-left:16px}.rules li{margin-bottom:3px}
.toast{position:fixed;left:50%;bottom:20px;transform:translateX(-50%);background:var(--ink);color:#fff;padding:8px 14px;border-radius:10px;display:none}
@media(max-width:760px){.side{display:none}.side.show{display:flex;position:fixed;inset:60px 12px auto 12px;max-height:70vh;z-index:5;background:var(--pink-bg);padding:8px;border-radius:14px}.msg{max-width:96%}}
</style></head><body><div class="wrap">
<div class="bar"><b>🐥 오리 팀룸</b><div class="r"><button class="btn" id="sideBtn">👥 참가자·📌</button></div></div>
<div class="main">
 <div class="side" id="side">
  <div class="card"><h3>👥 참가자</h3><div id="mems"></div></div>
  <div class="card"><h3>📌 방 규칙</h3><ol class="rules" id="rules"></ol></div>
  <div class="card" id="slkCard" hidden><h3>💬 슬랙 바로 답 (Gemini)</h3><div style="font-size:12px;color:var(--soft)" id="slkSt"></div><input id="slkTok" placeholder="Gemini 슬랙 봇 토큰 (xoxb-…)" style="width:100%;margin-top:6px;border:1.5px solid var(--ink);border-radius:8px;padding:5px"><button class="btn" style="margin-top:6px" id="slkSave">저장</button><div style="font-size:11px;color:var(--soft);margin-top:6px">슬랙 이벤트 주소: <code id="slkUrl" style="word-break:break-all"></code></div></div>
  <div class="card" id="gemCard" hidden><h3>✨ Gemini 받아 적기</h3><div style="font-size:12px;color:var(--soft)" id="gemSt"></div><input id="gemKey" placeholder="Gemini 키 붙여넣기" style="width:100%;margin-top:6px;border:1.5px solid var(--ink);border-radius:8px;padding:5px"><button class="btn" style="margin-top:6px" id="gemSave">저장</button></div>
 </div>
 <div class="chat">
  <div class="tabs" id="tabs"></div>
  <div class="list" id="list"></div>
  <div id="typing" hidden style="font-size:12px;color:var(--soft);margin-top:6px">✨ Gemini가 답을 쓰는 중…</div>
  <div class="chips" id="chips"></div>
  <div class="send"><textarea id="txt" placeholder="메시지 (엔터 = 보내기, 시프트+엔터 = 줄바꿈). @claude @피클 @gpt @gemini @모두"></textarea><button class="btn on" id="go">보내기</button></div>
 </div>
</div></div><div class="toast" id="toast"></div>
<script>
const K = <?!= JSON.stringify(k) ?>, ME = <?!= JSON.stringify(me) ?>;
let room = '업무', last = 0, all = [], busy = false, GEM = false;
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const toast = t => { const e = $('toast'); e.textContent = t; e.style.display = 'block'; clearTimeout(toast.h); toast.h = setTimeout(() => e.style.display = 'none', 2500); };
const tm = t => { const d = new Date(t), n = new Date(); return (d.toDateString() === n.toDateString() ? '' : (d.getMonth() + 1) + '/' + d.getDate() + ' ') + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
function call(op, a) { return new Promise((ok, no) => google.script.run.withSuccessHandler(ok).withFailureHandler(no).roomCall(K, op, a || {})); }
function draw() {
  const box = $('list'), atEnd = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
  box.innerHTML = all.filter(m => m.room === room).map(m => '<div class="msg ' + (m.from === ME ? 'mine ' : '') + 'ai-' + m.from + '"><div class="h"><b>' + esc(m.emoji + ' ' + m.name) + '</b> · ' + tm(m.t) + ' · #' + m.id + '</div>' + esc(m.text).replace(/@([A-Za-z가-힣]+)/g, '<span class="at">@$1</span>') + '</div>').join('') || '<div style="color:var(--faint)">아직 글이 없어요</div>';
  if (atEnd) box.scrollTop = box.scrollHeight;
}
function side(r) {
  const now = Date.now();
  $('mems').innerHTML = r.members.map(m => '<div class="mem"><span class="dot' + (now - m.seen < 180000 ? ' on' : '') + '"></span><div><b>' + esc(m.emoji + ' ' + m.name) + '</b>' + (r.pending[m.id] ? '<span class="pend">답 대기 ' + r.pending[m.id] + '</span>' : '') + '<small>' + esc(m.role) + (m.seen ? ' · ' + tm(m.seen) : '') + '</small></div></div>').join('');
  $('rules').innerHTML = r.rules.map(x => '<li>' + esc(x) + '</li>').join('');
  $('tabs').innerHTML = r.rooms.map(x => '<button class="btn' + (x === room ? ' on' : '') + '" data-r="' + x + '">' + x + '방</button>').join('');
  $('chips').innerHTML = r.members.filter(m => m.id !== ME).map(m => '<span class="chip" data-at="' + (m.id === 'pickle' ? '피클' : m.id) + '">@' + esc(m.name) + '</span>').join('') + '<span class="chip" data-at="모두">@모두</span>';
  GEM = !!r.gemini;
  if (ME === 'owner' && r.slack) { $('slkCard').hidden = false; $('slkUrl').textContent = r.slack.url; $('slkSt').textContent = r.slack.token ? '✓ 연결됨' + (r.slack.team ? ' (' + r.slack.team + ')' : '') + (r.slack.seen ? ' · 마지막 슬랙 글 ' + tm(r.slack.seen) : ' · 아직 받은 슬랙 글 없음') : '토큰을 넣으면 슬랙 #업무·#잡담에 Gemini가 바로 답해요'; }
  if (ME === 'owner') { $('gemCard').hidden = false; $('gemSt').textContent = (r.gemErr ? '⚠ Gemini 오류: ' + r.gemErr + ' / ' : '') + (r.gemini ? '✓ 키 있음: 수진님 글에 Gemini가 바로 답해요. @클로드·@피클만 부르면 Gemini가 받아 적고 그 AI 답 대기에 남겨요' : '키를 넣으면 수진님 글에 Gemini가 바로 답해요'); }
}
async function load() {
  if (busy) return; busy = true;
  try { const r = await call('read', { since: last }); if (r.msgs.length) { all = all.concat(r.msgs.filter(m => !all.some(x => x.id === m.id))); last = r.lastId; draw(); } side(r); }
  catch (e) { toast('불러오기 실패: ' + (e.message || e)); } finally { busy = false; }
}
async function send() {
  const t = $('txt').value.trim(); if (!t) return;
  $('go').disabled = true;
  let sent = null;
  try { sent = await call('send', { room, text: t, defer: 1 }); $('txt').value = ''; await load(); } catch (e) { toast('보내기 실패: ' + (e.message || e)); } finally { $('go').disabled = false; }
  if (sent && sent.id && GEM) { $('typing').hidden = false; try { await call('autoreply', { id: sent.id }); } catch (e) {} $('typing').hidden = true; load(); }
}
$('go').onclick = send;
$('txt').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); } });
document.addEventListener('click', e => {
  const r = e.target.dataset && e.target.dataset.r; if (r) { room = r; draw(); load(); }
  const at = e.target.dataset && e.target.dataset.at; if (at) { $('txt').value += (/\s$|^$/.test($('txt').value) ? '' : ' ') + '@' + at + ' '; $('txt').focus(); }
});
$('sideBtn').onclick = () => $('side').classList.toggle('show');
$('slkSave').onclick = async () => { try { await call('slack', { token: $('slkTok').value }); $('slkTok').value = ''; toast('✓ 슬랙 토큰 저장'); load(); } catch (e) { toast(e.message || e); } };
$('gemSave').onclick = async () => { try { const r = await call('gemini', { key: $('gemKey').value }); $('gemKey').value = ''; toast(r.gemini ? '✓ Gemini 키 저장' : '키 지움'); load(); } catch (e) { toast(e.message || e); } };
load(); setInterval(load, 8000);
</script></body></html>`;
