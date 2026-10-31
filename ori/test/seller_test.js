// 판매처 고르기 (10/31 대봉감 '판매처 : 가입'): 첫 후보가 엉터리면 버리고 다음 후보로.
//  확장 page.js, oy.js, 생성기 북마크(bm-src) 세 곳 코드를 그대로 꺼내 가짜 화면으로 돌림.  node seller_test.js
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..', '..');
const src = {
  'page.js': fs.readFileSync(path.join(root, 'ori/ext/page.js'), 'utf8'),
  'oy.js': fs.readFileSync(path.join(root, 'ori/ext/oy.js'), 'utf8'),
  '생성기 bm-src': fs.readFileSync(path.join(root, 'guide/index.html'), 'utf8'),
};
// 판매처 코드: '/* 판매처: 첫 후보가' 부터 '정리'(브랜드샵 지우기) 바로 앞까지
function sellerCode(s, label) {
  const a = s.indexOf('/* 판매처: 첫 후보가');
  const b = s.indexOf('if (seller) {', a);
  if (a < 0 || b < 0) throw new Error(label + ': 판매처 코드를 못 찾음');
  return s.slice(a, b);
}
const cases = [
  { t: '화면에 판매자 가입만, 페이지 데이터 없음 → 상품명 첫 단어로 채우지 않고 비움', brands: [], txt: '입점신청\n판매자 가입\n상품 정보', html: '', name: '가을제철 햇감 달콤말랑 시즌한정 홍시용대봉감, 1박스, 3kg 소과', want: '' },
  { t: '판매자 가입 + 페이지 데이터(따옴표가 \\" 로 들어간 것)', brands: [], txt: '판매자 가입', html: 'self.__next_f.push([1,"{\\"vendorName\\":\\"Happy 써나마켓\\"}"])', name: '가을제철 햇감', want: 'Happy 써나마켓' },
  { t: '판매자 이름이 다음 줄에', brands: [], txt: '판매자 가입\n판매자\nHappy 써나마켓\n', html: '', name: '가을제철 햇감', want: 'Happy 써나마켓' },
  { t: '판매자 가입 다음에 진짜 판매자', brands: [], txt: '판매자 가입\n…\n판매자: 과일나라 판매자 상품 보러가기\n', html: '', name: '대봉감 5kg', want: '과일나라' },
  { t: '브랜드 칸이 와우 가입 → 페이지 데이터 판매자', brands: ['와우회원 가입'], txt: '판매자 특가', html: '{"vendorName":"햇살농원"}', name: '대봉감', want: '햇살농원' },
  { t: '정상 브랜드 칸은 그대로', brands: ['삼성전자'], txt: '판매자: 다른곳', html: '{"vendorName":"x"}', name: 'a b', want: '삼성전자' },
  { t: '상호/대표자', brands: [], txt: '상호/대표자 주식회사 감나무/홍길동', html: '', name: '쿠팡 단독 감', want: '주식회사 감나무' },
  { t: '빈 브랜드 칸은 건너뜀', brands: ['  ', '청송사과'], txt: '', html: '', name: '', want: '청송사과' },
];
let fail = 0;
for (const [label, s] of Object.entries(src)) {
  const code = sellerCode(s, label);
  for (const c of cases) {
    const ctx = {
      document: { querySelectorAll: () => c.brands.map(t => ({ textContent: t })), documentElement: { innerHTML: c.html } },
      txt: c.txt, html: c.html, name: c.name, seller: '',
      jv: k => { const m = c.html.match(new RegExp('"' + k + '"\\s*:\\s*"([^"]+)"')); return m ? m[1] : ''; },
    };
    vm.createContext(ctx);
    // 세 곳 모두 let seller = "" 다음에 이 코드가 있음 (상품명 첫 단어 줄까지) → 같은 모양으로 감싸서 돌림
    const got = vm.runInContext('(function(){ let seller = ""; ' + code + ' return seller; })()', ctx);
    const ok = got === c.want;
    if (!ok) fail++;
    console.log((ok ? '✓ ' : '✗ ') + label + ' · ' + c.t + ' → ' + JSON.stringify(got) + (ok ? '' : ' (기대: ' + JSON.stringify(c.want) + ')'));
  }
}
if (fail) { console.error(fail + '개 실패'); process.exit(1); }
console.log('✓ 판매처 시험 통과');
