// (11/19) 실배송 명단: 새 줄은 진한 노랑(#ffff00), 체크칸 바로 옆 칸에 '실배송'. 일반배송 의뢰는 그대로  node realrow_test.js <Main.js>
const H = require('./harness'); const vm = require('vm');
const fails = [], ok = (c, m) => { if (!c) fails.push(m); };
function run(real) {
  const env = H.makeEnv({ main: process.argv[2] }); const G = k => vm.runInContext(k, env);
  const ts = n => new Date(2026, 10, 19, 10, n);
  const resp = new H.Sheet('설문지 응답 시트1', [['타임스탬프', '이름', '전화번호'], [ts(1), '가', '01000000001'], [ts(2), '나', '01000000002']]);
  resp.getFormUrl = () => 'https://form'; resp.getSheetId = () => 11;
  const list = new H.Sheet('명단', [['요약'], ['타임스탬프', '이름', '전화번호', '', '']]);
  list.getFormUrl = () => null; list.getSheetId = () => 22;
  const bg = []; const RP = Object.getPrototypeOf(list.getRange(1, 1));
  RP.setBackgrounds = function (v) { bg.push([this.r, this.c, JSON.stringify(v)]); return this; };
  env.__lss = { getId: () => 'L1', getName: () => 'L1', getSheetByName: n => n === '명단' ? list : null, getSheets: () => [list, resp] };
  const P = { LISTV_L1: '1', RVCOL2_L1: '1', LISTNONICK_L1: '1', LISTFIX1_L1: '1', LISTHIDE_L1: '1', LISTYEL_L1: '1', RVCOLM_L1: '1', RVCOLN_L1: '5' };
  if (real) P.LISTREAL_L1 = '1';
  Object.keys(P).forEach(k => env.__props.set(k, P[k]));
  G('payCheck_ = storeDupCheck_ = function () {}; rvCol_ = function () { return 5; };');
  const n = G('syncList_(globalThis.__lss)');
  return { n, rows: list.rows, bg };
}
const a = run(true);
ok(a.n === 2, '실배송: 2줄 들어감 ' + a.n);
ok(a.rows[2][5] === '실배송' && a.rows[3][5] === '실배송', '체크칸(E) 옆 F칸에 실배송 ' + JSON.stringify(a.rows.slice(2).map(r => r[5])));
ok(a.bg.some(b => b[2].indexOf('#ffff00') >= 0 && b[2].indexOf('#fff2a8') < 0), '진한 노랑 ' + JSON.stringify(a.bg));
const b = run(false);
ok(b.n === 2 && !b.rows.slice(2).some(r => r[5] === '실배송'), '일반배송은 실배송 글자 없음 ' + JSON.stringify(b.rows.slice(2)));
ok(!b.bg.some(x => x[2].indexOf('#ffff00') >= 0), '일반배송은 노랑 안 칠함');
console.log(fails.length ? 'XX 실배송 명단 색 시험 실패:\n- ' + fails.join('\n- ') : '✓ 실배송 명단 진한 노랑·실배송 글자 시험 통과');
process.exit(fails.length ? 1 : 0);
