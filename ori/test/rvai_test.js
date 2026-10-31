// 리뷰 사진 AI 분류(rvAiSort_ → rvZip_): 구매 인증·같은 사진은 (압축 제외), 리뷰는 포토/텍스트/별점 폴더 → 폴더 개수로 압축 + 배정 비교 + 별점 알림
//  Gemini는 가짜(UrlFetchApp). 모델 이름 없음(404) → 다음 모델, 한도 초과(429) → 다음에 이어서.  node rvai_test.js <Main.js>
const { makeEnv } = require('./harness'); const vm = require('vm');
const env = makeEnv({ main: process.argv[2] }); const G = k => vm.runInContext(k, env);
const it = a => { let i = 0; const c = a.slice(); return { hasNext: () => i < c.length, next: () => c[i++] }; };
const old = new Date(Date.now() - 3600e3);
function Folder(name) { this.name = name; this.files = []; this.subs = []; }
Folder.prototype = { getName() { return this.name; }, setName(n) { this.name = n; }, getUrl() { return 'https://drive/' + this.name; }, getId() { return 'D_' + this.name; },
  getFiles() { return it(this.files); }, getFolders() { return it(this.subs); },
  getFoldersByName(n) { return it(this.subs.filter(s => s.name === n)); }, createFolder(n) { const f = new Folder(n); this.subs.push(f); return f; },
  getFilesByName() { return it([]); }, createFile() { return { getUrl: () => 'https://zip' }; } };
let fid = 0;
function File(name, ans, bytes) {
  this.id = 'F' + (++fid); this.name = name; this.ans = ans; this.bytes = bytes || ('b' + fid); this.desc = ''; this.parent = null;
}
File.prototype = { getId() { return this.id; }, getName() { return this.name; }, getMimeType() { return 'image/jpeg'; }, getSize() { return this.bytes.length; },
  getLastUpdated() { return old; }, getDateCreated() { return old; }, getDescription() { return this.desc; }, setDescription(d) { this.desc = d; },
  getBlob() { const me = this; return { getContentType: () => 'image/jpeg', getBytes: () => Array.from(Buffer.from(me.bytes)), setName: n => n, __ans: me.ans, __name: me.name }; },
  moveTo(f) { const p = this.parent; p.files.splice(p.files.indexOf(this), 1); f.files.push(this); this.parent = f; } };
const img = new Folder('리뷰이미지'), parent = new Folder('의뢰');
parent.subs.push(img);
const add = f => { f.parent = img; img.files.push(f); return f; };
const R = (stars, text, photo) => ({ kind: 'review', stars, text, photo });
// 포토 2, 텍스트 3, 별점 5 배정 (10명). 구매 인증 3장, 공지 1장, 같은 사진 1장 섞임. 한 명은 별 4개
for (let i = 0; i < 2; i++) add(new File('photo' + i + '.jpg', R(5, true, true)));
for (let i = 0; i < 3; i++) add(new File('text' + i + '.jpg', R(i === 0 ? 4 : 5, true, false)));
for (let i = 0; i < 5; i++) add(new File('star' + i + '.jpg', R(5, false, false)));
for (let i = 0; i < 3; i++) add(new File('buy' + i + '.jpg', { kind: 'purchase', stars: 0, text: false, photo: false }));
add(new File('notice.jpg', { kind: 'other', stars: 0, text: false, photo: false }));
const twin = img.files[0]; add(new File('photo0_copy.jpg', twin.ans, twin.bytes));
// 가짜 Gemini: 첫 모델은 404, 7번째 호출에서 한 번 429
let calls = 0, models = [];
const b64 = s => Buffer.from(s).toString('base64');
env.__byB64 = {}; img.files.forEach(f => { env.__byB64[b64(f.bytes)] = f.ans; });
env.Utilities.base64Encode = b => Buffer.from(typeof b === 'string' ? b : b.map(x => x & 255)).toString('base64');
env.UrlFetchApp = { fetch: (url, o) => {
  const m = url.match(/models\/([^:]+):/)[1]; models.push(m);
  if (m === 'gemini-flash-lite-latest') return { getResponseCode: () => 404, getContentText: () => 'not found' };
  calls++;
  if (calls === 7) return { getResponseCode: () => 429, getContentText: () => 'quota' };
  const data = JSON.parse(o.payload).contents[0].parts[1].inline_data.data, ans = env.__byB64[data];
  return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ candidates: [{ content: { parts: [{ text: '```json\n' + JSON.stringify(ans) + '\n```' }] } }] }) };
} };
let zipped = null, msgs = [];
env.Utilities.zip = (blobs, name) => { zipped = { name, blobs }; return {}; };
env.Utilities.newBlob = (s, type, name) => name;
env.Utilities.sleep = () => {};
env.__msgs = msgs;
G("queueMsg_ = function (room, msg, kind) { __msgs.push(room + ' | ' + kind + ' | ' + msg); }");
G("obSet_ = function () {}");
const room = '#10.20 실링팬 10';
env.__OB = [['g1', '2026-10-20', '방 공지', room, '🐥리뷰내용 가이드🐥\n\n포토리뷰(2명) : 가 나\n\n텍스트리뷰(3명) : 다 라 마\n\n별점(5명) : 바 사 아 자 차', '보냄']];
G("outboxSheet_ = function () { return { getLastRow: function () { return __OB.length + 1; }, getRange: function () { return { getValues: function () { return __OB; } }; } }; }");
env.__runs = [{ '명단 제목': room, '카톡방': room, '인원': 10, '총건수': 10 }];
env.__f = { img, parent };
env.__props.set('RV_SID', JSON.stringify({ kind: 'mix', mix: '포토 2, 텍스트 3, 별점 5' }));
env.__props.set('GEMINI_KEY', 'AIzaTESTKEY_xxxxxxxxxxxxxxxx');
env.__props.set('RVIMG_SID', 'D_리뷰이미지');
const run = () => G("rvZip_(__f, '#실링팬 (응답)', PropertiesService.getScriptProperties(), 'SID', __runs)");
run();
const q1 = env.__props.get('RVAI_Q'), wait1 = !!env.__props.get('GEMINI_WAIT');
env.__props.delete('GEMINI_WAIT');
run();   // 나머지 분류 → 다 나눴으면 같은 실행에서 압축
const count = n => { const f = img.subs.find(s => s.name === n || s.name.indexOf(n + ' (') === 0); return f ? f.files.length : 0; };
const names = img.subs.map(s => s.name).join(',');
const dirs = {}; (zipped ? zipped.blobs : []).forEach(b => { const d = String(b).split('/')[0]; dirs[d] = (dirs[d] || 0) + 1; });
console.log('1차 후 대기열:', q1, '/ 한도 초과 기다림:', wait1, '/ 모델 기억:', env.__props.get('GEMINI_MODEL'));
console.log('폴더:', ['포토', '텍스트', '별점', '구매인증 (압축 제외)', '기타 (압축 제외)', '같은 사진 (압축 제외)'].map(n => n + ' ' + count(n)).join(', '), '/ 맨 위 남은 것', img.files.length);
console.log('압축:', zipped && zipped.name, JSON.stringify(dirs));
console.log(msgs.join('\n'));
const todo = msgs.find(m => /리뷰 압축 확인/.test(m)) || '';
const ok = /포토 \(2개\)/.test(names) && /텍스트 \(3개\)/.test(names) && /별점 \(5개\)/.test(names) && q1 === 'SID' && wait1 && env.__props.get('GEMINI_MODEL') === 'gemini-2.5-flash-lite' &&
  count('포토') === 2 && !/\(0개\)/.test(names) && count('텍스트') === 3 && count('별점') === 5 && count('구매인증 (압축 제외)') === 3 && count('기타 (압축 제외)') === 1 && count('같은 사진 (압축 제외)') === 1 && img.files.length === 0 &&
  zipped && dirs['포토 2'] === 2 && dirs['텍스트 3'] === 3 && dirs['별점 5'] === 5 && Object.keys(dirs).length === 3 &&
  /별점이 5개가 아닌 리뷰 1장: text0\.jpg\(별 4\)/.test(todo) && /압축에서 뺀 사진: .*구매인증 3장/.test(todo) && !/실제 배정/.test(todo) && (env.__props.get('RVAI_Q') || '') === '';
// 키 없으면 아무것도 안 함 (예전처럼)
env.__props.delete('GEMINI_KEY'); const n0 = models.length;
const left = G("rvAiSort_(__f, 'SID', PropertiesService.getScriptProperties())");
const ok2 = left === 0 && models.length === n0;
// 사용법 탭 키 칸에 붙여넣기 → 저장 + 시험, 칸에는 키 대신 결과
let cell = '', toast = '';
const usage = { getName: () => '사용법', getRange: (r, c) => ({ getValue: () => c === 1 ? G('GEMINI_CELL_LABEL') : cell }) };
env.__ev = { value: 'AQ.Ab8RN_NEWKEY-yyyyyyyyyyyyyyyyyyyy', range: { getSheet: () => usage, getColumn: () => 2, getRow: () => 5, getNumRows: () => 1, setValue: v => { cell = v; }, getValue: () => cell }, source: { toast: m => { toast = m; } } };
env.UrlFetchApp = { fetch: () => ({ getResponseCode: () => 200, getContentText: () => JSON.stringify({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }) }) };
G('onAdminEdit(__ev)');
const ok3 = env.__props.get('GEMINI_KEY') === 'AQ.Ab8RN_NEWKEY-yyyyyyyyyyyyyyyyyyyy' && /✓ 키 넣음 \(…yyyy\)/.test(cell) && cell.indexOf('AQ.Ab8RN') < 0 && /잘 돼요/.test(toast);
console.log('키 칸:', cell, '/', toast);
const okAll = ok && ok2 && ok3;
console.log(okAll ? '✓ 리뷰 사진 AI 분류 시험 통과' : 'XX 리뷰 사진 AI 분류 시험 실패');
process.exit(okAll ? 0 : 1);
