// (11/18) 명단 전달·리뷰 가이드 안전망: 보낸 명단은 글을 다시 안 만듦, 리뷰 가이드 다시 맞추기는 보낼메시지·진행목록을 한 번만 읽음  node safenet_test.js <Main.js>
const H = require('./harness'); const vm = require('vm');
const env = H.makeEnv({ main: process.argv[2] }); const G = k => vm.runInContext(k, env);
const fails = [], ok = (c, m) => { if (!c) fails.push(m); };
G(`globalThis.__C = { list: [], set: [], queue: [], reads: 0, runsRead: 0, recv: 0 };
const now = new Date();
globalThis.__RUNS = ['가 10', '나 10', '다 10', '라 10'].map(function (t, i) { return { row: i + 2, '명단 제목': '#11.18 ' + t + ' (뽀짝오리)', '진행 상태': '진행중', '마감 시각': now, '시트 링크': 'https://s/' + i, '시트ID': 'S' + i, '진행일': today_(), '카톡방': '#11.18 ' + t }; });
globalThis.__OB = [
  ['m1', '', '명단 전달', '오리명단방', '#11.18 가 10\\n옛 글', '보냄'],
  ['m2', '', '명단 전달', '오리명단방', '#11.18 나 10\\n옛 글', '대기'],
  ['m3', '', '명단 전달', '오리명단방', '#11.18 다 10\\n같은 글', '대기'],
  ['g1', '', '방 공지', '#11.18 가 10', 'GUIDE 가', '대기'],
  ['g2', '', '방 공지', '#11.18 나 10', 'GUIDE 나', '대기'],
  ['g3', '', '방 공지', '#11.18 다 10', 'GUIDE 다', '보냄']
];
outboxSheet_ = function () { return { getLastRow: function () { return __OB.length + 1; }, getRange: function () { return { getValues: function () { __C.reads++; return __OB.map(function (x) { return x.slice(); }); } }; } }; };
listMsgText_ = function (r) { __C.list.push(r['명단 제목']); return /다 10/.test(r['명단 제목']) ? '#11.18 다 10\\n같은 글' : 'NEW ' + r['명단 제목']; };
obSet_ = function (ob, id, col, val) { __C.set.push(id + '=' + val); };
queueListMsgs_ = function (r) { __C.queue.push(r['명단 제목']); };
readRuns_ = function () { __C.runsRead++; return __RUNS; };
receivers_ = function () { __C.recv++; return [{ nm: '홍길동', opt: '', n: 1 }]; };
windowOf_ = function () { return { from: 0, to: Infinity }; };`);
// 1) 명단 전달: 보낸 '가'는 글을 안 만듦, 대기 '나'는 다르면 고침, 대기 '다'는 같으면 그대로, 없는 '라'는 넣음
G('ensureListMsgs_(__RUNS)');
const C = G('__C');
ok(JSON.stringify(C.list) === JSON.stringify(['#11.18 나 10 (뽀짝오리)', '#11.18 다 10 (뽀짝오리)']), '1) 대기인 것만 글 만듦 ' + JSON.stringify(C.list));
ok(C.set.length === 1 && /^m2=NEW/.test(C.set[0]), '1) 다른 것만 고침 ' + JSON.stringify(C.set));
ok(JSON.stringify(C.queue) === JSON.stringify(['#11.18 라 10 (뽀짝오리)']), '1) 없는 건 넣음 ' + JSON.stringify(C.queue));
// 2) 리뷰 가이드 다시 맞추기: 보낼메시지 한 번, 진행목록은 안 읽음, 명단이 같으면 안 고침
G(`__C.reads = 0; __C.set.length = 0;
const P = PropertiesService.getScriptProperties();
__RUNS.slice(0, 3).forEach(function (r, i) { const kd = 'RVMSGD_' + r['시트ID'] + '_' + Utilities.formatDate(r['진행일'], CONFIG.TIMEZONE, 'yyyyMMdd'); P.setProperty('RVTXT_' + kd, 'GUIDE ' + ['가', '나', '다'][i]); P.setProperty('RVSIG_' + kd, '홍길동/'); });
globalThis.__OBC = {};
__RUNS.slice(0, 3).forEach(function (r) { refreshGuide_(r, 0, { runs: [r] }, __RUNS, __OBC); });`);
const C2 = G('__C');
ok(C2.reads === 1, '2) 보낼메시지 한 번만 읽음 ' + C2.reads);
ok(C2.runsRead === 0, '2) 진행목록 다시 안 읽음 ' + C2.runsRead);
ok(C2.recv === 2, '2) 대기인 가이드 둘만 명단 확인 ' + C2.recv);
ok(C2.set.length === 0, '2) 명단 같으면 안 고침 ' + JSON.stringify(C2.set));
// 3) 넘겨받지 않으면 예전처럼 직접 읽음
G(`__C.reads = 0; refreshGuide_(__RUNS[0], 0, { runs: [__RUNS[0]] });`);
ok(G('__C.reads') === 1 && G('__C.runsRead') === 1, '3) 혼자 부르면 직접 읽음');
if (fails.length) { console.log('✗ ' + fails.join('\n✗ ')); process.exit(1); }
console.log('✓ 명단 전달·리뷰 가이드 안전망 시험 통과');
