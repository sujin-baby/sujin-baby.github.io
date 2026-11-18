// (11/18) 레깅스 30 되돌리기 + 같은 방제 두 개 막기  node legren_test.js <Main.js>
const H = require('./harness'); const vm = require('vm');
const env = H.makeEnv({ main: process.argv[2] }); const G = k => vm.runInContext(k, env);
const fails = [], ok = (c, m) => { if (!c) fails.push(m); };
G(`
const T30 = '#11.18 실 탄탄상점 레깅스 30', T50 = '#11.18 실 탄탄상점 레깅스 50', NK = ' (뽀짝오리)';
globalThis.__RUNS = [{ row: 9, '요청ID': 'src3cf7o', '시트ID': 'NEWS', '폼ID': 'NF', '명단 제목': T50 + NK, '진행 상태': '진행중', '목표인원': 50, '카톡방': T50 },
  { row: 17, '요청ID': 'npb3d175-2', '시트ID': 'OLDS', '폼ID': 'OF', '명단 제목': T50 + NK, '진행 상태': '진행중', '목표인원': 50, '카톡방': T50 }];
readRuns_ = function () { return __RUNS; };
globalThis.__SET = []; setRun_ = function (row, h, v) { __SET.push([row, h, v]); const r = __RUNS.filter(function (x) { return x.row === row; })[0]; if (r) r[h] = v; };
PropertiesService.getScriptProperties().setProperty('RVTXT_RVMSGD_OLDS_20261118', 'GUIDE OLD 30');
globalThis.__OB = [['m1', '', '방 공지', T50, 'GUIDE OLD 30', '대기'], ['m2', '', '방 공지', T50, '새 공지 forms.gle/nWk', '대기'], ['m3', '', '방 공지', T50, 'GUIDE OLD 30', '보냄']];
outboxSheet_ = function () { return { getLastRow: function () { return __OB.length + 1; }, getRange: function () { return { getValues: function () { return __OB.map(function (x) { return x.slice(); }); } }; } }; };
globalThis.__OBSET = []; obSet_ = function (ob, id, col, v) { __OBSET.push([id, col, v]); };
// 배정: 다른 진행 줄 + 레깅스 30 사람 묶음(바뀐 제목) + 레깅스 50 사람 묶음
const old30 = ['수현', '윤정', '정수연', '이혜미', '최아영', '김민정이', '박소영', '김지연', '이연', '최경선', '성시윤'];
const new50 = ['이혜린', '황성례', '권용인', '김현진', '성시윤', '고다경', '워니', '류가영', '조혜선', '김혜란', 'DamiU', 'MJ'];
globalThis.__AS = [['#11.18 다른 진행 10' + NK, '누구', '', 1, '', '', 'X']].concat(old30.map(function (n) { return [T50 + NK, n, '', 1, '', '', 'OLDS']; })).concat(new50.map(function (n) { return [T50 + NK, n, '', 1, '', '', 'OLDS']; }));
globalThis.__ASW = [];
assignSheet_ = function () { return { getLastRow: function () { return __AS.length + 1; }, getRange: function (r, c, nr, nc) { return { getValues: function () { return __AS.map(function (x) { return x.slice(0, nc); }); }, setValue: function (v) { for (let i = 0; i < (nr || 1); i++) { __AS[r - 2 + i][c - 1] = v; __ASW.push([r + i, c, v]); } } }; } }; };
globalThis.__REF = 0; refreshAssignFormulasOnce_ = function () { __REF++; };
SpreadsheetApp.flush = function () {};
`);
// 1) 미리보기: 안 바꿈
const d = G('legRen1_(true)');
ok(d.prob.length === 0, '1) 문제 없음 ' + JSON.stringify(d.prob));
ok(/17행 .*레깅스 50 → .*레깅스 30/.test(d.run), '1) 진행목록 ' + d.run);
ok(d.ob.length === 1 && /^m1/.test(d.ob[0]), '1) 가이드만 ' + JSON.stringify(d.ob));
ok(d.as.length === 2 && d.as.some(x => /^3~13행 .*레깅스 30으로/.test(x)) && d.as.some(x => /^14~25행 .*레깅스 50 그대로/.test(x)), '1) 배정 묶음 ' + JSON.stringify(d.as));
ok(G('__SET.length') === 0 && G('__OBSET.length') === 0 && G('__ASW.length') === 0, '1) 미리보기는 안 바꿈');
// 2) 실행
G('legRen1_(false)');
const run17 = G('__RUNS[1]');
ok(run17['명단 제목'] === '#11.18 실 탄탄상점 레깅스 30 (뽀짝오리)' && run17['목표인원'] === 30 && run17['카톡방'] === '#11.18 실 탄탄상점 레깅스 30', '2) 진행목록 되돌림 ' + JSON.stringify(run17));
ok(G('__RUNS[0]["명단 제목"]') === '#11.18 실 탄탄상점 레깅스 50 (뽀짝오리)', '2) 새 진행은 그대로');
ok(JSON.stringify(G('__OBSET')) === JSON.stringify([['m1', 4, '#11.18 실 탄탄상점 레깅스 30']]), '2) 가이드 방만 ' + JSON.stringify(G('__OBSET')));
const AS = G('__AS');
ok(AS.slice(1, 12).every(r => r[0] === '#11.18 실 탄탄상점 레깅스 30 (뽀짝오리)' && r[6] === 'OLDS'), '2) 30 사람 줄 ' + JSON.stringify(AS.slice(1, 12).map(r => r[0] + '/' + r[6])));
ok(AS.slice(12).every(r => r[0] === '#11.18 실 탄탄상점 레깅스 50 (뽀짝오리)' && r[6] === 'NEWS'), '2) 50 사람 줄은 새 명단 시트로 ' + JSON.stringify(AS.slice(12).map(r => r[6])));
ok(AS[0][0] === '#11.18 다른 진행 10 (뽀짝오리)' && AS[0][6] === 'X', '2) 다른 진행 줄 그대로');
ok(G('__REF') === 1 && /^✓/.test(env.__props.get('LEGREN1')), '2) 배정 수식 다시 + 기록');
// 3) 한 번만
G('__SET.length = 0; legRen1_(false)');
ok(G('__SET.length') === 0, '3) 다시 안 함');
// 4) 같은 방제 두 개 막기: 다른 진행이 쓰는 방제로는 안 바꿈
G("__RUNS[1]['명단 제목'] = '#11.18 실 탄탄상점 레깅스 30 (뽀짝오리)'; globalThis.__ORI_NOTES = [];");
ok(G("renameRun_(__RUNS[1], '#11.18 실 탄탄상점 레깅스 50', '시험')") === false, '4) 같은 방제로 안 바꿈');
ok(/⛔ 방제 안 바꿈/.test(JSON.stringify(G('globalThis.__ORI_NOTES'))), '4) 기록');
if (fails.length) { console.log('✗ ' + fails.join('\n✗ ')); process.exit(1); }
console.log('✓ 레깅스 30 되돌리기·같은 방제 막기 시험 통과');
