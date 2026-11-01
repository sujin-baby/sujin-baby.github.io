/** ORI-ROOM 오리 팀룸 (수진·Claude·피클·GPT·Gemini가 오리방 일로 대화하는 방)
 * 로더(teamroom/Loader.gs)가 GitHub에서 받아 돌림. 저장은 이 프로젝트가 처음 열릴 때 만드는 구글 시트 '오리 팀룸'.
 * 참가자마다 열쇠(k). 화면: ?k=열쇠  /  AI용 API: ?k=열쇠&api=read|send|pending|ack  (doPost도 같은 이름)
 * 담당: Claude = ori/Main.js(관리 시트 서버·월급·보낼메시지·리뷰 사진), 피클 = guide/·ori/ext/(생성기·확장), GPT·Gemini = 의견·아이디어(코드 안 고침)
 * 아무도 답 안 하면: 수진이 업무방에 쓴 글에 15분 동안 담당 AI 답이 없으면 Gemini(키 있을 때)가 받아 적고 '답 대기'로 남김
 */
const ROOM_VER = '1';
const ROOMS = ['업무', '잡담'];
const MEMBERS = [
  { id: 'owner', name: '수진', emoji: '👑', role: '사장 · 결정' },
  { id: 'claude', name: 'Claude', emoji: '🤖', role: '관리 시트 서버·월급·보낼메시지·리뷰 사진 (ori/Main.js)' },
  { id: 'pickle', name: '피클', emoji: '🥒', role: '가이드 생성기·크롬 확장 (guide/, ori/ext/)' },
  { id: 'gpt', name: 'GPT', emoji: '💬', role: '의견·아이디어·글 다듬기 (코드 안 고침)' },
  { id: 'gemini', name: 'Gemini', emoji: '✨', role: '의견 · 다른 AI가 없을 때 받아 적기' }
];
const ROOM_RULES = [
  '업무방 = 오리방 일 (버그·고칠 것·결정). 잡담방 = 그 밖',
  '수진 말이 결정. 담당 일이면 바로 확인하고 고친 뒤 무엇을 고쳤는지 한 줄로',
  'Claude: 관리 시트·서버(ori/Main.js). 피클: 생성기·확장(guide/, ori/ext/). 남의 담당이면 고치지 말고 그 AI를 @로 부르기',
  'GPT·Gemini: 코드는 안 고침. 의견, 아이디어, 글 다듬기, 확인 질문',
  '@이름 으로 부르기 (예: @claude @피클). 답한 글은 그 AI의 "답 대기"에서 빠짐',
  '열쇠·API 키·비밀번호는 방에 쓰지 않기'
];
const MID = {}; MEMBERS.forEach(function (m) { MID[m.id] = m; });
const ALIAS = { '수진': 'owner', '사장': 'owner', 'owner': 'owner', 'claude': 'claude', '클로드': 'claude', 'pickle': 'pickle', '피클': 'pickle', 'gpt': 'gpt', '지피티': 'gpt', 'gemini': 'gemini', '제미나이': 'gemini', '모두': 'all', 'all': 'all' };

function rp_() { return PropertiesService.getScriptProperties(); }
function roomSs_() {
  const p = rp_(), id = p.getProperty('ROOM_SS');
  if (id) { try { return SpreadsheetApp.openById(id); } catch (e) {} }
  const ss = SpreadsheetApp.create('오리 팀룸');
  const m = ss.getSheets()[0]; m.setName('메시지');
  m.getRange(1, 1, 1, 6).setValues([['번호', '시각', '방', '보낸 이', '받는 이', '글']]).setFontWeight('bold');
  m.setFrozenRows(1); m.setColumnWidth(6, 700);
  ss.insertSheet('열쇠').getRange(1, 1, 1, 4).setValues([['참가자', '열쇠', '화면 링크', '메모']]).setFontWeight('bold');
  p.setProperty('ROOM_SS', ss.getId());
  return ss;
}
function keys_() { try { return JSON.parse(rp_().getProperty('ROOM_KEYS') || '{}'); } catch (e) { return {}; } }
function who_(k) { const id = keys_()[String(k || '')]; return id && MID[id] ? id : ''; }
function url_() { try { return ScriptApp.getService().getUrl(); } catch (e) { return ''; } }
// 처음 한 번: 참가자마다 열쇠를 만들고 '오리 팀룸' 시트 '열쇠' 탭에 적음 (시트는 수진 드라이브에만)
function setup_() {
  const p = rp_();
  if (p.getProperty('ROOM_KEYS')) return null;
  const ks = {}, rows = [], base = url_();
  MEMBERS.forEach(function (m) { const k = Utilities.getUuid().replace(/-/g, ''); ks[k] = m.id; rows.push([m.name + ' (' + m.id + ')', k, base + '?k=' + k, m.role]); });
  p.setProperty('ROOM_KEYS', JSON.stringify(ks));
  const ss = roomSs_();
  ss.getSheetByName('열쇠').getRange(2, 1, rows.length, 4).setValues(rows);
  try { ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'roomTick') ScriptApp.deleteTrigger(t); }); ScriptApp.newTrigger('roomTick').timeBased().everyMinutes(10).create(); } catch (e) {}
  post_('owner', '업무', '🐥 오리 팀룸을 열었어요. 규칙은 오른쪽 위 📌에 있어요.', true);
  return { owner: rows[0][2], sheet: ss.getUrl() };
}

// ---------- 메시지 ----------
function cacheMsgs_() {
  const c = CacheService.getScriptCache(), v = c.get('ROOM_LAST');
  if (v) { try { return JSON.parse(v); } catch (e) {} }
  const sh = roomSs_().getSheetByName('메시지'), lr = sh.getLastRow(), n = Math.min(Math.max(lr - 1, 0), 300);
  const out = n ? sh.getRange(lr - n + 1, 1, n, 6).getValues().map(function (r) { return { id: Number(r[0]), t: r[1] instanceof Date ? r[1].getTime() : Number(r[1]) || 0, room: String(r[2]), from: String(r[3]), to: String(r[4] || '').split(',').filter(Boolean), text: String(r[5]) }; }) : [];
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
  if (/AIza[\w-]{20,}|AQ\.[\w.-]{20,}|ghp_[\w]{20,}|sk-[\w-]{20,}/.test(text)) throw new Error('열쇠·API 키처럼 보이는 글은 못 올려요');
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const all = cacheMsgs_();   // 시트에 쓰기 전에 읽어 둠 (쓴 뒤 읽으면 새 글이 두 번 들어감)
    const sh = roomSs_().getSheetByName('메시지'), lr = sh.getLastRow();
    const id = lr >= 2 ? Number(sh.getRange(lr, 1).getValue()) + 1 : 1, to = mentions_(text, from), t = new Date();
    sh.appendRow([id, t, room, from, to.join(','), text]);
    all.push({ id: id, t: t.getTime(), room: room, from: from, to: to, text: text });
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
  if (op === 'read') {
    const since = Number(a.since || 0), room = a.room && ROOMS.indexOf(a.room) >= 0 ? a.room : '';
    const all = cacheMsgs_(), msgs = all.filter(function (m) { return m.id > since && (!room || m.room === room); }).slice(-150).map(view_);
    const pend = {}; MEMBERS.forEach(function (m) { if (m.id !== 'owner') pend[m.id] = pending_(m.id, all).length; });
    return { ok: true, me: me, rooms: ROOMS, rules: ROOM_RULES, members: members_(), pending: pend, msgs: msgs, lastId: all.length ? all[all.length - 1].id : 0, ver: ROOM_VER, gemini: !!rp_().getProperty('GEMINI_KEY') };
  }
  if (op === 'send') return post_(me, String(a.room || '업무'), a.text);
  if (op === 'pending') return { ok: true, me: me, rules: ROOM_RULES, msgs: pending_(me).map(view_) };
  if (op === 'gemini' && me === 'owner') {
    const v = String(a.key || '').trim();
    if (v === '지움') rp_().deleteProperty('GEMINI_KEY'); else if (/^[\w.\-]{30,}$/.test(v)) rp_().setProperty('GEMINI_KEY', v); else throw new Error('키 모양이 아니에요');
    return { ok: true, gemini: !!rp_().getProperty('GEMINI_KEY') };
  }
  throw new Error('모르는 요청: ' + op);
}
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function doGet(e) {
  const p = (e && e.parameter) || {};
  if (!rp_().getProperty('ROOM_KEYS')) {
    const s = setup_();
    return HtmlService.createHtmlOutput('<meta name="viewport" content="width=device-width,initial-scale=1"><div style="font-family:sans-serif;padding:24px;background:#ffe6f2;min-height:100vh"><h2>🐥 오리 팀룸 준비 완료</h2><p>수진님 링크 (즐겨찾기 해 두세요):<br><a href="' + s.owner + '">' + s.owner + '</a></p><p>다른 참가자(Claude·피클·GPT·Gemini) 열쇠는 내 드라이브 <a href="' + s.sheet + '">오리 팀룸</a> 시트 \'열쇠\' 탭에 있어요.</p></div>').setTitle('오리 팀룸');
  }
  const me = who_(p.k);
  if (p.api) { try { if (!me) throw new Error('열쇠가 틀렸어요'); return json_(api_(me, String(p.api), p)); } catch (err) { return json_({ ok: false, error: String(err.message || err) }); } }
  if (!me) {
    // 열쇠를 잃어버렸을 때: 열쇠가 적힌 시트 링크를 보여 줌 (시트는 주인 계정만 열 수 있어서 남이 봐도 괜찮음, 11/1)
    let sheet = '', owner = '';
    try { sheet = roomSs_().getUrl(); } catch (e) {}
    try { const em = Session.getEffectiveUser().getEmail(); owner = em.replace(/^(.{2}).*(@.*)$/, '$1***$2'); } catch (e) {}
    return HtmlService.createHtmlOutput('<meta name="viewport" content="width=device-width,initial-scale=1"><div style="font-family:sans-serif;padding:24px;background:#ffe6f2;min-height:100vh;color:#4a2b3c"><h2>🔒 오리 팀룸</h2><p>열쇠가 있는 링크로 들어와 주세요.</p>' + (sheet ? '<p style="margin-top:24px">수진님: 열쇠는 <a href="' + sheet + '" target="_blank">이 구글 시트</a>의 맨 아래 <b>\'열쇠\'</b> 탭에 있어요' + (owner ? ' (' + owner + ' 계정으로 열기)' : '') + '. 수진 줄 링크를 즐겨찾기 해 두세요.</p>' : '') + '</div>').setTitle('오리 팀룸');
  }
  const t = HtmlService.createTemplate(ROOM_HTML);
  t.k = p.k; t.me = me;
  return t.evaluate().setTitle('오리 팀룸').addMetaTag('viewport', 'width=device-width, initial-scale=1').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
function doPost(e) {
  try {
    let b = {}; try { b = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (x) {}
    const p = Object.assign({}, (e && e.parameter) || {}, b), me = who_(p.k);
    if (!me) throw new Error('열쇠가 틀렸어요');
    return json_(api_(me, String(p.api || 'send'), p));
  } catch (err) { return json_({ ok: false, error: String(err.message || err) }); }
}
function roomCall(k, op, a) { const me = who_(k); if (!me) throw new Error('열쇠가 틀렸어요'); return api_(me, op, a); }

// ---------- 아무도 답 안 할 때: Gemini가 받아 적기 (10분마다) ----------
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
    const res = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models/' + (rp_().getProperty('GEMINI_MODEL') || 'gemini-flash-latest') + ':generateContent', { method: 'post', contentType: 'application/json', headers: { 'x-goog-api-key': key }, payload: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }), muteHttpExceptions: true });
    const o = JSON.parse(res.getContentText() || '{}');
    reply = ((((o.candidates || [])[0] || {}).content || {}).parts || []).map(function (x) { return x.text || ''; }).join('').trim();
  } catch (e) {}
  const tgt = (m.to.length ? m.to : ['claude', 'pickle']).filter(function (x) { return x !== 'gemini'; }).map(function (x) { return '@' + (MID[x] || {}).name; }).join(' ');
  post_('gemini', '업무', (reply || '담당 AI가 아직 답이 없어서 제가 받아 적어 뒀어요.') + '\n\n📌 ' + tgt + ' 돌아오면 #' + m.id + ' 확인 부탁드려요 (답 대기에 남아 있어요)');
  done.push(m.id); rp_().setProperty('ROOM_TICKED', JSON.stringify(done.slice(-100)));
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
  <div class="card" id="gemCard" hidden><h3>✨ Gemini 받아 적기</h3><div style="font-size:12px;color:var(--soft)" id="gemSt"></div><input id="gemKey" placeholder="Gemini 키 붙여넣기" style="width:100%;margin-top:6px;border:1.5px solid var(--ink);border-radius:8px;padding:5px"><button class="btn" style="margin-top:6px" id="gemSave">저장</button></div>
 </div>
 <div class="chat">
  <div class="tabs" id="tabs"></div>
  <div class="list" id="list"></div>
  <div class="chips" id="chips"></div>
  <div class="send"><textarea id="txt" placeholder="메시지 (엔터 = 보내기, 시프트+엔터 = 줄바꿈). @claude @피클 @gpt @gemini @모두"></textarea><button class="btn on" id="go">보내기</button></div>
 </div>
</div></div><div class="toast" id="toast"></div>
<script>
const K = <?!= JSON.stringify(k) ?>, ME = <?!= JSON.stringify(me) ?>;
let room = '업무', last = 0, all = [], busy = false;
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
  if (ME === 'owner') { $('gemCard').hidden = false; $('gemSt').textContent = r.gemini ? '✓ 키 있음: 수진님 업무방 글에 담당 AI가 15분 답이 없으면 Gemini가 받아 적어요' : '키를 넣으면 담당 AI가 없을 때 Gemini가 대신 받아 적어요'; }
}
async function load() {
  if (busy) return; busy = true;
  try { const r = await call('read', { since: last }); if (r.msgs.length) { all = all.concat(r.msgs.filter(m => !all.some(x => x.id === m.id))); last = r.lastId; draw(); } side(r); }
  catch (e) { toast('불러오기 실패: ' + (e.message || e)); } finally { busy = false; }
}
async function send() {
  const t = $('txt').value.trim(); if (!t) return;
  $('go').disabled = true;
  try { await call('send', { room, text: t }); $('txt').value = ''; await load(); } catch (e) { toast('보내기 실패: ' + (e.message || e)); } finally { $('go').disabled = false; }
}
$('go').onclick = send;
$('txt').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); } });
document.addEventListener('click', e => {
  const r = e.target.dataset && e.target.dataset.r; if (r) { room = r; draw(); load(); }
  const at = e.target.dataset && e.target.dataset.at; if (at) { $('txt').value += (/\s$|^$/.test($('txt').value) ? '' : ' ') + '@' + at + ' '; $('txt').focus(); }
});
$('sideBtn').onclick = () => $('side').classList.toggle('show');
$('gemSave').onclick = async () => { try { const r = await call('gemini', { key: $('gemKey').value }); $('gemKey').value = ''; toast(r.gemini ? '✓ Gemini 키 저장' : '키 지움'); load(); } catch (e) { toast(e.message || e); } };
load(); setInterval(load, 8000);
</script></body></html>`;
