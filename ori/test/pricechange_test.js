// 명단 전달 마지막 글 가격변동 줄(priceChangeLines_): 여러 날 귤(10.28부터 9200) / 하루 대봉감(쿠팡·토스 옵션별 공지와 다른 금액)  node pricechange_test.js <Main.js>
const { makeEnv, Sheet } = require('./harness'); const vm = require('vm');
const LH0 = null;
function run(runsDef, resp, props) {
  const env = makeEnv({ main: process.argv[2], props: props || {} }); const G = k => vm.runInContext(k, env); const LH = G('LIST_HEADER');
  const mk = o => LH.map(h => o[h] !== undefined ? o[h] : '');
  env.__ss.sheets['진행목록'] = new Sheet('진행목록', [LH.slice()].concat(runsDef.map(mk)));
  const rs = new Sheet('설문지 응답 시트1', [['타임스탬프', '계정명(수령인)', '옵션', '결제금액']].concat(resp));
  rs.getFormUrl = () => 'https://form';
  env.__lss = { getSheets: () => [rs], getId: () => 'S1' };
  G("(function () { const o = SpreadsheetApp.openById; SpreadsheetApp.openById = function (id) { return id === 'S1' ? globalThis.__lss : o(id); }; })()");
  G("optPriceMap_ = function () { return {}; }");
  const runs = G('readRuns_()');
  env.__me = runs[runs.length - 1];
  return G("listMsgText_(__me)");
}
const D = (m, d, h) => new Date(2026, m - 1, d, h || 1, 0);
// 귤: 10.27 · 10.28 · 10.29 (하루 2~3명), 10.28부터 9200
const g = [D(10, 27), D(10, 28), D(10, 29)].map((d, i) => ({ '진행일': new Date(d.getFullYear(), d.getMonth(), d.getDate()), '명단 제목': '#택10.' + (27 + i) + ' 마켓담온 귤 ' + (i === 2 ? 8 : 7) + ' (뽀짝오리)', '시트ID': 'S1', '시트 링크': 'https://sheet/S1', '진행 상태': '진행중', '인원': i === 2 ? 8 : 7, '목표인원': i === 2 ? 8 : 7, '총건수': 22, '가격': '9100', '일차': i + 1 }));
const gr = [];
[[27, 9100, 7], [28, 9200, 7], [29, 9200, 8]].forEach(([d, p, n]) => { for (let k = 0; k < n; k++) gr.push([D(10, d, 1 + k % 8), 'p' + d + k, '1kg (9,100원)', k === 0 && d === 27 ? 18200 : p]); });
const t1 = run(g, gr);
// 대봉감: 하루, 쿠팡 1옵션 + 토스 2옵션, 공지와 다른 금액
const b = [{ '진행일': new Date(2026, 9, 30), '명단 제목': '#택10.30 써니마켓 대봉감외 12 (뽀짝오리)', '시트ID': 'S1', '시트 링크': 'https://sheet/S1', '진행 상태': '진행중', '인원': 12, '목표인원': 12, '총건수': 12, '일차': 1 }];
const br = [];
for (let k = 0; k < 5; k++) br.push([D(10, 30, 1), 'c' + k, '쿠팡 대봉감 (9,500원)', 9800]);
for (let k = 0; k < 5; k++) br.push([D(10, 30, 2), 's' + k, '토스 소과 (9,500원)', 9800]);
for (let k = 0; k < 2; k++) br.push([D(10, 30, 3), 'r' + k, '토스 로얄중대과 (11,500원)', 11800]);
const t2 = run(b, br);
// 장바구니 3개 (유러피안샐러드외): '마지막' 밑에 '*3개 장바구니건'
const c = [{ '진행일': new Date(2026, 9, 28), '명단 제목': '#10.28 유러피안샐러드외 60 (뽀짝오리)', '시트ID': 'S1', '시트 링크': 'https://sheet/S1', '진행 상태': '진행중', '인원': 60, '목표인원': 60, '총건수': 60, '일차': 1, '요청ID': 'RQ' }];
const t3 = run(c, [], { CART_S1: '3' });
console.log(t1 + '\n---\n' + t2 + '\n---\n' + t3);
const ok = /10\.27~ 10\.29  22건 구매완료\n\*10\.28 가격변동 9100 > 9200$/.test(t1) &&
  /마지막\n\n\*쿠팡 가격변동 9800원\n\*토스 가격변동 소과 9800원, 로얄중대과 11800원$/.test(t2) && /유러피안샐러드외 60 \(뽀짝오리\)\n마지막\n\*3개 장바구니건$/.test(t3);
console.log(ok ? '✓ 가격변동 줄 시험 통과' : 'XX 가격변동 줄 시험 실패');
process.exit(ok ? 0 : 1);
