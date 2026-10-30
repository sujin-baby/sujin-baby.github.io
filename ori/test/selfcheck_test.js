// 자가 점검(selfCheck_): 방제 숫자, 월급시트 줄·수량·스토어·진행시간, 한눈에 오류 칸  node selfcheck_test.js <Main.js>
const H = require('./harness'); const vm = require('vm');
const env = H.makeEnv({ main: process.argv[2] }); const G = k => vm.runInContext(k, env); const LH = G('LIST_HEADER');
const mk = (o) => LH.map(h => o[h] !== undefined ? o[h] : '');
const t0 = new Date(); t0.setHours(0,0,0,0); const dd = n => new Date(t0.getTime() - n * 86400000);
const lab = n => (dd(n).getMonth()+1) + '.' + dd(n).getDate();
const rows = [LH.slice(),
  mk({ '진행일': dd(1), '명단 제목': '#' + lab(1) + ' 실 밴드 10 (뽀짝오리)', '시트ID': 'S1', '폼ID': 'F1', '진행 상태': '진행중', '인원': 10, '목표인원': 10, '총건수': 10, '일차': 1, '업체': '아텍스' }),
  mk({ '진행일': dd(2), '명단 제목': '#' + lab(2) + ' 유러피안샐러드외 20 (뽀짝오리)', '시트ID': 'S3', '폼ID': 'F3', '진행 상태': '진행중', '인원': 20, '목표인원': 20, '총건수': 20, '일차': 1 }),
  mk({ '진행일': dd(2), '명단 제목': '#' + lab(2) + ' 실 거치대 5 (뽀짝오리)', '시트ID': 'S5', '폼ID': 'F5', '진행 상태': '진행중', '인원': 5, '목표인원': 5, '총건수': 5, '일차': 1 }),
];
env.__ss.sheets['진행목록'] = new H.Sheet('진행목록', rows);
G("PropertiesService.getScriptProperties().setProperty('CART_S3', '3')");
const dayHead = ['', '', '', '', '', '', dd(2), dd(1)];
const pay = new H.Sheet('10월', [
  dayHead,
  ['캠페인명', '계약 수량', '총액', '스토어', '진행시간', '특이사항', '', ''],
  ['#' + lab(1) + ' 실 밴드 10', '', 10, '아텍스', '자정', '', '', 7],
  ['#' + lab(2) + ' 유러피안샐러드외 60', '', 60, '', '', '', 60, ''],
]);
env.__ss.sheets['한눈에'] = new H.Sheet('한눈에', [['a', '#REF!'], ['b', 'ok']]);
G("CONFIG.PAY_SHEET_ID = 'PAY'");
env.__pay = pay; G("payTab_ = function () { return globalThis.__payS; }"); vm.runInContext('globalThis.__payS = null', env); env.__payS = pay;
vm.runInContext("globalThis.__payS = this.__pay", env);
const got = G("selfCheck_(readRuns_().filter(function (r) { return r['진행 상태'] !== '종료'; }), today_().getTime())");
const want = [/방제 숫자와 목표인원이 안 맞음: .*유러피안샐러드외 20/, /월급시트에 줄이 없음: .*거치대 5/, /그날 수량이 인원과 다름: .*밴드 10 \(월급시트 7 \/ 실제 10\)/, /스토어 빈칸: .*유러피안/, /진행시간 빈칸: .*유러피안/, /한눈에 탭에 오류 칸\(1개\): B1/];
let ok = got.length === want.length && want.every((re, i) => re.test(got[i]));
console.log(got.join('\n')); console.log(ok ? '✓ 자가 점검 시험 통과' : 'XX 자가 점검 결과가 다름');
process.exit(ok ? 0 : 1);
