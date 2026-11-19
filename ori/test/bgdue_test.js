// (11/19) 할 일이 생겼을 때만 도는 일(월급시트 이어서)은 할 일이 생긴 때부터 밀린 시간을 셈  node bgdue_test.js <Main.js>
const H = require('./harness'); const vm = require('vm');
const env = H.makeEnv({ main: process.argv[2] }); const G = k => vm.runInContext(k, env);
const fails = [], ok = (c, m) => { if (!c) fails.push(m); };
G("CONFIG.PAY_SHEET_ID = 'PAY'");
const now = Date.now();
env.__props.set('BG_pay', String(now - 5 * 3600000));   // 5시간 전에 마지막으로 함
const rOf = () => { const o = G('bgOrder_(PropertiesService.getScriptProperties(), ' + Date.now() + ')').filter(x => x.t.k === 'pay')[0]; return o ? o.r : 0; };
ok(rOf() === 0, '할 일 없으면 안 뜸');
env.__props.set('PAY_PENDING', '1');
ok(rOf() < 1 && !!env.__props.get('BG_DUE0_pay'), '방금 생긴 할 일은 밀린 게 아님 ' + rOf());
env.__props.set('BG_DUE0_pay', String(now - 31 * 60000));
ok(rOf() >= 3, '생긴 지 31분이면 밀림 ' + rOf());
const late = G("(function () { const p = PropertiesService.getScriptProperties(); return Math.round((Date.now() - bgLast_(BG_TASKS.filter(function (t) { return t.k === 'pay'; })[0], p)) / 60000); })()");
ok(late === 31, '밀린 분은 생긴 때부터 ' + late);
env.__props.delete('PAY_PENDING');
G('bgOrder_(PropertiesService.getScriptProperties(), Date.now())');
ok(!env.__props.get('BG_DUE0_pay'), '끝나면 지움');
console.log(fails.length ? 'XX 밀린 일 시간 시험 실패:\n- ' + fails.join('\n- ') : '✓ 할 일 생긴 때부터 밀린 시간 세기 시험 통과');
process.exit(fails.length ? 1 : 0);
