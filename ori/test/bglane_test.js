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
G('globalThis.__ORI_T0 = Date.now() - 230000');
G('bgLane_()');
ok(env.__ran.indexOf('slow') < 0 && env.__ran.indexOf('dashstale') >= 0, '230초 지나면 정리는 다음에, 가벼운 건 함 ' + JSON.stringify(env.__ran));
// 15분 확인 끝: 3배 넘게 밀렸는데 시간이 없으면 ⚠
G('globalThis.__ORI_T0 = Date.now() - 300000'); env.__ORI_NOTES = [];
G('bgOverdue_([])');
const notes = JSON.stringify(G('globalThis.__ORI_NOTES || []'));
ok(/밀린 일/.test(notes) && /정리/.test(notes), '⚠ 밀린 일 ' + notes);
// 15분 확인이 잠금을 기다리면(CF_WANT) 5분 실행은 단계 사이에서 멈추고, 멈춘 일은 끝난 걸로 안 적음
env.__ran.length = 0;
G('globalThis.__ORI_T0 = Date.now()');
env.__props.set('BG_phototab', String(now - 60 * min)); env.__props.set('BG_dashstale', String(now - 6 * min)); env.__props.delete('CF_WANT');
G("BG_TASKS.forEach(function (t) { if (t.k === 'phototab') t.run = function () { globalThis.__ran.push('phototab'); PropertiesService.getScriptProperties().setProperty('CF_WANT', String(Date.now())); bgYield_(); globalThis.__ran.push('phototab끝'); }; })");
let thrown = null; try { G('bgLane_()'); } catch (e) { thrown = e; }
ok(!thrown, '비켜 줄 때 오류 안 남 ' + thrown);
ok(JSON.stringify(env.__ran) === JSON.stringify(['phototab']), '멈추고 다음 일 안 함 ' + JSON.stringify(env.__ran));
ok(Number(env.__props.get('BG_phototab')) < now - 30 * min, '멈춘 일은 끝난 시각 안 적음');
ok(G('!globalThis.__BG_LANE'), '표시 풀림');
env.__ran.length = 0; G('bgLane_()');
ok(env.__ran.length === 0, '기다리는 동안은 시작도 안 함');
env.__props.delete('CF_WANT');
// 걸린 시간 기억: 남은 시간 안에 못 끝낼 일은 시작 안 함 (가벼운 건 함)
env.__ran.length = 0;
G("BG_TASKS.forEach(function (t) { t.run = (function (k) { return function () { globalThis.__ran.push(k); }; })(t.k); })");
env.__props.set('BG_dashstale', String(now - 60 * min)); env.__props.set('SLOW_AT', String(now - 100 * min));
env.__props.set('BG_T_phototab', '190'); env.__props.set('BG_phototab', String(now - 60 * min)); env.__props.set('BG_T_dashstale', '5');
G('globalThis.__ORI_T0 = Date.now() - 120000');   // 120초 지남: 정리(190초) 못 끝냄, 명단 다시 불러오기(5초)는 됨
G('bgLane_()');
ok(env.__ran.indexOf('phototab') < 0 && env.__ran.indexOf('dashstale') >= 0, '걸린 시간 보고 고름 ' + JSON.stringify(env.__ran));
ok(Number(env.__props.get('BG_T_dashstale')) < 5, '걸린 시간 다시 적음 ' + env.__props.get('BG_T_dashstale'));
// 월급시트 나눠서 하는 중(payLate)은 '실패'가 아님
{
  const env2 = H.makeEnv({ main: process.argv[2] }); const G2 = k => vm.runInContext(k, env2);
  G2("CONFIG.PAY_SHEET_ID = 'x'; updatePay_ = function () { throw { payLate: '줄 4/120' }; }; globalThis.__ORI_NOTES = []; globalThis.__ORI_T0 = Date.now();");
  env2.__props.set('PAY_PENDING', '1');
  G2("bgRun_(BG_TASKS.filter(function (t) { return t.k === 'pay'; })[0], PropertiesService.getScriptProperties())");
  const n2 = JSON.stringify(G2('globalThis.__ORI_NOTES'));
  ok(/나눠서 하는 중/.test(n2) && !/실패/.test(n2), '월급시트 나눠서 하는 중 ' + n2);
  ok(env2.__props.get('PAY_PENDING') === '1', '끝날 때까지 PAY_PENDING 그대로');
}
// 정리는 6분 제한에 가까우면 단계 사이에서 멈추고(SLOW_I) 다음에 그 단계부터, '실패'로 안 적음
{
  const env3 = H.makeEnv({ main: process.argv[2] }); const G3 = k => vm.runInContext(k, env3);
  G3("globalThis.__ORI_NOTES = []; globalThis.__ORI_T0 = Date.now() - 260000;");
  G3("bgRun_(BG_TASKS.filter(function (t) { return t.k === 'slow'; })[0], PropertiesService.getScriptProperties())");
  ok(env3.__props.get('SLOW_I') === '0' && !env3.__props.get('SLOW_AT'), '정리 멈춘 단계 기억 ' + env3.__props.get('SLOW_I'));
  ok(!/정리.*실패/.test(JSON.stringify(G3('globalThis.__ORI_NOTES'))), '멈춘 건 실패 아님 ' + JSON.stringify(G3('globalThis.__ORI_NOTES')));
  // 다 한 단계 뒤에서 이어서 끝나면 SLOW_I 지우고 SLOW_AT
  env3.__props.set('SLOW_I', '999'); G3("globalThis.__ORI_T0 = Date.now();");
  G3("slowTasks_([], {})");
  ok(!env3.__props.get('SLOW_I') && !!env3.__props.get('SLOW_AT'), '이어서 끝남');
  ok(G3("bgNeed_(BG_TASKS.filter(function (t) { return t.k === 'slow'; })[0], PropertiesService.getScriptProperties())") === 40, '정리는 스스로 시간 봄(예상 40초)');
}
if (fails.length) { console.log('✗ ' + fails.join('\n✗ ')); process.exit(1); }
console.log('✓ 미뤄도 되는 일(5분 실행) 시험 통과');
