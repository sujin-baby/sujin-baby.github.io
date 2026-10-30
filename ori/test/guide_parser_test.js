// guide_parser_test.js: 가이드 생성기(guide/index.html) 의뢰서 파서 단위 시험
// 실제 의뢰서 샘플들을 돌려 방제, 키워드, 포토/텍스트 분할, 옵션, 일차별 배정이 올바르게 파싱되는지 검증
const fs = require('fs');
const path = require('path');
const vm = require('vm');

console.log('Testing guide/index.html parser with real campaign samples...');

const htmlPath = path.resolve(__dirname, '../../guide/index.html');
const html = fs.readFileSync(htmlPath, 'utf8');

// script 태그 추출
const m = html.match(/<script>([\s\S]*?)<\/script>/);
if (!m) throw new Error('Could not find <script> in guide/index.html');

let scriptContent = m[1];

// Mock DOM 환경 구축
const domElements = {};
function getElem(id) {
  if (!domElements[id]) {
    domElements[id] = {
      id,
      value: '',
      checked: false,
      textContent: '',
      hidden: false,
      style: {},
      placeholder: '',
      innerHTML: '',
      dataset: {},
      addEventListener: () => {},
      dispatchEvent: () => {},
      appendChild: () => {},
      setAttribute: () => {},
      removeAttribute: () => {}
    };
  }
  return domElements[id];
}

const sandbox = {
  console,
  setTimeout,
  clearTimeout,
  Date,
  Math,
  String,
  Number,
  Boolean,
  Array,
  Object,
  RegExp,
  JSON,
  encodeURIComponent,
  decodeURIComponent,
  document: {
    getElementById: getElem,
    querySelectorAll: () => [],
    createElement: id => getElem(id),
    documentElement: { hasAttribute: () => false },
    addEventListener: () => {}
  },
  window: {
    addEventListener: () => {},
    localStorage: { getItem: () => null, setItem: () => {} }
  },
  localStorage: { getItem: () => null, setItem: () => {} },
  location: { href: 'https://sujin-baby.github.io/guide/' },
  MutationObserver: function() { return { observe: () => {}, disconnect: () => {} }; }
};
sandbox.globalThis = sandbox;

vm.createContext(sandbox);
vm.runInContext(scriptContent, sandbox);

const P = sandbox.__PARSER__;
if (!P || !P.parseAll) throw new Error('Failed to expose parser functions from guide/index.html');

console.log('Parser functions successfully loaded.');

// ==========================================
// Test 1: #10.30 실 아텍스 밴드 10
// ==========================================
console.log('-- Test 1: 아텍스 밴드 (실배송, 10개 포토/무 분할)');
const reqAtex = `#입금대행 실배 11500

4. 일 진행 건수 : 10
5. 상품주소(URL) : https://www.coupang.com/vp/products/9778569271?itemId=29274107751&vendorItemId=96191051552&q=%EC%9A%B0%EC%82%AC%ED%95%98%EB%82%98&searchId=5bdc4b2c1117990&sourceType=search&rank=2&itemsCount=36&searchRank=2&traceId=mvt9uym4

6. 구매옵션 : 10개 11,500원
7. 포토제공 유 무  : 유 10개, 무10개
8. 리뷰내용 가이드 :  귀여운 우사하나 캐릭터, 소독제 함유, 붙음방지 쿠션패드
9. 입금대행 Y/N : Y
10.택배대행 Y/N: N`;

const headAtex = P.parseAll(reqAtex);
if (headAtex.type !== '입대') throw new Error('Atex type should be 입대');
if (!headAtex.realship) throw new Error('Atex realship should be true');
const gAtex = headAtex.guides[0];
if (!/우사하나/.test(gAtex.keyword)) throw new Error('Atex keyword should extract 우사하나 from URL');
if (gAtex.daily !== '10') throw new Error('Atex daily count should be 10, got: ' + gAtex.daily);
if (!/포토리뷰 10개 \/ 텍스트리뷰 10개/.test(gAtex.review)) throw new Error('Atex review should split into photo/text: ' + gAtex.review);

// ==========================================
// Test 2: #10.28 유러피안샐러드외 60 (장바구니 3개 묶음)
// ==========================================
console.log('-- Test 2: 유러피안샐러드 (장바구니 3건, 일부 제공)');
const reqSalad = `#입금대행 실배 장바구니 10690 10690 10690

1. 검색 키워드 : 유러피안샐러드
2. 키워드 검색 시 현재 순위 : 1위
3. 총 구매 건수 : 20건
4. 일 진행 건수 : 1일차 20건
5. 상품주소(URL) :
https://www.coupang.com/vp/products/9794219789?itemId=29325232422&vendorItemId=96239612138&q=%EC%B9%B4%EC%9D%B4%ED%94%BC%EB%9D%BC
6. 구매옵션 : 1kg 10690원
7. 포토제공 유 무  : 일부 제공 
8. 리뷰내용 가이드 : 
9. 입금대행 Y/N : y
10.택배대행 Y/N : n
===============
1. 검색 키워드 : 로메인
2. 상품주소(URL) : https://www.coupang.com/vp/products/9794219790?itemId=29325232423
3. 구매옵션 : 1kg
===============
1. 검색 키워드 : 버터헤드
2. 상품주소(URL) : https://www.coupang.com/vp/products/9794219791?itemId=29325232424
3. 구매옵션 : 1kg`;

const headSalad = P.parseAll(reqSalad);
if (!headSalad.cart) throw new Error('Salad should be cart run');
if (headSalad.guides.length !== 3) throw new Error('Salad should have 3 guides, got: ' + headSalad.guides.length);
if (/입금대행/.test(headSalad.guides[0].review)) throw new Error('Salad guide[0].review should not contain 입금대행 text');
if (!/일부/.test(headSalad.guides[0].photo)) throw new Error('Salad photo should contain 일부');

// ==========================================
// Test 3: #택10.28 시온스 발마사지기 (서술형 포토 수량)
// ==========================================
console.log('-- Test 3: 시온스 저주파 발마사지기 (서술형 하루 1명씩 3명 제공)');
const reqMassage = `#입금대행 택대 43900

1. 검색 키워드(미노출시 저희가 키워드땁니다): 저주파 발마사지기
2. 키워드 검색 시 현재 순위 : 모르시면 비워두세요
3. 총 결제하신 건수 : 10건
4. 하루 구매하는건수 (어뷰징 피하기위해 조금씩 변동될수 있습니다 : 3 / 3 / 4 건씩
5. 상품주소(URL) : https://www.coupang.com/vp/products/9778876191?vendorItemId=96191929994
6. 구매옵션 : 모던 오렌지
7. 포토제공 (몇명) /포토없음 선택: 하루 1명씩 3명 제공 / 7명은 포토없음
8. 리뷰 가이드 : 자율
9. 입금대행 Y/N : Y
10.택배대행 Y/N : Y`;

const headMassage = P.parseAll(reqMassage);
if (!headMassage.takdae) throw new Error('Massage should be takdae');
const gMassage = headMassage.guides[0];
if (!/포토대기 3개 \/ 텍스트리뷰 7개/.test(gMassage.review)) throw new Error('Massage review should parse 3 photoWait / 7 text, got: ' + gMassage.review);
if (gMassage.days.length !== 3) throw new Error('Massage days count should be 3 (3/3/4), got: ' + gMassage.days.length);

// ==========================================
// Test 4: 런치버스 텀블러 (구어체 포토)
// ==========================================
console.log('-- Test 4: 런치버스 텀블러 (하루에 한두명씩)');
const reqTumbler = `#입금대행 실배 25000

1. 검색 키워드 : 대용량 텀블러
2. 총 구매 건수 : 5건
3. 일 진행 건수 : 5건
4. 상품주소(URL) : https://www.coupang.com/vp/products/1234567890
5. 구매옵션 : 화이트
6. 포토제공 유 무 : 하루에 한두명씩 있게 해주세요 (포토 2 / 무 3)
7. 리뷰내용 가이드 : 얼음 보온보냉 기능 강조`;

const headTumbler = P.parseAll(reqTumbler);
const gTumbler = headTumbler.guides[0];
if (!/포토리뷰 2개 \/ 텍스트리뷰 3개/.test(gTumbler.review)) throw new Error('Tumbler review should split 2 photo / 3 text, got: ' + gTumbler.review);

// ==========================================
// Test 5: 옵션 및 가격 파싱 (번들 수량 분리)
// ==========================================
console.log('-- Test 5: 번들 수량 및 가격 옵션 정밀 파싱');
const opts = P.parseOptions('10개 11,500원 / 20개 21,000원');
if (opts.length !== 2) throw new Error('Options should parse 2 items, got: ' + opts.length);
if (opts[0].label !== '10개') throw new Error('Option[0] should be 10개, got: ' + opts[0].label);
if (opts[1].label !== '20개') throw new Error('Option[1] should be 20개, got: ' + opts[1].label);

console.log('✓ 모든 가이드 생성기 파서 단위 시험 통과 (5개 샘플 전원 일치)');
process.exit(0);
