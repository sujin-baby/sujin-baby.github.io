// (11/19) 월급시트 줄 쓰기 중에 새 진행 만들기(WANT_LOCK)가 기다리면 바로 넘기고, 한 데까지 기억했다가 이어서  node payyield_test.js <Main.js>
const H = require('./harness'); const vm = require('vm');
const env = H.makeEnv({ main: process.argv[2] }); const G = k => vm.runInContext(k, env); const LH = G('LIST_HEADER');
const fails = [], ok = (c, m) => { if (!c) fails.push(m); };
const mk = (o) => LH.map(h => o[h] !== undefined ? o[h] : '');
const d = (m, dd) => new Date(2026, m - 1, dd);
env.__ss.sheets['진행목록'] = new H.Sheet('진행목록', [LH.slice(),
  mk({ '진행일': d(10, 30), '명단 제목': '#10.30 실 밴드 10 (뽀짝오리)', '시트ID': 'S1', '폼ID': 'F1', '진행 상태': '진행중', '인원': 7, '목표인원': 10, '총건수': 20, '일차': 1, '가격': '9000' }),
  mk({ '진행일': d(11, 2), '명단 제목': '#11.2 실 밴드 10 (뽀짝오리)', '시트ID': 'S1', '폼ID': 'F1', '진행 상태': '진행중', '인원': 3, '목표인원': 10, '총건수': 20, '일차': 2, '가격': '9000' })]);
G("CONFIG.PAY_SHEET_ID = 'PAY'; globalThis.__W = []; writePayRow_ = function (r, n) { __W.push(n); if (__W.length === 1) PropertiesService.getScriptProperties().setProperty('WANT_LOCK', String(Date.now())); };");
G("fixPaySunnyOnce_ = payDedupe_ = payStatusAll_ = payRate_ = payCarry_ = function () {}; payTabsNow_ = function () { return []; }; payTab_ = function () { return null; };");
G('globalThis.__ORI_T0 = Date.now()');
let e1 = null; try { G('updatePay_(true)'); } catch (e) { e1 = e; }
ok(e1 && e1.yieldLock, '기다리는 일이 있으면 넘김 ' + JSON.stringify(e1));
ok(G('__W.length') === 1, '한 줄만 쓰고 멈춤 ' + G('__W.length'));
const pg = JSON.parse(env.__props.get('PAY_PROG') || 'null');
ok(pg && pg.done.length === 1, '한 데까지 기억 ' + env.__props.get('PAY_PROG'));
env.__props.delete('WANT_LOCK');
let e2 = null; try { G('updatePay_(true)'); } catch (e) { e2 = e; }
ok(!e2 && JSON.stringify(G('__W.slice()')) === JSON.stringify(['#10.30 실 밴드 10', '#11.2 실 밴드 10']), '다음엔 남은 줄부터 ' + JSON.stringify(G('__W.slice()')) + ' ' + JSON.stringify(e2));
// (11/19) 진행목록 줄 번호가 밀려도(새 진행이 맨 위에 들어감) 이미 쓴 줄을 다시 쓰지 않음
{
  const sh = env.__ss.sheets['진행목록'];
  sh.rows.splice(1, 0, LH.map(h => ({ '진행일': d(11, 3), '명단 제목': '#11.3 실 새진행 5 (뽀짝오리)', '시트ID': 'S9', '폼ID': 'F9', '진행 상태': '진행중', '인원': 1, '목표인원': 5, '총건수': 5, '일차': 1, '가격': '9000' })[h] ?? ''));
  G('globalThis.__W = []; writePayRow_ = function (r, n) { __W.push(n); };');
  G('updatePay_(true)');
  ok(JSON.stringify(G('__W.slice()')) === JSON.stringify(['#11.3 실 새진행 5']), '새 진행 줄만 씀(밀린 줄은 다시 안 씀) ' + JSON.stringify(G('__W.slice()')));
}
console.log(fails.length ? 'XX 월급시트 넘기기 시험 실패:\n- ' + fails.join('\n- ') : '✓ 월급시트 줄 쓰기 중 새 진행 만들기에 넘기기 시험 통과');
process.exit(fails.length ? 1 : 0);
