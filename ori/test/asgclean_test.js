// 배정 탭 자동 정리 (그저께 이전 진행 줄만 지움, 하루 한 번)  node asgclean_test.js <Main.js>
const H = require('./harness'); const vm = require('vm');
const env = H.makeEnv({ main: process.argv[2] }); const G = k => vm.runInContext(k, env); const LH = G('LIST_HEADER'), AH = G('ASSIGN_HEAD');
const mk = (o) => LH.map(h => o[h] !== undefined ? o[h] : '');
const t0 = new Date(); t0.setHours(0, 0, 0, 0);
const isWork = d => G('isWorkday_(new Date(' + d.getTime() + '))');
const back = (d) => { const x = new Date(d); x.setHours(12); do { x.setDate(x.getDate() - 1); } while (!isWork(x)); x.setHours(0, 0, 0, 0); return x; };
const pw = back(t0), old = back(pw), lab = d => (d.getMonth() + 1) + '.' + d.getDate();
const T = (d, n) => '#' + lab(d) + ' 실 상품' + n + ' 5 (뽀짝오리)';
env.__ss.sheets['진행목록'] = new H.Sheet('진행목록', [LH.slice(), mk({ '진행일': t0, '명단 제목': T(t0, 'A'), '시트ID': 'S1' }), mk({ '진행일': pw, '명단 제목': T(pw, 'B'), '시트ID': 'S2' }), mk({ '진행일': old, '명단 제목': T(old, 'C'), '시트ID': 'S3' })]);
const asg = new H.Sheet('배정', [AH.slice(), [T(old, 'C'), 'a'], [T(old, 'C'), 'b'], [T(pw, 'B'), 'c'], [T(t0, 'A'), 'd'], ['#' + lab(old) + ' 없는진행 3', 'e'], [T(old, 'C'), 'f'], ['날짜없는 제목', 'g']]);
asg.deleteRows = function (r, n) { this.rows.splice(r - 1, n); };
env.__ss.sheets['배정'] = asg;
const hr = Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: 'Asia/Seoul' }).format(new Date()));
if (hr < 5) { console.log('(5시 전이라 건너뜀 — 정상)'); process.exit(0); }
G('assignCleanDaily_()');
const left = asg.rows.slice(1).map(r => r[1]).join('');
const second = (G('assignCleanDaily_()'), asg.rows.length);
const ok = left === 'cdg' && second === 4;
console.log('남은 줄:', left, '(기대 cdg)', '/ 두 번째 실행은 안 지움:', second === 4);
console.log(ok ? '✓ 배정 정리 시험 통과' : 'XX 실패'); process.exit(ok ? 0 : 1);
