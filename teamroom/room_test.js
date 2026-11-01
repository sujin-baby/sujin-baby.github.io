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
let fetched = [];
const env = {
  console, Date, JSON, Math, Object, Array, String, Number, RegExp, Error, Promise,
  PropertiesService: { getScriptProperties: () => ({ getProperty: k => props.has(k) ? props.get(k) : null, setProperty: (k, v) => props.set(k, String(v)), deleteProperty: k => props.delete(k) }) },
  CacheService: { getScriptCache: () => ({ get: k => cache.has(k) ? cache.get(k) : null, put: (k, v) => cache.set(k, v), getAll: ks => { const o = {}; ks.forEach(k => { if (cache.has(k)) o[k] = cache.get(k); }); return o; } }) },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  SpreadsheetApp: { create: () => { created++; sheets['시트1'] = new Sheet('시트1'); return ss; }, openById: () => ss },
  Utilities: { getUuid: (() => { let n = 0; return () => 'uuid-' + (++n) + '-xxxx'; })() },
  ScriptApp: { getService: () => ({ getUrl: () => 'https://room/exec' }), getProjectTriggers: () => [], newTrigger: () => ({ timeBased: () => ({ everyMinutes: () => ({ create() {} }) }) }) },
  HtmlService: { createHtmlOutput: h => ({ html: h, setTitle() { return this; } }), createTemplate: h => ({ evaluate: () => ({ setTitle() { return this; }, addMetaTag() { return this; }, setXFrameOptionsMode() { return this; } }) }), XFrameOptionsMode: {} },
  ContentService: { createTextOutput: t => ({ t, setMimeType() { return this; } }), MimeType: { JSON: 'json' } },
  UrlFetchApp: { fetch: (u, o) => { fetched.push(u); return { getContentText: () => JSON.stringify({ candidates: [{ content: { parts: [{ text: '요청 정리: 쿠팡 차단 확인' }] } }] }) }; } }
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
// 15분 넘게 답 없는 수진 글 → Gemini
props.set('GEMINI_KEY', 'AQ.test_key_xxxxxxxxxxxxxxxxxxxxxxxxxxxx');
api('owner', { api: 'send', room: '업무', text: '@피클 생성기 상세칸 줄여 줘' });
const msgs = JSON.parse(cache.get('ROOM_LAST')); msgs[msgs.length - 1].t -= 20 * 60000; cache.set('ROOM_LAST', JSON.stringify(msgs));
G('roomTick()');
const last = JSON.parse(cache.get('ROOM_LAST')).slice(-1)[0];
console.log('처음:', /준비 완료/.test(first.html), '/ 열쇠', Object.keys(keys).length, '/ 받는 이', r1.to.join(','), '/ claude 답 대기', pc.msgs.length, '→', pc2.msgs.length, '/ pickle', pp.msgs.length);
console.log('키 글 막음:', bad.ok === false, bad.error, '/ 틀린 열쇠:', wrong.error, '/ 읽기', rd.msgs.length, '개, 답 대기', JSON.stringify(rd.pending));
console.log('Gemini:', last.from, JSON.stringify(last.text));
const ok = /준비 완료/.test(first.html) && Object.keys(keys).length === 5 && r1.to.join(',') === 'claude,pickle' && pc.msgs.length === 1 && pc2.msgs.length === 0 && pp.msgs.length === 1 &&
  bad.ok === false && wrong.ok === false && rd.msgs.length === 3 && rd.pending.pickle === 1 && rd.pending.claude === 0 && last.from === 'gemini' && /@피클 돌아오면 #\d+ 확인/.test(last.text) && created === 1;
console.log(ok ? '✓ 팀룸 시험 통과' : 'XX 팀룸 시험 실패');
if (!ok) process.exit(1);
// 화면 스크립트 문법
const html = vm.runInContext('ROOM_HTML', env).replace(/<\?!=[^?]*\?>/g, '"x"');
const js = (html.match(/<script>([\s\S]*?)<\/script>/) || [])[1] || '';
try { new vm.Script(js); console.log('✓ 팀룸 화면 스크립트 문법 OK'); } catch (e) { console.log('XX 팀룸 화면 스크립트 문법 오류: ' + e.message); process.exit(1); }
