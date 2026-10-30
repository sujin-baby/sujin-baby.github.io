// 한눈에(buildDashboard_): 바뀐 게 없으면 명단 시트를 하나도 안 엶 (10/31 속도)  node dashopen_test.js <Main.js>
const H = require('./harness'); const vm = require('vm');
const env = H.makeEnv({ main: process.argv[2] }); const G = k => vm.runInContext(k, env); const LH = G('LIST_HEADER');
const mk = (o) => LH.map(h => o[h] !== undefined ? o[h] : '');
const t0 = new Date(); t0.setHours(0,0,0,0);
const rows = [LH.slice(),
  mk({ '진행일': t0, '명단 제목': '#1.1 실 밴드 10 (뽀짝오리)', '시트ID': 'S1', '폼ID': 'F1', '진행 상태': '진행중', '인원': 3, '목표인원': 10, '총건수': 10, '일차': 1 }),
  mk({ '진행일': t0, '명단 제목': '#1.1 거치대 5 (뽀짝오리)', '시트ID': 'S2', '폼ID': 'F2', '진행 상태': '진행중', '인원': 1, '목표인원': 5, '총건수': 5, '일차': 1 }),
];
env.__ss.sheets['진행목록'] = new H.Sheet('진행목록', rows);
const opened = [];
env.__opened = opened;
G("(function () { const o = SpreadsheetApp.openById; SpreadsheetApp.openById = function (id) { if (id !== 'ADMIN') globalThis.__opened.push(id); return o(id); }; })()");
let e1 = '', e2 = '';
try { G('buildDashboard_(false)'); } catch (e) { e1 = String(e); }
const first = opened.length;
try { G('buildDashboard_(false)'); } catch (e) { e2 = String(e); }
const second = opened.length - first;
console.log('처음 연 시트 ' + first + '번, 두 번째 ' + second + '번' + (e1 ? ' / 오류1 ' + e1 : '') + (e2 ? ' / 오류2 ' + e2 : ''));
const ok = !e1 && !e2 && first >= 2 && second === 0;
console.log(ok ? '✓ 한눈에 시트 열기 시험 통과' : 'XX 한눈에 시트 열기 시험 실패');
process.exit(ok ? 0 : 1);
