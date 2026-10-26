// 기대평 건수 (expCount_): 폼 '작성한 링크 묶음' 답 + 계획(EXP_MIX)  node expcount_test.js <Main.js>
const { makeEnv, Sheet } = require('./harness'); const vm = require('vm');
const env = makeEnv({ main: process.argv[2] }); const G = k => vm.runInContext(k, env); const LH = G('LIST_HEADER');
const mk = (title, day, sid) => { const o = { '진행일': day, '명단 제목': title, '플랫폼': '기대평', '시트ID': sid, '폼ID': 'F', '진행 상태': '진행중', '가격': '14000' }; return LH.map(h => o[h] === undefined ? '' : o[h]); };
env.__ss.sheets['진행목록'] = new Sheet('진행목록', [LH.slice(), mk('10.26 백발백중 도서 기대평 42', new Date(2026, 9, 26), 'S'), mk('10.27 백발백중 도서 기대평 41', new Date(2026, 9, 27), 'S'), mk('10.28 백발백중 도서 기대평 40', new Date(2026, 9, 28), 'S')]);
let resp = [];
const tab = () => ({ getFormUrl: () => 'x', getLastRow: () => resp.length + 1, getLastColumn: () => 3, getRange: (r, c, nr, nc) => ({ getValues: () => r === 1 ? [['타임스탬프', '방에 참여한 카카오톡 닉네임', '작성한 링크 묶음']] : resp.map(x => x.slice(0, nc)) }) });
env.SpreadsheetApp.openById = id => id === 'ADMIN' ? env.__ss : { getSheets: () => [tab()] };
const t = (d, h) => new Date(2026, 9, d, h);
const cases = [
  ['10.26 답 없음 3명', [], '10.26', 3, 42],
  ['10.27 답 A,A,B 3명', [[t(27, 1), 'a', 'A묶음 (14개 링크)'], [t(27, 2), 'b', 'A묶음 (14개 링크)'], [t(27, 3), 'c', 'B묶음 (13개 링크)']], '10.27', 3, 41],
  ['10.27 답 없음 3명(계획)', [], '10.27', 3, 41],
  ['10.27 A 1명만 냄', [[t(27, 1), 'a', 'A묶음 (14개 링크)']], '10.27', 1, 14],
  ['10.27 B 1명만 냄', [[t(27, 1), 'c', 'B묶음 (13개 링크)']], '10.27', 1, 13],
  ['10.27 계획과 다르게 B,B,B', [[t(27, 1), 'a', 'B묶음 (13개 링크)'], [t(27, 2), 'b', 'B묶음 (13개 링크)'], [t(27, 3), 'c', 'B묶음 (13개 링크)']], '10.27', 3, 39],
  ['10.27 응답은 10.28 것만', [[t(28, 1), 'x', 'A묶음 (14개 링크)']], '10.27', 0, 0],
  ['10.28 답 없음 3명(계획 A1 B2)', [], '10.28', 3, 40],
];
let ok = true;
cases.forEach(([name, rs, tok, n, want]) => {
  resp = rs; G('globalThis.__EXPANS = {}');
  const got = G("(function(){ const r = readRuns_().filter(function (x) { return dateTok_(x['명단 제목']) === '" + tok + "'; })[0]; return expCount_(r, " + n + "); })()");
  console.log((got === want ? 'OK ' : 'XX ') + name + ': ' + got + (got === want ? '' : ' (기대 ' + want + ')')); if (got !== want) ok = false;
});
console.log('titleCount_ 10.29 3명 =', G("titleCount_({ '명단 제목': '10.29 백발백중 도서 기대평 41', '플랫폼': '기대평' }, 3)"), '/ 11.6 =', G("expPlanCount_('11.6', 3)"));
console.log('expPer_ 가격 "14000, 13000" =', G("expPer_({ '가격': '14000, 13000' })"), '/ "14,000" =', G("expPer_({ '가격': '14,000' })"));
process.exit(ok ? 0 : 1);
