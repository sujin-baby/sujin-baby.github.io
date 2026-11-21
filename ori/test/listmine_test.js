// (11/18) 같은 날 방제 숫자만 다른 두 의뢰(레깅스 30·50)가 한 명단 전달 글을 번갈아 고치지 않게: 글 속 명단 시트 링크로 가림  node listmine_test.js <Main.js>
const H = require('./harness'); const vm = require('vm');
const env = H.makeEnv({ main: process.argv[2] }); const G = k => vm.runInContext(k, env);
const fails = [], ok = (c, m) => { if (!c) fails.push(m); };
G(`globalThis.__C = { set: [], queue: [] };
const now = new Date(), L = function (id) { return 'https://docs.google.com/spreadsheets/d/' + id + '/edit'; };
globalThis.__RUNS = [
  { row: 2, '명단 제목': '#11.18 실 탄탄상점 레깅스 30 (뽀짝오리)', '진행 상태': '진행중', '마감 시각': now, '시트 링크': L('OLD-1_a'), '시트ID': 'OLD-1_a', '진행일': today_() },
  { row: 3, '명단 제목': '#11.18 실 탄탄상점 레깅스 50 (뽀짝오리)', '진행 상태': '진행중', '마감 시각': now, '시트 링크': L('NEW-2_b'), '시트ID': 'NEW-2_b', '진행일': today_() }];
globalThis.__OB = [
  ['m1', '', '명단 전달', '오리명단방', L('OLD-1_a') + '\\n\\n#11.18 실 탄탄상점 레깅스 30 (뽀짝오리)\\n11.17~ 11.18  50건 구매완료', '보냄'],
  ['m2', '', '명단 전달', '오리명단방', L('NEW-2_b') + '\\n\\n#11.18 실 탄탄상점 레깅스 50 (뽀짝오리)\\n옛 글', '대기']];
outboxSheet_ = function () { return { getLastRow: function () { return __OB.length + 1; }, getRange: function () { return { getValues: function () { return __OB.map(function (x) { return x.slice(); }); } }; } }; };
listMsgText_ = function (r) { return r['시트 링크'] + '\\n\\n' + r['명단 제목'] + '\\n마지막'; };
obSet_ = function (ob, id, col, val) { __C.set.push(id + '=' + val); };
queueListMsgs_ = function (r) { __C.queue.push(r['명단 제목']); };`);
G('ensureListMsgs_(__RUNS)');
const C = G('__C');
ok(C.set.length === 1 && /^m2=https:\/\/docs\.google\.com\/spreadsheets\/d\/NEW-2_b\/edit\n\n#11\.18 실 탄탄상점 레깅스 50/.test(C.set[0]), '50 글만 50 내용으로 고침(30이 안 덮어씀) ' + JSON.stringify(C.set));
ok(C.queue.length === 0, '둘 다 자기 글이 있어 새로 안 넣음 ' + JSON.stringify(C.queue));
// 30 진행은 50 글(새 시트 링크)을 자기 것으로 안 봄, 50 진행은 30 글(옛 시트 링크)을 자기 것으로 안 봄
ok(G("listMsgMine_(__OB[1][4], __RUNS[0])") === false && G("listMsgMine_(__OB[0][4], __RUNS[1])") === false, '링크가 다르면 남의 글');
ok(G("listMsgMine_(__OB[0][4], __RUNS[0])") === true && G("listMsgMine_(__OB[1][4], __RUNS[1])") === true, '링크가 같으면 내 글');
// 링크 없는 옛 글·시트ID 없는 진행은 예전처럼 방제로만
ok(G("listMsgMine_('#11.18 실 탄탄상점 레깅스 30\\n옛 글', __RUNS[1])") === true, '링크 없는 글은 방제로');
ok(G("listMsgMine_(__OB[0][4], { '명단 제목': '#11.18 실 탄탄상점 레깅스 50' })") === true, '시트ID 없으면 방제로');
ok(G("listMsgMine_(__OB[0][4], { '명단 제목': '#11.19 실 탄탄상점 레깅스 30', '시트ID': 'OLD-1_a' })") === false, '날짜 다르면 남의 글');
console.log(fails.length ? 'XX 명단 전달 글 가리기 시험 실패:\n- ' + fails.join('\n- ') : '✓ 명단 전달 글 가리기(같은 날 다른 의뢰) 시험 통과');
process.exit(fails.length ? 1 : 0);
