// (11/25) 월급시트가 11/24 19:28부터 못 돈 것: ① 중간까지 한 단계(리뷰 확인)는 다음 확인에선 다른 밀린 단계 뒤로 ② 월급시트는 스스로 시간을 봐서 예상 90초  node payturn_test.js <Main.js>
const H = require('./harness'); const vm = require('vm');
const fails = [], ok = (c, m) => { if (!c) fails.push(m); };
{
  const env = H.makeEnv({ main: process.argv[2], props: { OUTBOX_SORTED: '1', OUTBOX_FMT2: '1' } }); const G = k => vm.runInContext(k, env);
  G("globalThis.__ORDER = []; cfDo_ = function (S, name) { __ORDER.push(name); return true; }; cfFresh_ = function () { return false; }; soonCheck_ = function () {}; globalThis.__ORI_T0 = Date.now();");
  const now = Date.now();
  // 리뷰 확인: 다 한 건 오래전(13시간 전)이지만 방금 중간까지 함(a). 월급시트: 13시간 전
  env.__S = { '폼 인원': { d: now - 30 * 60000 }, '리뷰 확인': { d: now - 800 * 60000, a: now - 4 * 60000 }, '월급시트': { d: now - 790 * 60000 }, '한눈에': { d: now - 500 * 60000 } };
  const list = ['폼 인원', '리뷰 확인', '월급시트', '한눈에'].map(n => '{ n: ' + JSON.stringify(n) + ', need: 1, run: function () {} }').join(',');
  let e = ''; try { G('cfRun_(__S, [' + list + '])'); } catch (x) { e = String(x.stack || x); }
  const o = G('__ORDER');
  ok(!e, '오류 ' + e);
  ok(o[0] === '폼 인원', '폼 인원 먼저 ' + o.join());
  ok(o.indexOf('월급시트') < o.indexOf('리뷰 확인') && o.indexOf('한눈에') < o.indexOf('리뷰 확인'), '방금 중간까지 한 리뷰 확인은 다른 밀린 단계 뒤로 ' + o.join());
}
{
  // 중간까지(cfCut)면 a를 적고 d는 그대로
  const env = H.makeEnv({ main: process.argv[2] }); const G = k => vm.runInContext(k, env);
  G("globalThis.__ORI_T0 = Date.now(); globalThis.__S2 = { '리뷰 확인': { d: 1000 } };");
  const r = G("cfDo_(__S2, '리뷰 확인', function () { throw { cfCut: 1 }; }, null)");
  ok(r === false && G("__S2['리뷰 확인'].d") === 1000 && G("__S2['리뷰 확인'].a") > 1000, '중간까지 = a만 ' + JSON.stringify(G('__S2')));
}
{
  // 월급시트: 걸린 시간을 길게 기억해도 예상 90초 (스스로 280초에 멈춤)
  const env = H.makeEnv({ main: process.argv[2] }); const G = k => vm.runInContext(k, env);
  env.__props.set('BG_T_pay', '275.3');
  ok(G("bgNeed_(BG_TASKS.filter(function (t) { return t.k === 'pay'; })[0], PropertiesService.getScriptProperties())") === 90, '5분 실행 월급시트 예상 90초');
  G("globalThis.__ORI_T0 = Date.now() - 100000;");
  env.__props.set('PAY_PENDING', '1'); G("CONFIG.PAY_SHEET_ID = 'x';");
  ok(G("bgFits_(BG_TASKS.filter(function (t) { return t.k === 'pay'; })[0], PropertiesService.getScriptProperties())") === true, '100초 지났어도 시작함 (예전엔 200초 필요해서 못 함)');
}
const src = require('fs').readFileSync(process.argv[2], 'utf8');
ok(/\{ n: '월급시트', need: 90, self: 1, run:/.test(src), '15분 확인 월급시트 단계 self·90초');
ok(/payLate\) \{ props\.setProperty\('BG_pay'/.test(src), '15분 확인에서 이어 하면 BG_pay 적음');
console.log(fails.length ? 'XX 월급시트 차례 시험 실패:\n- ' + fails.join('\n- ') : '✓ 월급시트 차례(중간까지 한 단계 뒤로·예상 90초) 시험 통과');
process.exit(fails.length ? 1 : 0);
