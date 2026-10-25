// 일정 탭 기대평 옛 계획 지우기 (expPlanCleanOnce_)  node clean_test.js <Main.js> <diag all.json>
const { makeEnv, Sheet } = require('./harness'); const vm = require('vm');
const data = require(require('path').resolve(process.argv[3]));
const env = makeEnv({ main: process.argv[2] }); const G = k => vm.runInContext(k, env); const PH = G('PLAN_HEAD');
const D = s => { const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : s; };
const pl = [PH.slice()]; data.plans.forEach(x => pl.push([x.id, x.camp, x.k, D(x.day), x.room, x.title, x.n, '[]', x.st, '{}'])); env.__ss.sheets['일정'] = new Sheet('일정', pl);
env.__ss.sheets['진행목록'] = new Sheet('진행목록', [G('LIST_HEADER').slice()]);
const before = env.__ss.sheets['일정'].getLastRow() - 1;
G('expPlanCleanOnce_()');
const rows = env.__ss.sheets['일정'].rows.slice(1).filter(r => r[0]);
console.log('전', before, '줄 → 후', rows.length, '줄 |', (env.__ORI_NOTES || []).join(' '));
console.log('남은 기대평:', rows.filter(r => /기대평/.test(r[1])).map(r => r[0] + ' ' + r[8]).join(', '));
const other = data.plans.filter(x => !/기대평/.test(x.camp)).length, otherAfter = rows.filter(r => !/기대평/.test(r[1])).length;
console.log('다른 캠페인 줄:', other, '→', otherAfter);
G('expPlanCleanOnce_()'); console.log('두 번째 실행 후', env.__ss.sheets['일정'].rows.slice(1).filter(r => r[0]).length, '줄 (그대로여야 함)');
