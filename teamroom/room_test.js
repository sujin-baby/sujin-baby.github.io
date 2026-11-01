// 오리 팀룸(Room.js) 시험: 처음 열면 열쇠 만듦 → 보내기·읽기·@부르기·답 대기 → 키 같은 글 막기 → 15분 답 없으면 Gemini 받아 적기  node teamroom/room_test.js
const fs = require('fs'), vm = require('vm'), path = require('path');
const props = new Map(), cache = new Map();
function Sheet(name) { this.name = name; this.rows = []; }
Sheet.prototype = {
  setName(n) { this.name = n; return this; }, getLastRow() { return this.rows.length; },
  getRange(r, c, nr, nc) { const sh = this; nr = nr || 1; nc = nc || 1; const self = {
    setValues(v) { v.forEach((row, i) => { while (sh.rows.length < r + i) sh.rows.push([]); row.forEach((x, j) => { sh.rows[r - 1 + i][c - 1 + j] = x; }); }); return self; },
    getValues() { const out = []; for (let i = 0; i < nr; i++) { const row = sh.rows[r - 1 + i] || []; out.push(Array.from({ length: nc }, (_, j) => row[c - 1 + j] === undefined ? '' : row[c - 1 + j])); } return out; },
    getValue() { return self.getValues()[0][0]; }, setFontWeight() { return self; } }; return self; },
  appendRow(v) { this.rows.push(v); }, setFrozenRows() {}, setColumnWidth() {}
};
const sheets = {}; let created = 0;
const ss = { getSheets: () => [sheets['시트1']], getSheetByName: n => Object.values(sheets).find(s => s.name === n) || null, insertSheet: n => (sheets[n] = new Sheet(n)), getId: () => 'SS1', getUrl: () => 'https://sheet/SS1' };
let fetched = [], posted = [];
const USERS = { U1: { name: 'sujin', profile: { display_name: '수진' } }, UC: { name: 'claude', is_bot: true, profile: { real_name: '클로드' } }, UG: { name: 'gemini', is_bot: true, profile: { real_name: 'Gemini' } } };
function slackFake(u, o) {
  if (!/slack\.com\/api\//.test(u)) return null;
  const m = u.split('/api/')[1].split('?')[0];
  if (m === 'auth.test') return /xoxb-good/.test(o.headers.Authorization) ? { ok: true, team_id: 'T1', user_id: 'UG', team: '오리방 팀룸' } : { ok: false, error: 'invalid_auth' };
  if (m === 'users.info') { const id = decodeURIComponent(u.split('user=')[1]); return { ok: true, user: USERS[id] }; }
  if (m === 'conversations.history') return { ok: true, messages: [{ user: 'U1', text: '앞 글', ts: '1' }] };
  if (m === 'chat.postMessage') { posted.push(JSON.parse(o.payload)); return { ok: true }; }
  return { ok: true };
}
const env = {
  console, Date, JSON, Math, Object, Array, String, Number, RegExp, Error, Promise,
  PropertiesService: { getScriptProperties: () => ({ getProperty: k => props.has(k) ? props.get(k) : null, setProperty: (k, v) => props.set(k, String(v)), deleteProperty: k => props.delete(k) }) },
  CacheService: { getScriptCache: () => ({ get: k => cache.has(k) ? cache.get(k) : null, put: (k, v) => cache.set(k, v), getAll: ks => { const o = {}; ks.forEach(k => { if (cache.has(k)) o[k] = cache.get(k); }); return o; } }) },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  DriveApp: (() => { const files = {}; let n = 0; return { files, createFile: (name, content) => { created++; const id = 'F' + (++n); const f = { name, content, isTrashed: () => false, getId: () => id, getUrl: () => 'https://drive/' + id, setContent(c) { this.content = c; }, getBlob() { const me = this; return { getDataAsString: () => me.content }; } }; files[id] = f; return f; }, getFileById: id => { if (!files[id]) throw new Error('없음'); return files[id]; } }; })(),
  Utilities: { getUuid: (() => { let n = 0; return () => 'uuid-' + (++n) + '-xxxx'; })() },
  ScriptApp: { getService: () => ({ getUrl: () => 'https://room/exec' }), getProjectTriggers: () => [], newTrigger: () => ({ timeBased: () => ({ everyMinutes: () => ({ create() {} }) }) }) },
  Session: { getEffectiveUser: () => ({ getEmail: () => 'jinleeda1@gmail.com' }) },
  HtmlService: { createHtmlOutput: h => ({ html: h, setTitle() { return this; } }), createTemplate: h => ({ evaluate: () => ({ setTitle() { return this; }, addMetaTag() { return this; }, setXFrameOptionsMode() { return this; } }) }), XFrameOptionsMode: {} },
  ContentService: { createTextOutput: t => ({ t, setMimeType() { return this; } }), MimeType: { JSON: 'json', TEXT: 'text' } },
  UrlFetchApp: { fetch: (u, o) => { fetched.push(u); const out = slackFake(u, o); return { getContentText: () => JSON.stringify(out || { candidates: [{ content: { parts: [{ text: '요청 정리: **쿠팡** 차단 확인' }] } }] }) }; } }
};
env.globalThis = env; vm.createContext(env);
vm.runInContext(fs.readFileSync(path.join(__dirname, 'Room.js'), 'utf8'), env);
const G = s => vm.runInContext(s, env);
const first = G('doGet({ parameter: {} })');
const keys = JSON.parse(props.get('ROOM_KEYS')), kOf = id => Object.keys(keys).find(k => keys[k] === id);
const api = (id, q) => JSON.parse(G('doGet(' + JSON.stringify({ parameter: Object.assign({ k: kOf(id) }, q) }) + ')').t);
const r1 = api('owner', { api: 'send', room: '업무', text: '@클로드 @피클 쿠팡 막히는 것 봐 줘' });
const pc = api('claude', { api: 'pending' });
api('claude', { api: 'send', room: '업무', text: '확인할게요' });
const pc2 = api('claude', { api: 'pending' }), pp = api('pickle', { api: 'pending' });
const bad = api('gpt', { api: 'send', room: '업무', text: '키 AIzaSyD_abcdefghijklmnopqrstuvwx' });
const wrong = JSON.parse(G('doGet({ parameter: { k: "nope", api: "read" } })').t);
const rd = api('gpt', { api: 'read', since: 0 });
// Gemini 키가 생기면 바로 답함: @피클만 부른 글 = 받아 적기, 아무도 안 부른 글 = Gemini가 답, AI끼리 대화 = 끼어들지 않음
props.set('GEMINI_KEY', 'AQ.test_key_xxxxxxxxxxxxxxxxxxxxxxxxxxxx');
const sr = api('owner', { api: 'send', room: '업무', text: '@피클 생성기 상세칸 줄여 줘' });
const msgsNow = () => JSON.parse(cache.get('ROOM_LAST'));
const last = msgsNow().slice(-1)[0];
const ppAfter = api('pickle', { api: 'pending' }).msgs.length;
const nf = fetched.length;
api('owner', { api: 'send', room: '잡담', text: '오늘 날씨 좋다', defer: 1 });
const deferLast = msgsNow().slice(-1)[0].from;
const ar = api('owner', { api: 'autoreply', id: msgsNow().slice(-1)[0].id });
const ar2 = api('owner', { api: 'autoreply', id: msgsNow().slice(-2)[0].id });
const chat = msgsNow().slice(-1)[0];
api('pickle', { api: 'send', room: '업무', text: '@클로드 이거 봐 주세요' });
const aiAi = msgsNow().slice(-1)[0].from;
const msgs = msgsNow(); msgs.forEach(m => { m.t -= 20 * 60000; }); cache.set('ROOM_LAST', JSON.stringify(msgs));
const before = msgsNow().length; G('roomTick()'); const tickAdded = msgsNow().length - before;
console.log('바로 답:', sr.reply, last.from, JSON.stringify(last.text), '/ 피클 답 대기', ppAfter, '/ 잡담:', deferLast, ar.reply, ar2.reply, chat.from, chat.room, '/ AI끼리:', aiAi, '/ 15분 중복:', tickAdded, '/ fetch', fetched.length - nf);
const ok3 = sr.reply === 'receipt' && last.from === 'gemini' && /@피클 들어오면 #\d+ 확인/.test(last.text) && last.to.length === 0 && ppAfter === 2 &&
  deferLast === 'owner' && ar.reply === 'answer' && ar2.reply === '' && chat.from === 'gemini' && chat.room === '잡담' && aiAi === 'pickle' && tickAdded === 0;
if (!ok3) { console.log('XX Gemini 바로 답 실패'); process.exit(1); }
console.log('✓ Gemini 바로 답 통과');
console.log('처음:', /준비 완료/.test(first.html), '/ 열쇠', Object.keys(keys).length, '/ 받는 이', r1.to.join(','), '/ claude 답 대기', pc.msgs.length, '→', pc2.msgs.length, '/ pickle', pp.msgs.length);
console.log('키 글 막음:', bad.ok === false, bad.error, '/ 틀린 열쇠:', wrong.error, '/ 읽기', rd.msgs.length, '개, 답 대기', JSON.stringify(rd.pending));
const ok = /준비 완료/.test(first.html) && Object.keys(keys).length === 5 && r1.to.join(',') === 'claude,pickle' && pc.msgs.length === 1 && pc2.msgs.length === 0 && pp.msgs.length === 1 &&
  bad.ok === false && wrong.ok === false && rd.msgs.length === 3 && rd.pending.pickle === 1 && rd.pending.claude === 0 && created === 2 && /오리 팀룸 열쇠/.test(Object.values(env.DriveApp.files).map(f => f.name).join()) && /수진 \(owner\)\n  링크: https:\/\/room\/exec\?k=/.test(Object.values(env.DriveApp.files).find(f => /열쇠/.test(f.name)).content);
const kid = props.get('ROOM_KEYFILE'); delete env.DriveApp.files[kid];
const lockPage = G('doGet({ parameter: {} })').html;
const ok2 = /오리 팀룸 열쇠\.txt/.test(lockPage) && props.get('ROOM_KEYFILE') !== kid;
console.log('열쇠 파일 다시 만듦:', ok2);
if (!ok2) process.exit(1);
console.log(ok ? '✓ 팀룸 시험 통과' : 'XX 팀룸 시험 실패');
if (!ok) process.exit(1);
// 화면 스크립트 문법
const html = vm.runInContext('ROOM_HTML', env).replace(/<\?!=[^?]*\?>/g, '"x"');
const js = (html.match(/<script>([\s\S]*?)<\/script>/) || [])[1] || '';
try { new vm.Script(js); console.log('✓ 팀룸 화면 스크립트 문법 OK'); } catch (e) { console.log('XX 팀룸 화면 스크립트 문법 오류: ' + e.message); process.exit(1); }
// 슬랙: 토큰 확인 → 주소 확인(challenge) → 수진 글에 Gemini 바로 답, @클로드만 부르면 받아 적기, 같은 이벤트 두 번 와도 한 번만, 남의 워크스페이스·봇 글 무시
const post = b => G('doPost(' + JSON.stringify({ parameter: { slack: '1' }, postData: { contents: JSON.stringify(b) } }) + ')').t;
const badTok = (() => { try { api('owner', { api: 'slack', token: 'xoxb-bad-aaaaaaaaaaaaaaaaaaaaaaaa' }); return 'no error'; } catch (e) { return 'err'; } })();
const badRes = api('owner', { api: 'slack', token: 'xoxb-bad-aaaaaaaaaaaaaaaaaaaaaaaa' });
const goodRes = api('owner', { api: 'slack', token: 'xoxb-good-aaaaaaaaaaaaaaaaaaaaaaaa' });
const ownerRead = api('owner', { api: 'read' }), gptRead = api('gpt', { api: 'read' });
const ch = post({ type: 'url_verification', challenge: 'abc123' });
const ev = (id, text, extra) => Object.assign({ type: 'event_callback', team_id: 'T1', event_id: id, authorizations: [{ user_id: 'UG' }], event: Object.assign({ type: 'message', channel: 'C1', user: 'U1', text, ts: id + '.1' }, extra || {}) });
post(ev('E1', '오늘 할 일 정리해 줘')); post(ev('E1', '오늘 할 일 정리해 줘'));
post(ev('E2', '<@UC> 시트 오류 봐 줘'));
post(ev('E3', '봇 글', { bot_id: 'B1' }));
post(Object.assign(ev('E4', '남의 워크스페이스'), { team_id: 'T9' }));
post(ev('E5', '스레드 질문', { thread_ts: '9.9' }));
console.log('슬랙:', badRes.ok, goodRes.slack.token, goodRes.slack.team, '/ 수진만 주소:', !!ownerRead.slack, gptRead.slack, '/ challenge', ch, '/ 올린 글', posted.length, posted.map(x => x.text.slice(0, 30)).join(' | '));
const okS = badRes.ok === false && goodRes.slack.token === true && /\?slack=1$/.test(ownerRead.slack.url) && gptRead.slack === null && ch === 'abc123' &&
  posted.length === 3 && posted[0].text === '요청 정리: *쿠팡* 차단 확인' && /📌 Claude 들어오면/.test(posted[1].text) && posted[2].thread_ts === '9.9' && posted.every(x => x.channel === 'C1') &&
  api('owner', { api: 'send', room: '업무', text: '토큰 xoxb-1234567890-abcdefghij' }).ok === false;
console.log(okS ? '✓ 슬랙 바로 답 통과' : 'XX 슬랙 시험 실패');
if (!okS) process.exit(1);

