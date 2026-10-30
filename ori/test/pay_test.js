// 월급시트 줄 값 (updatePay_ → writePayRow_ 인자, 즉시 마감 payRowNow_). 숫자가 바뀌면 실패  node pay_test.js <Main.js>
// 기대값은 10/30 리팩터 전 코드와 같은 결과 (일반 2일차·월 넘김, 기대평, 장바구니, 종료 빠짐)
const H = require('./harness'); const vm = require('vm');
function run(fast) {
  const env = H.makeEnv({ main: process.argv[2] }); const G = k => vm.runInContext(k, env); const LH = G('LIST_HEADER');
  const mk = (o) => LH.map(h => o[h] !== undefined ? o[h] : '');
  const d = (m, dd) => new Date(2026, m - 1, dd);
  env.__ss.sheets['진행목록'] = new H.Sheet('진행목록', [LH.slice(),
    mk({ '진행일': d(10, 30), '명단 제목': '#10.30 실 밴드 10 (뽀짝오리)', '시트ID': 'S1', '폼ID': 'F1', '진행 상태': '진행중', '인원': 7, '목표인원': 10, '총건수': 20, '일차': 1, '업체': '아텍스', '가격': '9000' }),
    mk({ '진행일': d(11, 2), '명단 제목': '#11.2 실 밴드 10 (뽀짝오리)', '시트ID': 'S1', '폼ID': 'F1', '진행 상태': '진행중', '인원': '', '목표인원': 10, '총건수': 20, '일차': 2, '가격': '9000' }),
    mk({ '진행일': d(10, 29), '명단 제목': '#10.29 백발백중 도서 기대평 40 (뽀짝오리)', '플랫폼': '기대평', '시트ID': 'S2', '폼ID': 'F2', '진행 상태': '진행중', '인원': 3, '목표인원': 3, '일차': 4, '가격': '14000, 13000' }),
    mk({ '진행일': d(10, 28), '명단 제목': '#10.28 유러피안샐러드외 60 (뽀짝오리)', '시트ID': 'S3', '폼ID': 'F3', '진행 상태': '진행중', '인원': 20, '목표인원': 20, '총건수': 20, '일차': 1, '가격': '9000, 12000, 11020' }),
    mk({ '진행일': d(10, 27), '명단 제목': '#10.27 실 양배추채칼외 45 (뽀짝오리)', '시트ID': 'S4', '폼ID': 'F4', '진행 상태': '종료', '인원': 45, '목표인원': 55, '일차': 1 }),
  ]);
  G("CONFIG.PAY_SHEET_ID = 'PAY'; globalThis.__W = []; writePayRow_ = function (r, n, t, p, s, ex) { __W.push(JSON.stringify([n, t, p, s, ex])); };");
  G("fixPaySunnyOnce_ = payDedupe_ = payStatusAll_ = payRate_ = payCarry_ = function () {}; payTabsNow_ = function () { return []; }; payTab_ = function () { return null; };");
  G("PropertiesService.getScriptProperties().setProperty('CART_S3', '3')");
  if (fast) { G("(function(){ const rr = readRuns_(); const r = rr[0]; r['인원'] = 10; payRowNow_(r, rr); })()"); return { w: G('__W.slice()'), sig: G("PropertiesService.getScriptProperties().getProperty('PAY_ROWSIG')") }; }
  G('updatePay_(false)'); return { w: G('__W.slice()') };
}
const want = [
  '["#10.30 실 밴드 10",20,0,true,{"store":"아텍스","time":"","photo":"","earlier":0,"mult":1}]',
  '["#11.2 실 밴드 10",20,7,true,{"store":"아텍스","time":"","photo":"","earlier":0,"mult":1}]',
  '["#10.29 백발백중 도서 기대평 40",405,0,false,{"store":"","time":"","photo":"","earlier":0,"mult":14,"count":40}]',
  '["#10.28 유러피안샐러드외 60",60,0,false,{"store":"","time":"","photo":"","earlier":0,"mult":3}]',
];
const a = run(false), b = run(true);
let ok = JSON.stringify(a.w) === JSON.stringify(want);
if (!ok) console.log('XX updatePay_ 값이 다름\n' + a.w.join('\n'));
const fastOk = b.w.length === 1 && b.w[0] === want[0] && /"2\|#10\.30 실 밴드 10"/.test(b.sig || '');
if (!fastOk) console.log('XX 즉시 마감 payRowNow_ 값이 다름\n' + b.w.join('\n') + '\n' + b.sig);
console.log(ok && fastOk ? '✓ 월급시트 줄 값 시험 통과 (' + want.length + '줄 + 즉시 마감)' : 'XX 실패');
process.exit(ok && fastOk ? 0 : 1);
