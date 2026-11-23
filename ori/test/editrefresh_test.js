// (11/24) 폼수정 탭: B1(진행)이 지난번 불러온 것과 다르면 15분 새로고침이 다시 불러옴, 같은 진행에서 체크만 바꿨으면 그대로  node editrefresh_test.js <Main.js>
const H = require('./harness'); const vm = require('vm');
const env = H.makeEnv({ main: process.argv[2], props: { OUTBOX_SORTED: '1', OUTBOX_FMT2: '1' } }); const G = k => vm.runInContext(k, env);
const fails = [], ok = (c, m) => { if (!c) fails.push(m); };
const sh = new H.Sheet('폼수정', [['진행 선택 →', '#11.24 가짜 롱패딩 4 (뽀짝오리)'], ['', ''], ['삭제', '타임스탬프'], [false, new Date(2026, 10, 24, 6, 29)]]);
env.__ss.sheets['폼수정'] = sh;
G("globalThis.__LOADS = 0; loadEditTab_ = function () { __LOADS++; }; adminSs_ = function () { return SpreadsheetApp.getActiveSpreadsheet(); };");
// 1) 지난번 불러온 건 다른 진행 → 다시 불러옴
env.__props.set('EDIT_MARKS', '#11.24 다른 캠페인 5 (뽀짝오리)|');
G('refreshEditTab_()');
ok(G('__LOADS') === 1, 'B1이 다르면 다시 불러옴 ' + G('__LOADS'));
// 2) 같은 진행, 체크를 손으로 바꿈 → 그대로
env.__props.set('EDIT_MARKS', '#11.24 가짜 롱패딩 4 (뽀짝오리)|');
sh.rows[3][0] = true;
G('refreshEditTab_()');
ok(G('__LOADS') === 1, '같은 진행에서 체크만 바꾸면 안 불러옴 ' + G('__LOADS'));
// 3) 같은 진행, 그대로 → 새 응답 불러옴
sh.rows[3][0] = false;
G('refreshEditTab_()');
ok(G('__LOADS') === 2, '그대로면 새로 불러옴 ' + G('__LOADS'));
console.log(fails.length ? 'XX 폼수정 새로고침 시험 실패:\n- ' + fails.join('\n- ') : '✓ 폼수정 탭: 다른 진행 표가 남아 있으면 다시 불러옴 시험 통과');
process.exit(fails.length ? 1 : 0);
