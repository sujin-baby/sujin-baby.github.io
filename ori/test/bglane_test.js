// (11/18) 미뤄도 되는 일: 5분 실행이 '가장 오래 밀린 것부터', 늦으면 안 시작, 3배 넘게 밀리면 15분 확인이 ⚠  node bglane_test.js <Main.js>
const H = require('./harness'); const vm = require('vm');
const env = H.makeEnv({ main: process.argv[2] }); const G = k => vm.runInContext(k, env);
const fails = [], ok = (c, m) => { if (!c) fails.push(m); };
const now = Date.now(), min = 60000;
env.__props.set('BG_dashstale', String(now - 6 * min));    // 1.2배
env.__props.set('BG_phototab', String(now - 60 * min));    // 4배
env.__props.set('SLOW_AT', String(now - 50 * min));        // 1.67배
env.__props.set('BG_props', String(now - 10 * min));       // 0.08배 → 안 함
env.__ran = [];
G("BG_TASKS.forEach(function (t) { t.run = (function (k) { return function () { globalThis.__ran.push(k); if (k === 'slow') PropertiesService.getScriptProperties().setProperty('SLOW_AT', String(Date.now())); }; })(t.k); })");
G('globalThis.__ORI_T0 = Date.now()');
G('bgLane_()');
ok(JSON.stringify(env.__ran) === JSON.stringify(['phototab', 'slow', 'dashstale']), '밀린 순서 ' + JSON.stringify(env.__ran));
ok(Number(env.__props.get('BG_phototab')) >= now, '한 시각 기록');
// 늦으면 오래 걸리는 일은 안 시작
env.__ran.length = 0; env.__props.set('SLOW_AT', String(now - 100 * min)); env.__props.set('BG_dashstale', String(now - 100 * min));
G('globalThis.__ORI_T0 = Date.now() - 200000');
G('bgLane_()');
ok(env.__ran.indexOf('slow') < 0 && env.__ran.indexOf('dashstale') >= 0, '200초 지나면 정리는 다음에, 가벼운 건 함 ' + JSON.stringify(env.__ran));
// 15분 확인 끝: 3배 넘게 밀렸는데 시간이 없으면 ⚠
G('globalThis.__ORI_T0 = Date.now() - 300000'); env.__ORI_NOTES = [];
G('bgOverdue_([])');
const notes = JSON.stringify(G('globalThis.__ORI_NOTES || []'));
ok(/밀린 일/.test(notes) && /정리/.test(notes), '⚠ 밀린 일 ' + notes);
if (fails.length) { console.log('✗ ' + fails.join('\n✗ ')); process.exit(1); }
console.log('✓ 미뤄도 되는 일(5분 실행) 시험 통과');
