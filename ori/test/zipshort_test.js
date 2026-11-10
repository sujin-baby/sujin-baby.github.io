// 사진이 리뷰 건수(산 사람 수)보다 적으면 리뷰 보고 글을 안 만들고 안 보낸 보고 글은 지움, 할 일에 ⛔ (11/10 런치버스 텀블러 20건에 15장)  node zipshort_test.js <Main.js>
const { makeEnv } = require('./harness'); const vm = require('vm');
const env = makeEnv({ main: process.argv[2] }); const G = k => vm.runInContext(k, env);
const fails = [], ok = (c, m) => { if (!c) fails.push(m); };
const it = a => { let i = 0; return { hasNext: () => i < a.length, next: () => a[i++] }; };
let k = 0;
const img = () => { const n = 'cap' + (++k) + '.jpg', id = 'F' + k, t = new Date(Date.now() - 3600e3); return { getId: () => id, getName: () => n, getMimeType: () => 'image/jpeg', getLastUpdated: () => t, getDateCreated: () => t, getSize: () => k, getDescription: () => '', moveTo: () => {} }; };
const imgs = n => Array.from({ length: n }, img);
const folder = (name, files, subs) => ({ getId: () => 'D' + name, getUrl: () => 'https://drive.google.com/drive/folders/IMG', getName: () => name, getFiles: () => it(files || []), getFolders: () => it(subs || []), setSharing: () => {}, setName: () => {} });
const msgs = [], dels = [];
G("queueMsg_ = function (room, msg, kind) { __msgs.push(kind + ' | ' + msg); }"); env.__msgs = msgs;
G("obSet_ = function () {}; rvCheckFile_ = function () {}; rvCheckMsgSync_ = function (b, m) { globalThis.__CHK = m; }; rvAiSort_ = function () { return 0; }; rvCountDirs_ = function () {};");
G("withObWrite_ = function (fn) { return fn(); }");
let OB = [];
G("outboxSheet_ = function () { return { getLastRow: function () { return __OB.length + 1; }, getRange: function (r, c, nr, nc) { return { getValues: function () { return nc === 1 ? __OB.map(function (x) { return [x[0]]; }) : __OB; } }; }, deleteRow: function (r) { __DEL.push(__OB[r - 2][0]); __OB.splice(r - 2, 1); } }; }");
env.__DEL = dels;
const runs = [{ '명단 제목': '#10.27 실 런치버스 텀블러 10', '카톡방': '#10.27 실 런치버스 텀블러 10', '인원': 10, '총건수': 20, '실배송': 'Y' }, { '명단 제목': '#10.28 실 런치버스 텀블러 10', '카톡방': '#10.28 실 런치버스 텀블러 10', '인원': 10, '총건수': 20, '실배송': 'Y' }];
env.__runs = runs;
env.__props.set('RV_SID', JSON.stringify({ kind: 'mix', mix: '포토 4, 별점 16' }));
const run = (f, ob) => { msgs.length = 0; dels.length = 0; env.__f = f; env.__OB = ob; env.__props.delete('RVZIP_SID'); G("rvZip_(__f, '# 실 런치버스 텀블러 (응답)', PropertiesService.getScriptProperties(), 'SID', __runs)"); };
const typed = (p, s) => ({ parent: { getFolders: () => it([]) }, img: folder('리뷰이미지', [], [folder('포토 (' + p + '개)', imgs(p)), folder('별점 (' + s + '개)', imgs(s))]) });
const pendRep = () => [['r1', '2026-10-27', '리뷰 보고', '사장님', 'https://drive.google.com/drive/folders/IMG\n\n10.27~10.28 #실 런치버스 텀블러\n총 20건 리뷰 취합본 전달드립니다!', '대기']];
// 1) 15장 / 20명 → 보고 글 없음, 안 보낸 보고 글 지움, 할 일에 ⛔
run(typed(4, 11), pendRep());
ok(!msgs.some(m => /^리뷰 보고/.test(m)), '보고 글 만들면 안 됨 ' + JSON.stringify(msgs));
ok(dels.indexOf('r1') >= 0, '안 보낸 보고 글 지움 ' + JSON.stringify(dels));
ok(/⛔ 리뷰 20건인데 사진이 15장이에요 → 5장 빠짐/.test(String(G('globalThis.__CHK'))), '할 일 ⛔ ' + G('globalThis.__CHK'));
// 2) 20장 → 보고 글
run(typed(4, 16), []);
ok(msgs.some(m => /^리뷰 보고/.test(m) && /총 20건/.test(m)), '다 있으면 보고 글 ' + JSON.stringify(msgs));
ok(!/⛔/.test(String(G('globalThis.__CHK'))), '다 있으면 ⛔ 없음');
// 3) 이미 보낸 보고 글은 안 지움
run(typed(4, 11), pendRep().map(r => r.slice(0, 5).concat(['보냄'])));
ok(!dels.length, '보낸 보고 글은 그대로');
console.log(fails.length ? 'XX 사진 모자람 보고 막기 시험 실패:\n- ' + fails.join('\n- ') : '✓ 사진이 모자라면 리뷰 보고 막고 ⛔ 할 일 시험 통과');
process.exit(fails.length ? 1 : 0);
