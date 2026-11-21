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
      listeners: {},
      addEventListener: (ev, fn) => { (domElements[id].listeners[ev] = domElements[id].listeners[ev] || []).push(fn); },
      dispatchEvent: () => {},
      appendChild: () => {},
      setAttribute: () => {},
      removeAttribute: () => {}
    };
  }
  return domElements[id];
}
// 입력칸에 값을 넣고 그 칸의 input 핸들러를 실제로 태운다 (#104: 키워드를 직접 고칠 때 방제 이름도 따라 바뀌는지)
function fireInput(id) { (getElem(id).listeners.input || []).forEach(fn => fn({ target: getElem(id) })); }

/* 브라우저 저장소 대역: 넣은 값은 기억하고, 모르는 열쇠는 예전처럼 'test-key' (열쇠 칸 시험들이 기대하는 값) */
const LS_MAP = new Map();
const LS = { getItem: k => (LS_MAP.has(k) ? LS_MAP.get(k) : 'test-key'), setItem: (k, v) => { LS_MAP.set(k, String(v)); }, removeItem: k => { LS_MAP.delete(k); } };

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
  btoa: str => Buffer.from(str, 'binary').toString('base64'),
  atob: b64 => Buffer.from(b64, 'base64').toString('binary'),
  unescape: typeof unescape !== 'undefined' ? unescape : decodeURI,
  escape: typeof escape !== 'undefined' ? escape : encodeURI,
  document: {
    getElementById: getElem,
    querySelectorAll: () => [],
    createElement: id => getElem(id),
    documentElement: { hasAttribute: () => false },
    addEventListener: () => {}
  },
  navigator: {
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
    platform: 'iPhone',
    maxTouchPoints: 5,
    clipboard: { writeText: () => Promise.resolve() }
  },
  window: {
    addEventListener: () => {},
    prompt: () => 'test-key',
    alert: () => {},
    localStorage: LS,
    navigator: {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
      platform: 'iPhone',
      maxTouchPoints: 5,
      clipboard: { writeText: () => Promise.resolve() }
    }
  },
  prompt: () => 'test-key',
  alert: () => {},
  localStorage: LS,
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

// ==========================================
// Test 6: 대봉감 (쿠팡 5 + 토스 7: 소과 5 / 로얄중대과 2 분할)
// ==========================================
console.log('-- Test 6: 대봉감 (쿠팡 5 + 토스 7: 소과 5 / 로얄중대과 2 분할)');
const reqDaebong = `#입금대행 택대

1. 검색 키워드 : 대봉감
2. 키워드 검색 시 현재 순위 : 신규 등록 상품이라 미노출 (키워드 추출 부탁드립니다)
3. 총 구매 건수 : 5건
4. 일 진행 건수 :  1일간 진행
5. 상품주소(URL) 
상품명:
가을제철 햇감 달콤말랑 시즌한정 홍시용대봉감
https://link.coupang.com/a/ifs285AXwO
6. 구매옵션 : 
홍시용 대봉감 소과 3kg 5건
7. 포토제공 유 무 : Y
8. 리뷰내용 가이드 : 키워드 조합 참고
9. 입금하실 입금자명 : 전선화
10. 택배대행 Y/N : Y
11. ㅡㅡㅡㅡㅡㅡㅡㅡㅡ

1. 검색 키워드 : 대봉감
2. 키워드 검색 시 현재 순위 : 신규 등록 상품이라 미노출 (키워드 추출 부탁드립니다)
3. 총 구매 건수 : 7건
4. 일 진행 건수 :  1일간 진행
5. 상품주소(URL) 
상품명:
홍시용 대봉감 소과 3kg 5건
https://service.toss.im/shopping-discovery/c/2704063799

홍시용 대봉감 로얄중대과 3kg 2건
https://service.toss.im/shopping-discovery/c/2704063801
6. 구매옵션 : 
홍시용 대봉감 소과 3kg 5건
홍시용 대봉감 로얄중대과 3kg 2건
7. 포토제공 유 무 : Y
8. 리뷰내용 가이드 : 키워드 조합 참고
9. 입금하실 입금자명 : 전선화
10. 택배대행 Y/N : Y`;

const headDaebong = P.parseAll(reqDaebong);
if (headDaebong.guides.length !== 3) throw new Error('Daebong should have 3 guides, got: ' + headDaebong.guides.length);
if (headDaebong.guides[0].platform !== '쿠팡') throw new Error('Daebong guide 0 platform should be 쿠팡, got: ' + headDaebong.guides[0].platform);
if (headDaebong.guides[0].total !== '5') throw new Error('Daebong guide 0 total should be 5, got: ' + headDaebong.guides[0].total);
if (headDaebong.guides[0].option !== '홍시용 대봉감 소과 3kg') throw new Error('Daebong guide 0 option should be stripped of 5건, got: ' + headDaebong.guides[0].option);

if (headDaebong.guides[1].platform !== '토스') throw new Error('Daebong guide 1 platform should be 토스, got: ' + headDaebong.guides[1].platform);
if (headDaebong.guides[1].total !== '5') throw new Error('Daebong guide 1 total should be 5, got: ' + headDaebong.guides[1].total);
if (headDaebong.guides[1].pno !== '2704063799') throw new Error('Daebong guide 1 pno should be 2704063799, got: ' + headDaebong.guides[1].pno);
if (headDaebong.guides[1].page !== '1p') throw new Error('Daebong guide 1 page should default to 1p, got: ' + headDaebong.guides[1].page);

if (headDaebong.guides[2].platform !== '토스') throw new Error('Daebong guide 2 platform should be 토스, got: ' + headDaebong.guides[2].platform);
if (headDaebong.guides[2].total !== '2') throw new Error('Daebong guide 2 total should be 2, got: ' + headDaebong.guides[2].total);
if (headDaebong.guides[2].pno !== '2704063801') throw new Error('Daebong guide 2 pno should be 2704063801, got: ' + headDaebong.guides[2].pno);
if (headDaebong.guides[2].page !== '1p') throw new Error('Daebong guide 2 page should default to 1p, got: ' + headDaebong.guides[2].page);

console.log('-- Test 7: 10/31 피드백 검증 (유/무 분할 리뷰, 계층 키워드, 토스 상품명 보존, kwList 단일 키워드)');
// 1) 포토 유 10개, 무 10개 분할 테스트
const atexMix = P.reviewMix({ photo: '유 10개, 무10개' });
if (atexMix.length !== 2) throw new Error('atexMix should have 2 elements, got: ' + atexMix.length);
if (atexMix[0].label !== '포토리뷰' || atexMix[0].n !== 10) throw new Error('atexMix[0] should be 포토리뷰 10, got: ' + JSON.stringify(atexMix[0]));
if (atexMix[1].label !== '텍스트리뷰' || atexMix[1].n !== 10) throw new Error('atexMix[1] should be 텍스트리뷰 10, got: ' + JSON.stringify(atexMix[1]));

// 2) 토스 상품명 쉼표/규격 보존 테스트
const tossPname = '홍시용 대봉감, 소과, 3kg, 1박스';
const tossClean = P.baseName(tossPname, null, { platform: '토스' });
if (tossClean !== tossPname) throw new Error('Toss pname should be preserved exactly, got: ' + tossClean);

// 11/18 수진 님 "1개 100g은 상품명에있으면상품명뒤에넣음되지" — 쿠팡도 끝 수량·용량은 원문 그대로 둔다
const coupangPname = '홍시용 대봉감, 소과, 3kg, 1박스';
const cpClean = P.baseName(coupangPname, null, { platform: '쿠팡' });
if (cpClean !== '홍시용 대봉감, 소과, 3kg, 1박스') throw new Error('Coupang pname should keep trailing quantity/volume, got: ' + cpClean);

// 3) 계층 키워드 추천 테스트: 밴드 -> 산리오 밴드 -> 아텍스 산리오 밴드
const kwHierarchy = P.suggestKeywords('아텍스 산리오 캐릭터즈 우사하나 밴드 표준형');
if (kwHierarchy.main !== '밴드') throw new Error('Main keyword should be 밴드, got: ' + kwHierarchy.main);
if (!kwHierarchy.subs.some(s => s === '산리오 밴드')) throw new Error('Subs should include 산리오 밴드, got: ' + JSON.stringify(kwHierarchy.subs));
if (!kwHierarchy.subs.some(s => s === '아텍스 산리오 밴드')) throw new Error('Subs should include 아텍스 산리오 밴드, got: ' + JSON.stringify(kwHierarchy.subs));

// 4) kwList: 의뢰서 키워드가 명시되어 있을 때 옵션명이 섞이지 않고 단일 키워드만 반환하는지
const daebongKwList = P.kwList({ keyword: '대봉감', pname: '홍시용 대봉감 로얄중대과 3kg', kwAuto: false });
if (daebongKwList.length !== 1 || daebongKwList[0] !== '대봉감') throw new Error('kwList with explicit keyword should return only [대봉감], got: ' + JSON.stringify(daebongKwList));

// ==========================================
// Test 8: 아텍스 밴드 의뢰서 파싱 및 판매처·공지 정밀 검증 (10/31)
// 1) 판매처, 상품명, 위치 기본값 자동 채움
// 2) 판매처 '아텍스브랜드샵' -> '아텍스' 정리
// ==========================================
console.log('-- Test 8: 아텍스 밴드 의뢰서 파싱 및 판매처·공지 정밀 검증');
const reqAtexFull = `#입금대행 실배 11500

1. 구매진행시 검색할 키워드 : 아텍스 산리오 캐릭터즈 우사하나 밴드 표준형
2. 키워드 검색 시 현재 순위 :
3. 총 구매 건수 : 20
4. 일 진행 건수 : 10
5. 상품주소(URL) : https://www.coupang.com/vp/products/9778569271?itemId=29274107751&vendorItemId=96191051552&q=%EC%9A%B0%EC%82%AC%ED%95%98%EB%82%98&searchId=5bdc4b2c1117990&sourceType=search&rank=2&itemsCount=36&searchRank=2&traceId=mvt9uym4

6. 구매옵션 : 10개 11,500원
7. 포토제공 유 무  : 유 10개, 무10개
8. 리뷰내용 가이드 :  귀여운 우사하나 캐릭터, 소독제 함유, 붙음방지 쿠션패드
9. 입금대행 Y/N : Y
10.택배대행 Y/N: N`;

const headFull = P.parseAll(reqAtexFull);
const gFull = headFull.guides[0];
if (gFull.seller !== '') throw new Error('gFull seller should be empty before product page fetch, got: ' + gFull.seller);
if (gFull.pname !== '아텍스 산리오 캐릭터즈 우사하나 밴드 표준형') throw new Error('gFull pname should default to keyword, got: ' + gFull.pname);
if (gFull.page !== '1p') throw new Error('gFull page should default to 1p, got: ' + gFull.page);
if (gFull.option !== '10개') throw new Error('gFull option should be 10개, got: ' + gFull.option);

// ==========================================
// Test 9: 텀블러 의뢰서 파싱 및 4색상·리뷰·신상품 검증 (10/31)
// 1) 4색상 5개씩 -> 검정·아이보리·연그린·하늘색 자동 분할
// 2) 2개 정도만 사진 나머지는 별점만 -> 포토리뷰 2개 / 텍스트리뷰 3개
// 3) 신상품 순위 -> 위치 빈칸 (1p로 채우지 않음, 11/1 사용자)
// 4) 판매처 바나바스토어 보존
// ==========================================
console.log('-- Test 9: 텀블러 의뢰서 파싱 (4색상 분할, 구어체 리뷰, 신상품 위치 빈칸, 바나바스토어 보존)');
const reqTumblerFull = `#입금대행 실배 교차불가9500

1. 검색 키워드(미노출시 저희가 키워드땁니다): 런치버스 미니 보온보냉 텀블러
2. 키워드 검색 시 현재 순위 : 신상품
3. 총 구매 건수 : 20개
4. 일 진행 건수 : 5개
5. 상품주소(URL) :
https://www.coupang.com/vp/products/9775450298?vendorItemId=96180413598
6. 구매옵션 : 4가지
4색상 5개씩
7. 포토제공 유 무  : 유
8. 리뷰내용 가이드 : 2개 정도만 사진을 넣어 주시고 나머지는 별점만 부탁드립니다
9. 입금하실 입금자명 :신훈
10.택배대행 Y/N:Y`;

const headTumblerFull = P.parseAll(reqTumblerFull);
const gTumblerFull = headTumblerFull.guides[0];
if (gTumblerFull.page) throw new Error('gTumblerFull page should stay empty for 신상품 (no fake 1p, 11/1), got: ' + gTumblerFull.page);
if (!/포토리뷰 2개 \/ 텍스트리뷰 3개/.test(gTumblerFull.review)) throw new Error('gTumblerFull review should split 2 photo / 3 text, got: ' + gTumblerFull.review);
if (gTumblerFull.optBase.length !== 4) throw new Error('gTumblerFull optBase should have 4 colors, got: ' + gTumblerFull.optBase.length);
if (!gTumblerFull.optBase.some(o => o.label === '아이보리') || !gTumblerFull.optBase.some(o => o.label === '검정')) {
  throw new Error('gTumblerFull optBase should contain 검정, 아이보리, 연그린, 하늘색');
}

// ==========================================
// Test 10: 도어스토퍼 의뢰서 파싱 및 suggestKeywords 명사 추출 검증 (10/31 v130)
// 1) '로이시 원스텝 도어스토퍼 현관문 닫힘방지 무타공 자석 스토퍼' -> 대표 키워드 '도어스토퍼' (닫힘방지 오인식 방지)
// 2) 의뢰서 키워드 '도어스토퍼' 정상 파싱
// ==========================================
console.log('-- Test 10: 도어스토퍼 의뢰서 파싱 및 suggestKeywords 명사 추출 검증');
const doorKw = P.suggestKeywords('로이시 원스텝 도어스토퍼 현관문 닫힘방지 무타공 자석 스토퍼');
if (doorKw.main !== '도어스토퍼') throw new Error('Main keyword should be 도어스토퍼, got: ' + doorKw.main);
if (doorKw.subs.some(s => s.indexOf('닫힘방지') !== -1)) throw new Error('Subs should not include 닫힘방지, got: ' + JSON.stringify(doorKw.subs));

const reqDoor = `#입금대행 실배 17800

1. 구매진행시 검색할 키워드 : 도어스토퍼
2. 키워드 검색 시 현재 순위 :
3. 총 구매 건수 : 20
4. 일 진행 건수 : 10
5. 상품주소(URL) : https://www.coupang.com/vp/products/9790583445?vendorItemId=96227821123
6. 구매옵션 : 다크블랙
7. 포토제공 유 무 : 유
8. 리뷰내용 가이드 : 원스텝 방식, 자석 고정력 좋음`;

const headDoor = P.parseAll(reqDoor);
const gDoor = headDoor.guides[0];
if (gDoor.keyword !== '도어스토퍼') throw new Error('gDoor keyword should be 도어스토퍼, got: ' + gDoor.keyword);
if (gDoor.option !== '다크블랙') throw new Error('gDoor option should be 다크블랙, got: ' + gDoor.option);

// ==========================================
// Test 11: 보냉백 의뢰서 파싱 및 suggestKeywords 보냉백 명사 추출 검증 (10/31 v131)
// 1) '루오넬 온담 데일리 보온 보냉백 이유식 도시락가방 런치백' -> 대표 키워드 '보냉백'
// 2) link.coupang.com 공유 링크 및 구매옵션 '블랙 그레이 네이비' 정상 파싱
// ==========================================
console.log('-- Test 11: 보냉백 의뢰서 파싱 및 suggestKeywords 명사 추출 검증');
const bagKw = P.suggestKeywords('루오넬 온담 데일리 보온 보냉백 이유식 도시락가방 런치백');
if (bagKw.main !== '보냉백') throw new Error('Main keyword should be 보냉백, got: ' + bagKw.main);

const reqBag = `#입금대행 실배 17000
3명 상품받고 포토리뷰 
2명 원고제공 사진제공

1. 검색 키워드(미노출시 저희가 키워드땁니다): 보냉백
2. 키워드 검색 시 현재 순위 :모르시면 비워두세요
3. 총 결제하신 건수 : 5건
4. 하루 진행 건수 : 2+3
5. 상품주소(URL) : https://link.coupang.com/re/SHARESDPNUL?pageKey=9790575144&itemId=29312667128&vendorItemId=96227887527
6. 구매옵션 : 블랙 그레이 네이비 
7. 포토제공 (몇명)  /포토없음  선택:
실배송건 3개(블랙,그레이,네이비) 
전부 사진 10장
사진제공 2개
8. 리뷰 가이드 : 원고제공 
9. 입금하실 입금자명 : 아이누빅
10.택배대행 Y/N: N`;

const headBag = P.parseAll(reqBag);
const gBag = headBag.guides[0];
if (gBag.keyword !== '보냉백') throw new Error('gBag keyword should be 보냉백, got: ' + gBag.keyword);
// 의뢰서에 판매처 라벨이 없을 때는 입금자명(아이누빅)으로 유추하지 않고 빈칸(상품페이지 가져오기로 채움)
if (gBag.seller !== '') throw new Error('gBag seller should be empty before product page fetch, got: ' + gBag.seller);

// 의뢰서에 명시적인 판매처 라벨이 있을 때는 정상 파싱
const reqWithSeller = `판매처 : 아이누빅\n1. 검색 키워드 : 보냉백`;
const headWithSeller = P.parseAll(reqWithSeller);
if (headWithSeller.guides[0].seller !== '아이누빅') throw new Error('headWithSeller seller should be 아이누빅, got: ' + headWithSeller.guides[0].seller);

// ==========================================
// Test 12: 쿠팡 403 차단 문구 공지 유입 방지 및 필터링 검증 (10/31 v135)
// 1) isBlockedText: '요청하신 페이지의 사용권한이 없습니다', 'Access Denied', '접속이 제한' 감지
// 2) parseCoupang: 차단 화면 글자가 상품명/판매처에 유입되지 않고 차단(r.blocked) 처리되는지
// 3) baseName: 차단 문구 입력 시 빈 문자열 반환
// 4) posText: 차단 문구는 위치가 아님 → 빈칸 (1p로 채우지 않음, 11/1 사용자)
// ==========================================
console.log('-- Test 12: 쿠팡 403 차단 문구 공지 유입 방지 및 필터링 검증');
if (!P.isBlockedText('요청하신 페이지의 사용권한이 없습니다.')) throw new Error('isBlockedText should detect 사용권한 없음');
if (!P.isBlockedText('Access Denied - You do not have permission')) throw new Error('isBlockedText should detect Access Denied');
if (!P.isBlockedText('비정상적인 접근으로 접속이 제한되었습니다')) throw new Error('isBlockedText should detect 접속이 제한');

const blockedParse = P.parseCoupang('상품명 : 요청하신 페이지의 사용권한이 없습니다.\n판매처 : 사용권한이 없습니다\n위치 : 요청하신 페이지의 사용권한이 없습니다');
if (blockedParse.pname) throw new Error('parseCoupang should not set pname for blocked text, got: ' + blockedParse.pname);
if (blockedParse.seller) throw new Error('parseCoupang should not set seller for blocked text, got: ' + blockedParse.seller);
if (blockedParse.page) throw new Error('parseCoupang should not turn blocked text into a position, got: ' + blockedParse.page);
if (!blockedParse.blocked) throw new Error('parseCoupang should set blocked flag');

if (P.baseName('요청하신 페이지의 사용권한이 없습니다.') !== '') throw new Error('baseName should return empty for blocked text');
if (P.posText({ page: '요청하신 페이지의 사용권한이 없습니다' }) !== '') throw new Error('posText should be empty for blocked text, got: ' + P.posText({ page: '요청하신 페이지의 사용권한이 없습니다' }));
if (P.posText({ page: '못 찾음' }) !== '' || P.posText({}) !== '') throw new Error('posText should be empty when position unknown (no fake 1p)');
if (P.posText({ page: '가검9800 2p' }) !== '가검9800 2p') throw new Error('posText should keep a real position, got: ' + P.posText({ page: '가검9800 2p' }));

// ==========================================
// Test 13: 텀블러 등 품목 명사 추천 보존 및 prompt 제거 검증 (11/01 v141)
// 1) suggestKeywords: '텀블러 500ml 보온보냉'처럼 첫 단어가 품목 명사일 때 브랜드로 잘라내지 않고 '텀블러' 추천
// 2) index.html / oy.js 코드에 '의뢰서 검색 키워드를 입력해 주세요' prompt가 없는지 정적 검증
// ==========================================
console.log('-- Test 13: 텀블러 등 품목 명사 추천 보존 및 prompt 제거 검증');
const sugTumbler = P.suggestKeywords('텀블러 500ml 보온보냉 빨대 물병');
if (sugTumbler.main !== '텀블러') throw new Error('suggestKeywords main should be 텀블러, got: ' + sugTumbler.main);

const oyCode = fs.readFileSync(path.join(__dirname, '../ext/oy.js'), 'utf8');
const indexCode = fs.readFileSync(path.join(__dirname, '../../guide/index.html'), 'utf8');
if (oyCode.includes('의뢰서 검색 키워드를 입력해 주세요')) throw new Error('oy.js should not contain keyword prompt');
if (indexCode.includes('의뢰서 검색 키워드를 입력해 주세요')) throw new Error('guide/index.html should not contain keyword prompt');

// ==========================================
// Test 14: 과일·농산물·식품 품목 명사 보강 및 꿀brix 등 당도/유통 수식어 키워드 추출 차단 검증 (11/01 v142)
// 1) suggestKeywords: '50박스한정 꿀brix 산지직송 햇배 나주배' -> '나주배' (꿀brix 오추출 완전 차단)
// 2) '써니마켓 대봉감 12' -> '대봉감'
// 3) '마켓담온 귤 8' -> '귤' (1글자 과일 명사 인식)
// 4) '모두의농수산 옥광밤 5' -> '옥광밤'
// ==========================================
console.log('-- Test 14: 과일·농산물·식품 품목 명사 보강 및 꿀brix 등 당도/유통 수식어 키워드 추출 차단 검증');
const sugNaju = P.suggestKeywords('50박스한정 꿀brix 산지직송 햇배 나주배');
if (sugNaju.main !== '나주배') throw new Error('suggestKeywords main should be 나주배, got: ' + sugNaju.main);

const sugGam = P.suggestKeywords('써니마켓 대봉감 12');
if (sugGam.main !== '대봉감') throw new Error('suggestKeywords main should be 대봉감, got: ' + sugGam.main);

const sugGyul = P.suggestKeywords('마켓담온 귤 8');
if (sugGyul.main !== '귤') throw new Error('suggestKeywords main should be 귤, got: ' + sugGyul.main);

const sugBam = P.suggestKeywords('모두의농수산 옥광밤 5');
if (sugBam.main !== '옥광밤') throw new Error('suggestKeywords main should be 옥광밤, got: ' + sugBam.main);


// ==========================================
// Test 15: 쿠팡 URL 쿼리스트링(?kw=, &kw=) 차단 및 해시(#kw=) 단일 전달 검증 (11/01 v143)
// 1) open.html buildTargetUrl: 쿼리스트링에 kw, pr, fn이 절대 들어가지 않고 해시(#kw=)로만 전달되는지 검증
// 2) index.html buildFullUrl: 쿼리스트링에 kw, pr, fn이 절대 들어가지 않고 해시(#kw=)로만 전달되는지 검증
// ==========================================
console.log('-- Test 15: 쿠팡 URL 쿼리스트링(?kw=, &kw=) 차단 및 해시(#kw=) 단일 전달 검증');
const openCode = fs.readFileSync(path.join(__dirname, '../../guide/open.html'), 'utf8');
if (/res\s*\+=\s*sep\s*\+\s*["']kw=["']/.test(openCode)) throw new Error('open.html should not append kw to query string');
if (/u\s*\+=\s*\(.*\?.*\)\s*\+\s*["']kw=["']/.test(indexCode)) throw new Error('index.html should not append kw to query string');

// ==========================================
// Test 16: '는 다를 수 있습니다' 등 비정상 판매처 차단 및 괄사/문어괄사 품목 명사 보강 검증 (11/01 v150)
// 1) okSeller: '는 다를 수 있습니다.', '다를 수 있습니다', '가입' 차단, '코코스무', '아이누빅' 허용
// 2) parseCoupang: '판매처 : 는 다를 수 있습니다.' 파싱 시 seller가 빈칸으로 차단되는지 검증
// 3) suggestKeywords: '코코스무 문어 괄사...' 상품명에서 '무'에 의한 '코코스무' 오추출 차단 및 '괄사'/'문어 괄사' 추천 검증
// ==========================================
console.log('-- Test 16: 비정상 판매처 차단 및 괄사 품목 명사 보강 검증');
if (P.okSeller('는 다를 수 있습니다.')) throw new Error('okSeller should reject 는 다를 수 있습니다.');
if (P.okSeller('다를 수 있습니다')) throw new Error('okSeller should reject 다를 수 있습니다');
if (P.okSeller('가입')) throw new Error('okSeller should reject 가입');
if (!P.okSeller('코코스무')) throw new Error('okSeller should accept 코코스무');
if (!P.okSeller('아이누빅')) throw new Error('okSeller should accept 아이누빅');

const badSellerParse = P.parseCoupang('상품명 : 코코스무 문어 괄사\n판매처 : 는 다를 수 있습니다.\n상품번호 : 9783998793\n위치 : 1p');
if (badSellerParse.seller !== '') throw new Error('parseCoupang should filter out bad seller, got: ' + badSellerParse.seller);

const sugGuasha = P.suggestKeywords('코코스무 문어 괄사 두피 승모근 바디 마사지기 지압 전신 붓기제거 뷰티 홈케어');
if (sugGuasha.main === '코코스무') throw new Error('suggestKeywords main should not be 코코스무');
if (sugGuasha.main !== '괄사' && sugGuasha.main !== '문어 괄사') throw new Error('suggestKeywords main should be 괄사 or 문어 괄사, got: ' + sugGuasha.main);

// ==========================================
// Test 17: 코코스무 신발 뒤꿈치 패드 복합명사 키워드 추출 및 sugKw 대표 키워드('패드' 단일어 오추출 방지) 검증 (11/01 v151)
// 1) sugKw: '코코스무 신발 뒤꿈치 수선 보호 패드...' -> 대표 키워드(0번) '코코스무 신발 뒤꿈치 패드'
// 2) sugKw: '코코스무 문어 괄사...' -> 대표 키워드(0번) '코코스무 문어 괄사'
// 3) '패드' 단일어가 대표 키워드로 선택되지 않는지(0번이 아님) 검증
// 4) 의뢰서 키워드 '코코스무 신발 뒤꿈치 패드' 정상 파싱
// ==========================================
console.log('-- Test 17: 복합명사 키워드 추출 및 sugKw 대표 키워드 검증');
const sugPad = P.sugKw('코코스무 신발 뒤꿈치 수선 보호 패드 구두 운동화 발까짐 잘라서쓰는 만능패치 6개');
if (sugPad[0] !== '코코스무 신발 뒤꿈치 패드') throw new Error('sugKw[0] should be 코코스무 신발 뒤꿈치 패드, got: ' + sugPad[0]);
if (sugPad[0] === '패드') throw new Error('sugKw[0] should not be single word 패드');

const sugOct = P.sugKw('코코스무 문어 괄사 두피 승모근 바디 마사지기 지압 전신 붓기제거 뷰티 홈케어');
if (sugOct[0] !== '코코스무 문어 괄사') throw new Error('sugKw[0] should be 코코스무 문어 괄사, got: ' + sugOct[0]);

const reqPad = `#입금대행 실배 

1. 검색 키워드(미노출시 저희가 키워드땁니다): 코코스무 신발 뒤꿈치 패드
2. 키워드 검색 시 현재 순위 :
3. 총 결제하신 건수 : 5
4. 하루 진행 건수 : 5
5. 상품주소(URL) : https://www.coupang.com/vp/products/9785776578?vendorItemId=96214179259
6. 구매옵션 : 블랙 (옵션단일)
7. 포토제공 (몇명) /포토없음 선택: 포토5명
8. 리뷰 가이드 : 잘 붙음
9. 입금하실 입금자명 : 유종욱
10.택배대행 Y/N: n`;

const headPad = P.parseAll(reqPad);
const gPad = headPad.guides[0];
if (gPad.keyword !== '코코스무 신발 뒤꿈치 패드') throw new Error('gPad keyword should be 코코스무 신발 뒤꿈치 패드, got: ' + gPad.keyword);
if (gPad.option !== '블랙 (옵션단일)') throw new Error('gPad option should be 블랙 (옵션단일), got: ' + gPad.option);


// ==========================================
// 11/9 털깔창·십자가: 한 줄에 '2. 키워드 검색 시 현재 순위 :'가 붙어 옴, '230mmx2, 235mmx2, 240mmx2,' = 옵션마다 2건 날마다 하나씩, 머리 줄 가격 4개 = 옵션 수 합
// ==========================================
console.log('-- Test 11/9: 털깔창 NxM 옵션·날짜별 한 옵션·머리 가격 나누기');
{
  const req = `#입금대행 택대 9500 9700 9700 12700

1. 검색 키워드(미노출시 저희가 키워드땁니다): 털깔창 2. 키워드 검색 시 현재 순위 : 
3. 총 구매 건수 : 6
4. 일 진행 건수 : 2
5. 상품주소(URL) : https://www.coupang.com/vp/products/9802134183?vendorItemId=96265158903
6. 구매옵션 : 230mmx2, 235mmx2, 240mmx2, 
7. 포토제공 유 무  : 무
8. 리뷰내용 가이드 : 별점5개 + 자율작성
9. 입금하실 입금자명 : 더호컴퍼니
10.택배대행 Y/N: Y
=============

1. 검색 키워드(미노출시 저희가 키워드땁니다): 십자가                                                                       2. 키워드 검색 시 현재 순위 : 
3. 총 구매 건수 : 6
4. 일 진행 건수 : 2
5. 상품주소(URL) : https://www.coupang.com/vp/products/9516300672?vendorItemId=96292635976
6. 구매옵션 : 브라운  
7. 포토제공 유 무  : 무
8. 리뷰내용 가이드 : 별점5개 + 자율작성
9. 입금하실 입금자명 : 더호컴퍼니
10.택배대행 Y/N: Y`;
  const h = P.parseAll(req), g0 = h.guides[0], g1 = h.guides[1];
  if (h.guides.length !== 2) throw new Error('털깔창: guides should be 2, got ' + h.guides.length);
  if (g0.keyword !== '털깔창' || g1.keyword !== '십자가') throw new Error('털깔창: keywords wrong: ' + g0.keyword + ' / ' + g1.keyword);
  if (g0.optBase.map(o => o.label + ':' + o.qty).join(',') !== '230mm:2,235mm:2,240mm:2') throw new Error('털깔창: options wrong: ' + JSON.stringify(g0.optBase));
  const days = [1, 2, 3].map(d => P.optionText(g0, d)).join(' | ');
  if (days !== '230mm (2명) | 235mm (2명) | 240mm (2명)') throw new Error('털깔창: per-day options wrong: ' + days);
  if (g0.price !== '9500\n9700\n9700' || g1.price !== '12700') throw new Error('털깔창: prices wrong: ' + JSON.stringify([g0.price, g1.price]));
  if (g1.option !== '브라운' || !h.takdae) throw new Error('십자가: option/takdae wrong');
  // 합이 총 건수가 아니면(상품 개수 묶음일 수 있음) 안 나눔
  const h2 = P.parseAll(req.replace('3. 총 구매 건수 : 6', '3. 총 구매 건수 : 10'));
  if (h2.guides[0].optBase.length !== 1) throw new Error('NxM sum != total should not split');
  console.log('✓ 털깔창·십자가 의뢰서 통과');
}
// 11/9: 로켓배송 아닌 쿠팡 상품은 공지에 강조 줄
{ const html = fs.readFileSync(htmlPath, 'utf8');
  if (!/" \(로켓아니에요!!!! 판매자변경 후 일반배송으로 구매해주세요\)"/.test(html)) throw new Error('non-rocket price note missing');
  if (/MEMO_F = \[[^\]]*"page"/.test(html)) throw new Error('page must not be recalled from memory');
  if (/blocked \? "1p"/.test(html)) throw new Error('blocked must not become 1p');
  console.log('✓ 로켓 아님 가격 줄·위치 기억 안 함·막힘≠1p'); }

// ==========================================
// 11/9 설향딸기·황금향·콜라비: 구매옵션 줄 '/ 가격' 분리, '첫페이지' 필터 안내 보존, 토스 위치 기본 1p
// ==========================================
console.log('-- Test 11/9: 설향딸기·황금향·콜라비 구매옵션/가격 분리·첫페이지·토스 1p');
{
  const req = `#입금대행 택대 

쿠팡

1. 검색 키워드(미노출시 저희가 키워드땁니다): 설향딸기
2. 키워드 검색 시 현재 순위 : 필터 비건 누른 후 첫페이지 (꼭 비건 검색후 비건 누른후 주문)
3. 총 구매 건수 : 50건
4. 일 진행 건수 : 10건/5일
5. 상품주소(URL) :https://www.coupang.com/vp/products/9809724828?vendorItemId=96289446902
6. 구매옵션 : 350g(특품)x1박스 / 25.600
7. 포토제공 유 무  : 유 (텍스트35/포토15)
8. 리뷰내용 가이드 :  자율
9. 입금하실 입금자명 : 조장근
10.택배대행 Y/N: y


*리뷰어 결제수단은 자율입니다 




1. 검색 키워드(미노출시 저희가 키워드땁니다): 황금향
2. 키워드 검색 시 현재 순위 : 필터 비건 누른 후 첫페이지 (꼭 비건 검색후 비건 누른후 주문)
3. 총 구매 건수 : 50건
4. 일 진행 건수 : 10건/5일
5. 상품주소(URL) : https://www.coupang.com/vp/products/9799819790?vendorItemId=96257574766
6. 구매옵션 : 3kg(로얄과) x 1박스 / 13,800
7. 포토제공 유 무  : 유 (텍스트35/포토15)
8. 리뷰내용 가이드 :  자율
9. 입금하실 입금자명 : 조장근
10.택배대행 Y/N: y
=============

밑에는 토스
1. 검색 키워드(미노출시 저희가 키워드땁니다): 콜라비
2. 키워드 검색 시 현재 순위 : 
3. 총 구매 건수 : 10건
4. 일 진행 건수 : 5건/2일
5. 상품주소(URL) : https://service.toss.im/shopping-discovery/c/2719238869
6. 구매옵션 : 1박스, 3kg /  12.400
7. 포토제공 유 무  : 유 (텍스트7/포토3)
8. 리뷰내용 가이드 :  자율
9. 입금하실 입금자명 : 조장근
10.택배대행 Y/N: y


*리뷰어 결제수단은 자율입니다


 
1. 검색 키워드(미노출시 저희가 키워드땁니다): 설향딸기
2. 키워드 검색 시 현재 순위 : 
3. 총 구매 건수 : 10건
4. 일 진행 건수 : 5건/2일
5. 상품주소(URL) : https://service.toss.im/shopping-discovery/c/2719252781
6. 구매옵션 : 350g /  25.600
7. 포토제공 유 무  : 유 (텍스트7/포토3)
8. 리뷰내용 가이드 :  자율
9. 입금하실 입금자명 : 조장근
10.택배대행 Y/N: y`;

  const h = P.parseAll(req);
  if (h.guides.length !== 4) throw new Error('guides length should be 4, got ' + h.guides.length);
  const [g0, g1, g2, g3] = h.guides;
  if (g0.option !== '350g(특품)x1박스' || g0.price !== '25,600') throw new Error('g0 option/price wrong: ' + g0.option + ' / ' + g0.price);
  if (!P.posText(g0).includes('1p') || !P.posText(g0).includes('비건')) throw new Error('g0 posText wrong: ' + P.posText(g0));
  if (g1.option !== '3kg(로얄과) x 1박스' || g1.price !== '13,800') throw new Error('g1 option/price wrong: ' + g1.option + ' / ' + g1.price);
  if (!P.posText(g1).includes('1p') || !P.posText(g1).includes('비건')) throw new Error('g1 posText wrong: ' + P.posText(g1));
  if (g2.option !== '1박스, 3kg' || g2.price !== '12,400') throw new Error('g2 option/price wrong: ' + g2.option + ' / ' + g2.price);
  if (P.posText(g2) !== '1p' || g2.platform !== '토스') throw new Error('g2 posText/platform wrong: ' + P.posText(g2) + ' / ' + g2.platform);
  if (g3.option !== '350g' || g3.price !== '25,600') throw new Error('g3 option/price wrong: ' + g3.option + ' / ' + g3.price);
  if (P.posText(g3) !== '1p' || g3.platform !== '토스') throw new Error('g3 posText/platform wrong: ' + P.posText(g3) + ' / ' + g3.platform);
  console.log('✓ 설향딸기·황금향·콜라비 의뢰서 옵션/가격 분리·첫페이지·토스 1p 시험 통과');
}

// ==========================================
// 11/10 시나노골드사과: 머리 가격 2개와 쉼표 옵션(3kg, 5kg) 분리, 일건수 옵션 균등 분할(5명씩), 가격 매칭
// ==========================================
console.log('-- Test 19: 시나노골드사과 쉼표 옵션/머리 가격 분리 및 일건수 균등 분할 (11/10 v166)');
{
  const req = `#입금대행 택대 14400 22000 

1. 검색 키워드(미노출시 저희가 키워드땁니다): 시나노골드사과
2. 키워드 검색 시 현재 순위 :모르시면 비워두세요:
3. 총 결제하신 건수 : 20건
4. 하루 구매하는건수 (어뷰징 피하기위해 조금씩 변동될수 있습니다) : 10
5. 상품주소(URL) :  https://link.coupang.com/a/iwTEJY0Fj2
6.구매옵션 : 3kg, 5kg
7.포토제공 (몇명)  /포토없음  선택: 포토제공5명
8.리뷰 가이드 : 참고용 /원고제공 / 자율 택 : 자율
9.입금하실 입금자명 : 박희배`;

  const h = P.parseAll(req);
  if (h.guides.length !== 1) throw new Error('시나노골드: guides length should be 1');
  const g = h.guides[0];
  if (g.optBase.length !== 2) throw new Error('시나노골드: optBase length should be 2, got ' + g.optBase.length);
  if (g.optBase[0].label !== '3kg' || g.optBase[1].label !== '5kg') throw new Error('시나노골드: optBase labels wrong: ' + JSON.stringify(g.optBase));
  if (g.price !== '14400\n22000') throw new Error('시나노골드: price wrong: ' + g.price);
  const day1Opt = P.optionText(g, 1);
  if (day1Opt !== '3kg (5명)\n5kg (5명)') throw new Error('시나노골드: day1 options wrong: ' + day1Opt);
  const day2Opt = P.optionText(g, 2);
  if (day2Opt !== '3kg (5명)\n5kg (5명)') throw new Error('시나노골드: day2 options wrong: ' + day2Opt);
  console.log('✓ 시나노골드사과 쉼표 옵션·가격 분리·일건수 5명씩 균등 분할 시험 통과');
}

// ==========================================
// 11/10 털깔창: 쿠팡·네이버 다중 플랫폼 자동 분할, 머리 가격 1:1 매칭, 일일 범위(2-3개) 3명/2명 분할, 자율 옵션, 미노출 1p 가격검색 안내
// ==========================================
console.log('-- Test 20: 털깔창 쿠팡/네이버 다중 플랫폼 분할 및 미노출 가격검색·자율 옵션 (11/10 v169)');
{
  const req = `#입금대행 택대 16000 17000

 네이버 5개 쿠팡 5개입니다

1. 검색 키워드: 털깔창 
2. 키워드 검색 시 현재 순위 : 검색순위에 뜨지않아 최대한 검색유입으로 들어와주셨으면 좋겠습니다. 제가드린 링크는 판매자 링크여서 혹시나 판매링크로 어뷰징될까봐요.
3. 총 결제하신 건수 : 10
4. 하루 구매하는건수 (어뷰징 피하기위해 
조금씩 변동될수 있습니다 : 2-3개
5. 상품주소(URL) :
쿠팡: https://www.coupang.com/vp/products/8412539373?vendorItemId=91340804266
네이버: https://smartstore.naver.com/silverbanseok/products/13853314088?NaPm=ct%3Dmwa300eo%7Cci%3D048de972dc3281d2e8ef746f46ae648cc1cf0e29%7Ctr%3Dslsl%7Csn%3D10420044%7Chk%3Dbdb21dfaf9da61157b54b98d85c58ef3392edd40&nl-au=06e72923caf44370a33f9c22823bd1e7&nl-query=%EC%B8%84%EB%A6%AC%EC%83%A4+%ED%84%B8%EA%B9%94%EC%B0%BD

7. 구매옵션 : 사이즈별로 다양하게 , 1개
8. 포토제공 (10명)  / 오늘저녁중
9. 리뷰 가이드 : 원고제공  오늘저녁중
10. 입금하실 입금자명 : 김샤론
10.택배대행 Y/N: Y`;

  const h = P.parseAll(req);
  if (h.guides.length !== 2) throw new Error('털깔창: guides length should be 2, got ' + h.guides.length);
  const g0 = h.guides[0];
  const g1 = h.guides[1];
  if (g0.platform !== '쿠팡' || g0.total !== '5' || g0.daily !== '3' || g0.price !== '16000') {
    throw new Error('털깔창 g0(쿠팡) wrong: ' + JSON.stringify(g0));
  }
  if (g1.platform !== '네이버' || g1.total !== '5' || g1.daily !== '2' || g1.price !== '17000') {
    throw new Error('털깔창 g1(네이버) wrong: ' + JSON.stringify(g1));
  }
  if (g0.option !== '자율' || g1.option !== '자율') {
    throw new Error('털깔창 option should be 자율, got g0: ' + g0.option + ', g1: ' + g1.option);
  }
  if (!g0.keyword.includes('털깔창') || !g0.keyword.includes('가격검색')) {
    throw new Error('털깔창 keyword should include 가격검색, got: ' + g0.keyword);
  }
  if (!P.posText(g0).includes('1p') || !P.posText(g0).includes('가격검색')) {
    throw new Error('털깔창 posText should include 1p and 가격검색, got: ' + P.posText(g0));
  }
  if (g0.review.includes('네이버 5개')) {
    throw new Error('털깔창 review should not include allocation line, got: ' + g0.review);
  }
  console.log('✓ 털깔창 쿠팡/네이버 다중 플랫폼 분할·가격 1:1 매칭·미노출 가격검색·자율 옵션 시험 통과');
}

// ==========================================
// 11/10 v170: 20자 미만 시 방제에 업체명 포함 및 다중 플랫폼(쿠팡+네이버) '네쿠' 태그
// ==========================================
console.log('-- Test 21: 20자 미만 시 업체명 포함 및 쿠팡/네이버 다중 플랫폼 "네쿠" 태그 (11/10 v170)');
{
  // 1) 단일 가이드 20자 이내: 업체명 포함
  P.setGuides([{
    keyword: '흡착장난감',
    seller: '빌랑',
    platform: '쿠팡'
  }]);
  getElem('takdae').checked = false;
  getElem('realship').checked = true;
  getElem('fruit').checked = false;
  getElem('t-up').checked = false;
  const room1 = P.makeRoom('11.11', '4');
  if (room1 !== '#11.11 실 빌랑 흡착장난감 4') {
    throw new Error('Test 21-1 room failed: expected "#11.11 실 빌랑 흡착장난감 4", got "' + room1 + '"');
  }

  // 2) 쿠팡+네이버 다중 가이드: 실버반석 네쿠 털깔창5
  P.setGuides([
    { keyword: '털깔창', seller: '실버반석', platform: '쿠팡' },
    { keyword: '털깔창', seller: '실버반석', platform: '네이버' }
  ]);
  getElem('takdae').checked = true;
  getElem('realship').checked = false;
  getElem('fruit').checked = false;
  getElem('t-up').checked = false;
  const room2 = P.makeRoom('11.11', '5');
  if (room2 !== '#택11.11 실버반석 네쿠 털깔창5') {
    throw new Error('Test 21-2 room failed: expected "#택11.11 실버반석 네쿠 털깔창5", got "' + room2 + '"');
  }
  console.log('✓ 20자 미만 시 업체명 포함 및 쿠팡/네이버 네쿠 태그 시험 통과');
}

// ==========================================
// 11/11: 나주배 프라임스토어 (URL 라벨 콜론 누락, 6:4 포토/텍스트 비율, 2~3개 일진행 범위, 콜론 뒤 빈값)
// ==========================================
console.log('-- Test 22: 나주배 프라임스토어 (URL 라벨 콜론 누락, 6:4 포토/텍스트 비율, 2~3개 일진행 범위) (11/11 v173)');
{
  const req = `#입금대행 택대 11900

1. 검색 키워드(미노출시 저희가 키워드땁니다): 나주배
2. 키워드 검색 시 현재 순위 :
3. 총 결제하신 건수 :5건
4. 하루 진행 건수 : 2~3
5. 상품주소(URL) https://www.coupang.com/vp/products/9793507010?vendorItemId=96237112311
6. 구매옵션 :3kg 11900원
7. 포토제공 (몇명) 제공 6:4비율 /포토없음  선택:
8. 리뷰 가이드 : 참고용 /원고제공 / 자율 택 자율
9. 입금하실 입금자명 :최현주(프라임스토어
10.택배대행 Y/N: Y`;

  const fields = P.fieldsOf(req);
  if (fields.url !== 'https://www.coupang.com/vp/products/9793507010?vendorItemId=96237112311') {
    throw new Error('Test 22 fields.url failed: ' + fields.url);
  }
  if (fields.daily !== '2~3') {
    throw new Error('Test 22 fields.daily failed: ' + fields.daily);
  }
  if (fields.option !== '3kg 11900원') {
    throw new Error('Test 22 fields.option failed: ' + fields.option);
  }
  if (!fields.photo.includes('6:4비율')) {
    throw new Error('Test 22 fields.photo failed: ' + fields.photo);
  }

  const h = P.parseAll(req);
  if (h.guides.length !== 1) throw new Error('Test 22 guides length should be 1');
  const g = h.guides[0];
  if (g.daily !== '3') throw new Error('Test 22 g.daily should be 3, got: ' + g.daily);
  if (g.total !== '5') throw new Error('Test 22 g.total should be 5, got: ' + g.total);
  if (g.days.length !== 2 || g.days[0].n !== '3' || g.days[1].n !== '2') {
    throw new Error('Test 22 g.days wrong: ' + JSON.stringify(g.days));
  }
  if (g.option !== '3kg') throw new Error('Test 22 g.option should be 3kg, got: ' + g.option);
  if (g.price !== '11900') throw new Error('Test 22 g.price should be 11900, got: ' + g.price);
  if (!g.review.includes('포토대기 3개 / 텍스트리뷰 2개')) {
    throw new Error('Test 22 g.review should include 포토대기 3개 / 텍스트리뷰 2개, got: ' + g.review);
  }
  console.log('✓ 나주배 프라임스토어 URL 콜론 누락·6:4 포토비율·2~3개 일범위 시험 통과');
}

// ==========================================
console.log('-- Test 23: 산지잇다 감홍사과 (키워드 괄호 필터 분리·위치 연동, 상품번호 마스킹) (11/11 v174)');
{
  const req = `#입금대행 택대 16000

1. 검색 키워드(미노출시 저희가 키워드땁니다):감홍사과(비건필터체크후검색해주세요)
2. 키워드 검색 시 현재 순위 :모르시면 비워두세요
3. 총 결제하신 건수 :20
4. 하루 구매하는건수 (어뷰징 피하기위해 
조금씩 변동될수 있습니다 : 20
5. 상품주소(URL) :https://link.coupang.com/a/ixcSlAmmTk/?style=kakao_existing_ui
6. 구매옵션 :2kg 20건
7. 포토제공 (몇명)  /포토없음  선택: 포토있음
8. 리뷰 가이드 : 참고용 /원고제공 / 자율 택 :짧게 팩트만 써주세요(꼭 키워드검색후 구매부탁드립니다) 
9. 입금하실 입금자명 :김도연
10.택배대행 Y/N: Y`;

  const h = P.parseAll(req);
  if (h.guides.length !== 1) throw new Error('Test 23 guides length should be 1');
  const g = h.guides[0];
  if (g.keyword !== '감홍사과') {
    throw new Error('Test 23 keyword should be 감홍사과 without filter parentheses, got: ' + g.keyword);
  }
  if (!g.page.includes('1p') || !g.page.includes('비건 필터 체크 후 검색')) {
    throw new Error('Test 23 page should include 1p and filter instruction, got: ' + g.page);
  }
  if (g.total !== '20') throw new Error('Test 23 total should be 20, got: ' + g.total);
  if (g.daily !== '20') throw new Error('Test 23 daily should be 20, got: ' + g.daily);
  if (!g.option.includes('2kg')) throw new Error('Test 23 option should include 2kg, got: ' + g.option);

  // 상품번호 마스킹 검증
  const fullItemId = '29383892880';
  const masked = P.maskItem ? P.maskItem(fullItemId) : (fullItemId.slice(0, 4) + '***' + fullItemId.slice(-4));
  if (masked !== '2938***2880') {
    throw new Error('Test 23 maskItem failed: ' + masked);
  }
  console.log('✓ 산지잇다 감홍사과 키워드 괄호필터 분리·위치 1p 연동·상품번호 마스킹 시험 통과');
}

// ==========================================
console.log('-- Test 24: 엔부사과 (URL rank=0 1p 오인식 차단, 미노출 가격검색 연동, 30건 일건수·포토15/글15 파싱) (11/12 v175)');
{
  const req = `#입금대행 택대 10270

1. 검색 키워드(미노출시 저희가 키워드땁니다) : 엔부사과
2. 키워드 검색 시 현재 순위 : 모르시면 비워두세요
3. 총 결제하신 건수 : 30건
4. 하루 구매하는건수 (어뷰징 피하기위해 
조금씩 변동될수 있습니다) : 30건
5. 상품주소(URL) : https://www.coupang.com/vp/products/9814782843?itemId=29394608745&vendorItemId=96305758800&q=%EC%97%94%EB%B6%80%EC%82%AC%EA%B3%BC&searchId=631727792598260&sourceType=search&rank=0&itemsCount=19&searchRank=0&traceId=mwcuyoma
6. 구매옵션 : 1kg x 1박스
7. 포토제공 (몇명) / 포토없음 선택 : 포토 15명(1장-5건 / 3장-5건 / 6장이상 - 5건) / 글리뷰 15명
8. 리뷰 가이드 : 포토에 맞게 작성하되, 붉은 과육과 흰 과육이 함께 있는 사진의 경우에는 맛은 같았고, 맛과 향이 어우러져 좋다는 내용을 넣어주세요.
9. 입금하실 입금자명 : 신성경
10.택배대행 Y/N: N


*리뷰어 결제수단은 자율입니다`;

  const h = P.parseAll(req);
  if (h.guides.length !== 1) throw new Error('Test 24 guides length should be 1');
  const g = h.guides[0];
  if (g.keyword !== '엔부사과') {
    throw new Error('Test 24 keyword should be 엔부사과, got: ' + g.keyword);
  }
  // URL의 rank=0/searchRank=0으로 인해 단순 '1p'로 끝나지 않고, 미노출 감지로 가격검색 안내문이 연동되어야 함
  if (!g.page.includes('가격검색') || !g.page.includes('10,270')) {
    throw new Error('Test 24 page should include 가격검색 and 10,270, got: ' + g.page);
  }
  if (g.total !== '30') throw new Error('Test 24 total should be 30, got: ' + g.total);
  if (g.daily !== '30') throw new Error('Test 24 daily should be 30, got: ' + g.daily);
  if (g.option !== '1kg x 1박스') throw new Error('Test 24 option should be 1kg x 1박스, got: ' + g.option);
  if (!g.review.includes('포토대기') || !g.review.includes('텍스트리뷰')) {
    throw new Error('Test 24 review should include 포토대기 and 텍스트리뷰, got: ' + g.review);
  }
  console.log('✓ 엔부사과 URL rank=0 오인식 차단 및 미노출 가격검색 연동 시험 통과');
}

// Test 25: 기본문구 생략 번호 전용 의뢰서 (제주 황금향) 파싱 검증 (11/12 v176)
{
  const req = `#입금대행 택대 9200

1 제주 황금향
2 ?
3 30건
4 30건
5 https://link.coupang.com/a/iBAdieedLE
6 2kg
7 무
8 맛 신선도
9 최미화`;

  const h = P.parseAll(req);
  if (h.guides.length !== 1) throw new Error('Test 25 guides length should be 1');
  const g = h.guides[0];
  if (g.keyword !== '제주 황금향') {
    throw new Error('Test 25 keyword should be 제주 황금향, got: ' + g.keyword);
  }
  if (g.total !== '30') throw new Error('Test 25 total should be 30, got: ' + g.total);
  if (g.daily !== '30') throw new Error('Test 25 daily should be 30, got: ' + g.daily);
  if (!g.option.includes('2kg')) throw new Error('Test 25 option should include 2kg, got: ' + g.option);
  if (g.price !== '9200') throw new Error('Test 25 price should be 9200, got: ' + g.price);
  if (g.pname !== '제주 황금향') throw new Error('Test 25 pname should default to 제주 황금향, got: ' + g.pname);
  console.log('✓ 기본문구 생략 번호 전용 의뢰서(제주 황금향) 파싱 시험 통과');
}

// Test 26: 헤더 택대 vs 10번 N 충돌 시 conflictTakdae 검증 (11/12 v177)
{
  const req = `#입금대행 택대 10270

1. 검색 키워드: 엔부사과
2. 순위: 1p
3. 총 진행 건수: 30건
4. 일 진행 건수: 30건
5. 상품 주소: https://link.coupang.com/a/b96o4K
6. 옵션: 1kg x 1박스
7. 포토 / 텍스트 / 별점: 포토 15건 / 텍스트 15건
8. 리뷰 작성 가이드: 맛있어요
9. 입금자명: 오르베카
10.택배대행 Y/N: N`;

  const h = P.parseAll(req);
  if (!h.conflictTakdae) {
    throw new Error('Test 26 conflictTakdae should be true for header 택대 vs 10번 N conflict');
  }
  console.log('✓ 헤더 택대 vs 10번 N 충돌 감지(conflictTakdae) 시험 통과');
}

// Test 27: 업체입금 택대 메주 의뢰서 (지니네농수산) 파싱 검증 (11/12 v177)
{
  const req = `업체입금  택대 

1//쿠팡 지니네농수산

1. 구매진행시 검색할 키워드 : [국산콩 100%] 전통방식 햇 메주 재래식 메주 된장 간장 담그기 메주 덩어리
2. 일 진행 건수 : 포토 포함 총 30
3.상품주소
https://www.coupang.com/vp/products/9816176361?vendorItemId=96310017095
텍스트25 별점5

16,200원`;

  const h = P.parseAll(req);
  if (h.type !== '업체입금') throw new Error('Test 27 type should be 업체입금, got: ' + h.type);
  if (!h.takdae) throw new Error('Test 27 takdae should be true');
  const g = h.guides[0];
  if (g.seller !== '지니네농수산') throw new Error('Test 27 seller should be 지니네농수산, got: ' + g.seller);
  console.log('✓ 업체입금 택대 메주(지니네농수산) 의뢰서 파싱 시험 통과');
}

// Test 28: 실빈섞임 김상사 케이블타이 의뢰서 파싱 및 옵션·키워드·방제 검증 (11/12 v178)
{
  const req = `#입금대행 실빈섞임 택대 5명만실배 사진10장 원고제공 7900

1. 검색 키워드(미노출시 저희가 키워드땁니다):
2. 키워드 검색 시 현재 순위 :모르시면 비워두세요
3. 총 결제하신 건수 : 20
4. 하루 진행 건수 : 5
5. 상품주소(URL) : https://www.coupang.com/vp/products/9806740832?itemId=29368019782&vendorItemId=96280354169&q=%EC%A0%9C%EB%A5%B4%EB%84%AC+%EC%A0%84%EC%84%A0%EC%A0%95%EB%A6%AC&searchId=4320af7c936142&sourceType=search&rank=0&itemsCount=36&searchRank=0&traceId=mwd5idco

6. 구매옵션 :화이트 / 스몰 / 20개 / 7,900원 
7. 포토제공 (몇명)  /포토없음  선택:
8. 리뷰 가이드 : 원고제공
9. 입금하실 입금자명 : 김상사(김성열)
10.택배대행 Y/N: Y`;

  const h = P.parseAll(req);
  if (!h.silbin) throw new Error('Test 28 silbin should be true');
  const g = h.guides[0];

  // 1) 키워드에 '+' 기호가 들어가지 않아야 함
  if (g.keyword.includes('+')) throw new Error('Test 28 keyword must not contain +, got: ' + g.keyword);

  // 2) 구매옵션이 '20개'로 잘리지 않고 '화이트 / 스몰 / 20개'로 전체 보존되어야 함
  if (!g.optBase || g.optBase.length !== 1 || g.optBase[0].label !== '화이트 / 스몰 / 20개') {
    throw new Error('Test 28 optBase should be [화이트 / 스몰 / 20개], got: ' + JSON.stringify(g.optBase));
  }
  if (g.option !== '화이트 / 스몰 / 20개') {
    throw new Error('Test 28 option text should be 화이트 / 스몰 / 20개, got: ' + g.option);
  }
  if (g.price !== '7900') {
    throw new Error('Test 28 price should be 7900, got: ' + g.price);
  }

  // 3) 상품명 기반 대표 키워드 추천 검증
  const pname = '제르넬 깔끔한 책상 선정리 벨크로 전선정리 케이블 타이';
  const sug = P.suggestKeywords(pname, []);
  if (sug.main !== '케이블 타이') {
    throw new Error('Test 28 suggestKeywords main should be 케이블 타이, got: ' + sug.main);
  }
  if (!sug.subs.some(s => s.includes('책상 케이블 타이'))) {
    throw new Error('Test 28 suggestKeywords subs should include 책상 케이블 타이, got: ' + JSON.stringify(sug.subs));
  }

  console.log('✓ 실빈섞임 김상사 케이블타이 의뢰서 및 옵션·키워드·방제 시험 통과');
}

// Test 29: 카카오톡딜 수면공작소 70건 구확 의뢰서 파싱 및 실배송 해제·방제·시간·옵션 검증 (11/14 v180)
{
  const req = `#입금대행 구확 38800 48800

1. 검색 키워드(미노출시 저희가 키워드땁니다): x
2. 키워드 검색 시 현재 순위 :x
3. 총 구매 건수 :70
4. 일 진행 건수 :70
5. 상품주소(URL) : 
https://store.kakao.com/cguard/products/767845799
6. 구매옵션 : SS 40개 Q 30개
SS: 38,800 / Q: 48,800원
11월 16일 저녁 5시부터 7시 사이에 구매 요청
7. 포토제공 유 무  : 무
8. 리뷰내용 가이드 :  
-전 공정 대한민국 생산 MADE IN KOREA
-2합 모달원단 모달함량 2배
-부드럽고 고급스럽다 듀얼 위브 모달 100%
-고급형 자카드 밴드로 쉽고 간편하게 설치할수있다.
9. 입금하실 입금자명 :
10.택배대행 Y/N:n`;

  const h = P.parseAll(req);
  if (h.realship) throw new Error('Test 29 realship should be false for talkdeal');
  if (h.takdae) throw new Error('Test 29 takdae should be false for talkdeal');
  if (!h.isTalkdeal) throw new Error('Test 29 isTalkdeal should be true');
  if (h.platform !== '카카오톡딜') throw new Error('Test 29 platform should be 카카오톡딜, got: ' + h.platform);
  if (h.slot !== 'time') throw new Error('Test 29 slot should be time, got: ' + h.slot);
  if (h.slottime !== '17:00' || (h.slotend !== '19:00' && h.slotend !== '18:00')) {
    throw new Error('Test 29 slottime/slotend parse mismatch: ' + h.slottime + ' ~ ' + h.slotend);
  }

  const g = h.guides[0];
  if (g.optBase.length !== 2) throw new Error('Test 29 optBase length should be 2, got: ' + g.optBase.length);
  if (g.optBase[0].label !== 'SS' || g.optBase[0].qty !== '40') throw new Error('Test 29 optBase[0] mismatch: ' + JSON.stringify(g.optBase[0]));
  if (g.optBase[1].label !== 'Q' || g.optBase[1].qty !== '30') throw new Error('Test 29 optBase[1] mismatch: ' + JSON.stringify(g.optBase[1]));

  // 상품명 및 방제 검증
  g.pname = '[수면공작소] 국산 모달함량 2배 부드러운 사계절용 프리미엄 모달 침대패드. 영유아KC인증+고급형 자카드 밴드';
  g.seller = '바른자세와 편안함 씨가드';
  getElem('req').value = req;
  getElem('takdae').checked = false;
  P.setGuides(h.guides);
  const room = P.makeRoom('11.16', '70');
  if (room !== '#11.16 수면공작소 톡딜 구확70') {
    throw new Error('Test 29 room should be #11.16 수면공작소 톡딜 구확70, got: ' + room);
  }

  console.log('✓ 카카오톡딜 수면공작소 70건 의뢰서 및 방제·옵션·시간 시험 통과');
}

// Test 30: 톡딜 택배대행(빈박스) 정상 판정 및 방제 동적 조합·링크구매 키워드 예외 한정 검증 (11/14 v181)
{
  const reqTakdae = `#입금대행 택대 톡딜 15000

1. 검색 키워드 : 
2. 키워드 검색 시 현재 순위 :
3. 총 구매 건수 : 20
4. 일 진행 건수 : 20
5. 상품주소(URL) : https://store.kakao.com/brand/products/123456789
6. 구매옵션 : 단일
7. 포토제공 유 무 : 무
8. 리뷰내용 가이드 : 꼼꼼히 작성
9. 입금하실 입금자명 :
10.택배대행 Y/N: Y`;

  const h = P.parseAll(reqTakdae);
  if (h.realship) throw new Error('Test 30 realship should be false (빈박스)');
  if (!h.takdae) throw new Error('Test 30 takdae should be true when 10.택배대행 is Y');
  if (!h.isTalkdeal) throw new Error('Test 30 isTalkdeal should be true');

  // 방제 동적 조합 검증: #택11.16 날짜, 판매처(오즈네즈), 상품명(양말), 톡딜, 건수(20)
  const g = h.guides[0];
  g.seller = '오즈네즈';
  g.pname = '오즈네즈 순면 데일리 양말 세트';
  g.guide = '양말';
  getElem('req').value = reqTakdae;
  getElem('takdae').checked = true;
  P.setGuides(h.guides);
  const room = P.makeRoom('11.16', '20');
  // #택11.16 오즈네즈 양말 톡딜20 (17자)
  if (room !== '#택11.16 오즈네즈 양말 톡딜20') {
    throw new Error('Test 30 dynamic room mismatch: ' + room);
  }

  // 링크구매 예외 한정 검증: 키워드가 있으면 링크구매가 아님
  const reqWithKw = reqTakdae.replace('1. 검색 키워드 : ', '1. 검색 키워드 : 순면양말');
  const hWithKw = P.parseAll(reqWithKw);
  const rawKw = String(hWithKw.guides[0].keyword || '').trim();
  const hasNoKw = !rawKw || /^(x|X|-|무|없음)$/i.test(rawKw);
  if (hasNoKw) throw new Error('Test 30: rawKw should not be considered empty when keyword is present');

  console.log('✓ 톡딜 택배대행 정상 판정 및 방제 동적 조합·키워드 예외 한정 시험 통과');
}

// ==========================================
// 11/17 v186: 다중 상품 일차 인원 합산(문풍지 3 + 풍선 1 = 4, 2일차 2)·일차 계획 방제 형식·택 경고/보정·이름에 날짜/끝 숫자 없음
// ==========================================
console.log('-- Test 31: 다중 상품 일차 인원 합산·일차 계획 방제 형식·택 경고/보정·이름 (11/17 v186)');
{
  const req = `#입금대행 실배 8900 3900

1. 검색 키워드 : 문풍지
2. 키워드 검색 시 현재 순위 : 1위
3. 총 구매 건수 : 5건
4. 하루 진행 건수 : 3-2
5. 상품주소(URL) : https://www.coupang.com/vp/products/1111111111?vendorItemId=2222222222
6. 구매옵션 : 백색 10매
7. 포토제공 유 무 : 무
8. 리뷰내용 가이드 : 자율
9. 입금하실 입금자명 : 김수진
10.택배대행 Y/N : N
=================
1. 검색 키워드 : 풍선
2. 키워드 검색 시 현재 순위 : 3위
3. 총 구매 건수 : 1건
4. 하루 진행 건수 : 1
5. 상품주소(URL) : https://www.coupang.com/vp/products/3333333333?vendorItemId=4444444444
6. 구매옵션 : 레드 10개
7. 포토제공 유 무 : 무
8. 리뷰내용 가이드 : 자율
9. 입금하실 입금자명 : 김수진
10.택배대행 Y/N : N`;

  const h = P.parseAll(req);
  if (h.guides.length !== 2) throw new Error('Test 31 guides length should be 2, got: ' + h.guides.length);
  const g0 = h.guides[0], g1 = h.guides[1];
  if (!g0.days || g0.days.length !== 2 || g0.days[0].n !== '3' || g0.days[1].n !== '2') {
    throw new Error('Test 31 문풍지 하루 3-2 파싱 실패: ' + JSON.stringify(g0.days));
  }
  if (String(g1.total) !== '1' || String(g1.daily) !== '1') {
    throw new Error('Test 31 풍선 총 1·하루 1 파싱 실패: ' + JSON.stringify([g1.total, g1.daily]));
  }

  getElem('req').value = req;
  P.setGuides(h.guides);
  getElem('takdae').checked = false;
  getElem('realship').checked = true;
  getElem('fruit').checked = false;
  getElem('t-up').checked = false;
  getElem('t-ip').checked = true;
  getElem('day').value = '1';
  getElem('date').value = '2026-11-17';
  getElem('o-room').value = '';

  // ① 그날 인원 = 진행되는 상품별 인원 합 (1일차 문풍지 3 + 풍선 1 = 4, 2일차 2 + 0 = 2)
  if (P.dayTotalOf(1) !== '4') throw new Error('Test 31 1일차 인원은 4여야 함: ' + P.dayTotalOf(1));
  if (P.dayTotalOf(2) !== '2') throw new Error('Test 31 2일차 인원은 2여야 함: ' + P.dayTotalOf(2));
  const room1 = P.makeRoom('11.17', P.dayTotalOf(1));
  if (room1 !== '#11.17 실 문풍지 풍선 4') throw new Error('Test 31 1일차 방제 실패: ' + room1);

  // ② 일차 계획: 인원은 그날 합계, 방제는 1일차 방제 형식 그대로
  getElem('o-room').value = room1;
  const plan = P.buildPlan();
  if (plan.length !== 1) throw new Error('Test 31 2일차 계획이 1개여야 함: ' + JSON.stringify(plan));
  if (Number(plan[0].n) !== 2) throw new Error('Test 31 2일차 계획 인원은 2여야 함: ' + plan[0].n + ' / ' + JSON.stringify(plan[0].c));
  if (plan[0].room !== '#11.18 실 문풍지 풍선 2') throw new Error('Test 31 2일차 방제 실패: ' + plan[0].room);
  if (P.planRoomFrom('#11.17 실 에스지엠컴퍼니문풍지외4', '11.18', '2') !== '#11.18 실 에스지엠컴퍼니문풍지외2') {
    throw new Error('Test 31 업체명 들어간 1일차 형식 미준수: ' + P.planRoomFrom('#11.17 실 에스지엠컴퍼니문풍지외4', '11.18', '2'));
  }

  // ③ 명단 시트·폼·폴더 이름에는 날짜·끝 숫자가 없음
  const cases = [
    ['#11.17 실 에스지엠컴퍼니문풍지외4', '4', '# 실 에스지엠컴퍼니문풍지외'],
    ['#택11.17 실 문풍지 풍선 4', '4', '#택 실 문풍지 풍선'],
    ['#택11.16 과일쏙 못난이사과외6', '6', '#택 과일쏙 못난이사과외'],
    ['#11.13 실 빌랑 흐착장난감 4', '4', '# 실 빌랑 흐착장난감']
  ];
  cases.forEach(([r0, c0, want]) => {
    const got = P.sheetBaseName(r0, c0);
    if (got !== want) throw new Error('Test 31 이름 실패: ' + r0 + ' → ' + got + ' (기대 ' + want + ')');
    if (/\d{1,2}\.\d{1,2}/.test(got) || /\d$/.test(got)) throw new Error('Test 31 이름에 날짜·끝 숫자가 남음: ' + got);
  });

  // ④ 택: '#택11.17 …'·'#11.16택 …'은 택 포함으로 보고, 없으면 '#택…'으로 붙임
  if (!P.roomHasTak('#택11.17 실 문풍지 4')) throw new Error('Test 31 #택11.17을 택 포함으로 못 봄');
  if (!P.roomHasTak('#11.16택 실/빈 김상사 5')) throw new Error('Test 31 #11.16택을 택 포함으로 못 봄');
  if (!P.roomHasTak('업)택11.16 에스지엠 3')) throw new Error('Test 31 업)택을 택 포함으로 못 봄');
  if (P.roomHasTak('#11.17 실 문풍지 4')) throw new Error('Test 31 택 없는 방제를 택 있음으로 봄');
  if (P.takFixRoom('#11.17 실 문풍지 4') !== '#택11.17 실 문풍지 4') throw new Error('Test 31 택 붙이기 실패: ' + P.takFixRoom('#11.17 실 문풍지 4'));
  if (P.takFixRoom('업)11.16 에스지엠 3') !== '업)택11.16 에스지엠 3') throw new Error('Test 31 업)택 붙이기 실패: ' + P.takFixRoom('업)11.16 에스지엠 3'));
  if (P.takFixRoom('#11.16실/빈 김상사 케일블타이5') !== '#택11.16실/빈 김상사 케일블타이5') throw new Error('Test 31 실/빈 택 붙이기 실패');
  if (P.takFixRoom('#택11.17 실 문풍지 4') !== '#택11.17 실 문풍지 4') throw new Error('Test 31 이미 있는 택을 또 붙임');

  // ⑤ 택대 Y인데 폼 만들 때 확인창: 실배송이면 안 물어보고, 택대면 한 번은 물어봄
  getElem('takdae').checked = true;
  getElem('realship').checked = false;
  if (P.takAskNeeded('#11.17 문풍지 4') !== true) throw new Error('Test 31 택대인데 택이 없으면 확인창이 떠야 함');
  if (P.takAskNeeded('#택11.17 문풍지 4') !== false) throw new Error('Test 31 방제에 택이 이미 있으면 확인창 안 뜸 (11/17 수진 님)');
  getElem('realship').checked = true;
  if (P.takAskNeeded('#11.17 문풍지 4') !== false) throw new Error('Test 31 실배송이면 택 확인창이 뜨면 안 됨');
  getElem('takdae').checked = false;

  console.log('✓ 다중 상품 일차 인원 합산·일차 계획 방제 형식·택 경고/보정·이름 시험 통과');
}

// ==========================================
// 11/17 v189: 일차 인원 표기 보강 — 화살표(->, =>, →)·범위, '첫째날/둘째날(첫날)', '명' 단위
// ==========================================
console.log('-- Test 32: 일차 인원 표기 보강 — 화살표·첫째날·명 단위 (11/17 v189)');
{
  // 실제 의뢰서 형태(탄탄상점 레깅스): 총 50건, 하루 '20건 -> 30건' → 1일차 20 · 2일차 30
  const mk = dv => `#입금대행 실배 9800

1. 검색 키워드 : 여자 기모 레깅스
2. 키워드 검색 시 현재 순위 : 2p
3. 총 결제하신 건수 : 50건
4. 하루 구매하는건수 : ${dv}
5. 상품주소(URL) : https://www.coupang.com/vp/products/9794265189?vendorItemId=8888888888
6. 구매옵션 : 블랙블랙 유발
7. 포토제공 유 무 : 무
8. 리뷰내용 가이드 : 자율
9. 입금하실 입금자명 : 김수진
10.택배대행 Y/N : N`;

  const cases = [
    ['20건 -> 30건', ['20', '30']],
    ['20명->30명', ['20', '30']],
    ['20건 => 30건', ['20', '30']],
    ['20 → 30', ['20', '30']],
    ['첫째날 20명 둘째날 30명', ['20', '30']],
    ['첫날 20명 둘째날 30명', ['20', '30']],
    ['첫째날은 20명, 둘째날은 30명', ['20', '30']],
    ['1일차 20명 2일차 30명', ['20', '30']],
    ['1일차 20건 2일차 30건', ['20', '30']]
  ];
  cases.forEach(([dv, want]) => {
    const h = P.parseAll(mk(dv));
    if (h.guides.length !== 1) throw new Error('Test 32 guides length should be 1 for [' + dv + '], got: ' + h.guides.length);
    const g = h.guides[0];
    const got = (g.days || []).map(d => String(d.n));
    if (got.join(',') !== want.join(',')) {
      throw new Error('Test 32 일차 파싱 실패 [' + dv + ']: ' + JSON.stringify(got) + ' (기대 ' + want.join(',') + ')');
    }
    if (String(g.total) !== '50') throw new Error('Test 32 총건수 50 파싱 실패 [' + dv + ']: ' + g.total);
    if (String(g.daily) !== '20') throw new Error('Test 32 1일차 인원은 20이어야 함 [' + dv + ']: ' + g.daily);
  });

  // 화살표 표기가 방제 인원(dayTotalOf)까지 그대로 이어지는지
  const hv = P.parseAll(mk('20건 -> 30건'));
  getElem('req').value = mk('20건 -> 30건');
  P.setGuides(hv.guides);
  if (P.dayTotalOf(1) !== '20') throw new Error('Test 32 1일차 인원(화살표)은 20이어야 함: ' + P.dayTotalOf(1));
  if (P.dayTotalOf(2) !== '30') throw new Error('Test 32 2일차 인원(화살표)은 30이어야 함: ' + P.dayTotalOf(2));

  // '명' 단위 날짜 표기(20일 20명 21일 30명)
  const hd = P.parseAll(mk('20일 20명 21일 30명'));
  const gd = hd.guides[0];
  const gdd = (gd.days || []).map(d => String(d.n));
  if (gdd.join(',') !== '20,30') throw new Error('Test 32 명 단위 날짜 파싱 실패: ' + JSON.stringify(gd.days));

  // 기존 표기 회귀 없음: '3-2'는 적은 순서 그대로 [3,2] (v184 규칙 유지)
  const hr = P.parseAll(mk('3-2'));
  const gr = hr.guides[0];
  if (String(gr.daily) !== '3') throw new Error('Test 32 3-2의 1일차는 3이어야 함: ' + gr.daily);

  console.log('✓ 일차 인원 표기 보강(화살표·첫째날·명 단위) 시험 통과');
}

// ==========================================
console.log('-- Test 33: 과일 다중 방제(사과단감)·하위권 1p 오인식 및 쿠팡/네이버 가격문구 오표기 차단 (11/17 v190)');
{
  const req = `#입금대행 택대 12700 11500

1. 검색 키워드(미노출시 저희가 키워드땁니다): 시나노골드사과
2. 키워드 검색 시 현재 순위 : '시나노골드사과'라고 검색 시 하위권 노출
3. 총 구매 건수 : 30건
4. 일 진행 건수 : 30건
5. 상품주소(URL) : https://www.coupang.com/vp/products/9824856933?vendorItemId=96336330506
6. 구매옵션 : 3kg x 1박스
7. 포토제공 유 무  : 유
8. 리뷰내용 가이드 : 자율작성 요청
9. 입금하실 입금자명 : 박영찬
10.택배대행 Y/N: Y
=========================
1. 검색 키워드(미노출시 저희가 키워드땁니다): 단감
2. 키워드 검색 시 현재 순위 : '단감'이라고 검색 시 하위권 노출
3. 총 구매 건수 : 30건
4. 일 진행 건수 : 30건
5. 상품주소(URL) : https://www.coupang.com/vp/products/9824773602?vendorItemId=96336089554
6. 구매옵션 : 3kg x 1박스
7. 포토제공 유 무  : 유
8. 리뷰내용 가이드 : 자율작성 요청
9. 입금하실 입금자명 : 박영찬
10.택배대행 Y/N: Y`;

  const h = P.parseAll(req);
  if (h.guides.length !== 2) throw new Error('Test 33 guides length should be 2');
  h.guides.forEach((g, idx) => {
    if (g.page) throw new Error('Test 33 guide[' + idx + '] page should be empty for 하위권 노출, got: ' + g.page);
    if (/네이버/.test(g.page || '') || /네이버/.test(g.keyword || '')) throw new Error('Test 33 쿠팡 단독에 네이버 문구 들어가면 안 됨');
  });
  if (String(h.guides[0].price) !== '12700' || String(h.guides[1].price) !== '11500') {
    throw new Error('Test 33 price mismatch: ' + h.guides.map(g => g.price).join(','));
  }
  getElem('t-ip').checked = true;
  getElem('t-up').checked = false;
  getElem('takdae').checked = true;
  getElem('realship').checked = false;
  getElem('fruit').checked = true;
  P.setGuides(h.guides.map(g => Object.assign({}, g, { seller: '이디스' })));
  const rA = P.makeRoom('11.17', '30');
  if (rA !== '#택11.17 이디스 사과단감 30') throw new Error('Test 33 roomA mismatch: ' + rA);
  P.setGuides(h.guides.map(g => Object.assign({}, g, { seller: '' })));
  const rB = P.makeRoom('11.17', '30');
  if (rB !== '#택11.17 (업체명) 사과단감30') throw new Error('Test 33 roomB mismatch: ' + rB);
  console.log('✓ 과일 다중 방제(사과단감)·하위권 1p 차단·쿠팡 가격문구 시험 통과 (' + rA + ')');
}

// ==========================================
console.log('-- Test 34: 실·빈 혼합(실5 텍5 구확10=20건) 한 방·공지 리뷰 가이드 제외 (11/17 v191)');
{
  // 오리 팀룸 #68 제보 원문: 구확10 + 리뷰10 = 20건, 하루 4건, 실·빈 혼합
  const req68 = `#입금대행 실5 텍5 구확10 14900

1. 검색 키워드(미노출시 저희가 키워드땁니다): 여성겨울모자
2. 키워드 검색 시 현재 순위 :모르시면 비워두세요
3. 총 결제하신 건수 : 구확10건 리뷰 10건
4. 하루 구매하는건수 (어뷰징 피하기위해 
조금씩 변동될수 있습니다 : 4건
5. 상품주소(URL) : https://www.coupang.com/vp/products/2332028624
6. 구매옵션 : 
7. 포토제공 (몇명)  /포토없음  선택: 포토(5명)/5 ->포토는 각 색깔별로 1개씩이고 나머지 포토없음 5건과 구확 10건은 다 핑크로 해주세요 
8. 리뷰 가이드 :  자율 
9. 입금하실 입금자명 : 장수정
10.택배대행 Y/N: N`;

  // 총 건수: 항목별 건수는 합산, 이미 적힌 합계는 그대로 (11/17 v191)
  const totals = [
    ['구확10건 리뷰 10건', '20'],
    ['구확10건 리뷰10건', '20'],
    ['실5 텍5 구확10', '20'],
    ['총 20건 (구확10 리뷰10)', '20'],
    ['20건(10+10)', '20'],
    ['30건 중 구확10 리뷰20', '30'],
    ['10건', '10'],
    ['', '']
  ];
  totals.forEach(([s, want]) => {
    const got = String(P.totalCount(s));
    if (got !== want) throw new Error('Test 34 총건수 합산 실패 [' + s + ']: ' + got + ' (기대 ' + want + ')');
  });

  const h68 = P.parseAll(req68);
  if (!h68.silbin) throw new Error('Test 34 실·빈 혼합(silbin) 인식 실패: #입금대행 실5 텍5 구확10');
  if (h68.realship) throw new Error('Test 34 실·빈 혼합은 실배송 단독이 아님(realship=false)이어야 함');
  if (h68.guides.length !== 1) throw new Error('Test 34 실·빈 혼합은 한 방(가이드 1개)이어야 함, got: ' + h68.guides.length);
  const g68 = h68.guides[0];
  if (String(g68.total) !== '20') throw new Error('Test 34 총건수는 구확10+리뷰10=20이어야 함, got: ' + g68.total);
  if (String(g68.daily) !== '4') throw new Error('Test 34 하루 건수는 4여야 함, got: ' + g68.daily);

  // 방제: #11.17실/빈 … 4 (한 방, 택 없음)
  getElem('req').value = req68;
  getElem('t-ip').checked = true;
  getElem('t-up').checked = false;
  getElem('takdae').checked = false;
  getElem('realship').checked = false;
  getElem('fruit').checked = false;
  getElem('cart').checked = false;
  getElem('day').value = '1';
  getElem('date').value = '2026-11-17';
  getElem('slot').value = 'midnight';
  const gg68 = Object.assign({}, g68, { seller: '', price: '14900', pname: '여성 겨울 니트 모자', platform: '쿠팡' });
  P.setGuides([gg68]);
  ['keyword', 'guide', 'daily', 'total', 'price', 'ship', 'platform', 'seller', 'option', 'pname', 'url', 'pno', 'short', 'page', 'pageM', 'similar', 'photo', 'thumb'].forEach(k => { getElem(k).value = String(gg68[k] === undefined ? '' : gg68[k]); });
  getElem('platform').value = '쿠팡';
  getElem('option').value = '핑크';
  getElem('photo').value = gg68.photo;
  const room68 = P.makeRoom('11.17', '4');
  if (room68 !== '#11.17실/빈 여성겨울모자 4') throw new Error('Test 34 방제가 실/빈 한 방이 아님: ' + room68);
  if (P.dayTotalOf(1) !== '4') throw new Error('Test 34 1일차 인원은 4여야 함: ' + P.dayTotalOf(1));

  // 공지: 리뷰 배분·리뷰 가이드·구확 안내가 들어가면 안 됨 (다 사고 배정한 뒤 알려줌)
  P.render();
  const notice68 = String(getElem('o-notice').value || '');
  if (!/여성겨울모자/.test(notice68)) throw new Error('Test 34 공지에 키워드가 안 들어감');
  if (/🐥리뷰/.test(notice68)) throw new Error('Test 34 실·빈 혼합 공지에 리뷰 배분 줄이 들어감');
  if (/포토리뷰\s*\d|텍스트리뷰\s*\d|리뷰배정|구확건|빈박스/.test(notice68)) throw new Error('Test 34 실·빈 혼합 공지에 리뷰 가이드·구확 안내가 들어감');
  if (/자율/.test(notice68)) throw new Error('Test 34 실·빈 혼합 공지에 리뷰 가이드(자율)가 들어감');

  // 회귀: 실배송 단독 의뢰서(구확 안내 줄만 있음)는 실·빈 혼합이 아님
  const reqReal = `#입금대행 실배 9800

1. 검색 키워드 : 미니 텀블러
2. 키워드 검색 시 현재 순위 : 2p
3. 총 구매 건수 : 10건
4. 일 진행 건수 : 5건
5. 상품주소(URL) : https://www.coupang.com/vp/products/1111222233
6. 구매옵션 : 블랙
7. 포토제공 유 무 : 유
8. 리뷰내용 가이드 : 구매확정 후 작성
9. 입금하실 입금자명 : 김수진
10.택배대행 Y/N : N`;
  const hr = P.parseAll(reqReal);
  if (hr.silbin) throw new Error('Test 34 실배송 단독 의뢰서를 실·빈 혼합으로 오인식');
  if (!hr.realship) throw new Error('Test 34 실배송 단독은 realship=true여야 함');
  if (String(hr.guides[0].total) !== '10') throw new Error('Test 34 실배송 단독 총건수 회귀: ' + hr.guides[0].total);

  console.log('✓ 실·빈 혼합 한 방·구확+리뷰 합산·공지 리뷰 가이드 제외 시험 통과 (' + room68 + ')');
}

// ==========================================
console.log('-- Test 35: 20자 방제에서 업체명(판매처) 먼저 살리고 상품 키워드를 대표 키워드로 줄이기 (11/17 v193)');
{
  // 오리 팀룸 #73 수진 님: "업체명이중요하다고 그린코코 겨울모자4 이런식으로 대표키워드랑업체명이들어가게하라고"
  //  (v192에서는 업체명을 빼고 '#11.17실/빈 여성겨울모자 4'였음 → v193은 업체명을 살리고 상품 키워드를 줄임)
  const req73 = `#입금대행 실5 텍5 구확10 14900

1. 검색 키워드(미노출시 저희가 키워드땁니다): 여성겨울모자
2. 키워드 검색 시 현재 순위 :모르시면 비워두세요
3. 총 결제하신 건수 : 구확10건 리뷰 10건
4. 하루 구매하는건수 (어뷰징 피하기위해 
조금씩 변동될수 있습니다 : 4건
5. 상품주소(URL) : https://www.coupang.com/vp/products/2332028624
6. 구매옵션 : 
7. 포토제공 (몇명)  /포토없음  선택: 포토(5명)/5
8. 리뷰 가이드 :  자율 
9. 입금하실 입금자명 : 장수정
10.택배대행 Y/N: N`;
  const h73 = P.parseAll(req73);
  getElem('req').value = req73;
  getElem('takdae').checked = false;
  getElem('realship').checked = false;
  getElem('fruit').checked = false;
  getElem('cart').checked = false;
  getElem('t-up').checked = false;
  getElem('t-ip').checked = true;
  getElem('day').value = '1';
  getElem('date').value = '2026-11-17';
  const run73 = (kw, guide, seller, pname, cnt) => {
    const g = Object.assign({}, h73.guides[0], { keyword: kw, guide: guide, seller: seller, pname: pname, platform: '쿠팡', total: '20', daily: '4', price: '14900' });
    P.setGuides([g]);
    ['keyword', 'guide', 'pname', 'seller', 'platform', 'total', 'daily', 'price'].forEach(k => { getElem(k).value = String(g[k] === undefined ? '' : g[k]); });
    return P.makeRoom('11.17', cnt);
  };
  const PNAME73 = '그린코코 니트 털방울 올인원 겨울모자 여성모자 방한모자';

  // ① #73 실제 조건: 업체명(그린코코)은 그대로 두고, 검색 키워드(여성겨울모자)만 짧은 대표 키워드(겨울모자)로 줄임
  const r73 = run73('여성겨울모자', '여성겨울모자', '그린코코', PNAME73, '4');
  if (r73 !== '#11.17실/빈 그린코코 겨울모자4') throw new Error('Test 35 #73 방제 실패: ' + r73 + ' (' + r73.length + '자)');
  if (r73.length > 20) throw new Error('Test 35 #73 방제 20자 초과: ' + r73 + ' (' + r73.length + '자)');
  if (!/그린코코/.test(r73)) throw new Error('Test 35 #73 방제에 업체명이 없음: ' + r73);
  if (/여성겨울4|여성겨울$/.test(r73)) throw new Error('Test 35 상품명 꼬리(모자)가 잘림: ' + r73);
  // 판매처가 비어 있으면 업체명 없이 온전한 키워드 그대로
  const r73b = run73('여성겨울모자', '여성겨울모자', '', PNAME73, '4');
  if (r73b !== '#11.17실/빈 여성겨울모자 4') throw new Error('Test 35 판매처 없음 방제 실패: ' + r73b);

  // ② 상품명이 20자를 넘어 상품명을 줄여야 하면 뒤쪽 품목 명사가 남아야 함
  //    (예전 v191: '#11.17실/빈 그린코코 여성겨울4' 20자 — 품목 '모자'가 잘렸음)
  const rLong = run73('초특가겨울여성방한모자', '초특가겨울여성방한모자', '그린코코', PNAME73, '20');
  if (rLong.length > 20) throw new Error('Test 35 20자 초과: ' + rLong + ' (' + rLong.length + '자)');
  if (!/그린코코/.test(rLong)) throw new Error('Test 35 업체명이 빠짐: ' + rLong);
  if (!/모자\s*20$/.test(rLong)) throw new Error('Test 35 뒤쪽 품목 명사(모자)가 잘림: ' + rLong);
  if (/초특가/.test(rLong)) throw new Error('Test 35 앞 수식어만 남음: ' + rLong);

  // ③ 상품명 낱말을 다 붙인 검색 키워드: 상품명 전체가 안 들어가면 상품명 안의 짧은 품목 명사(겨울모자)를 씀
  const rGlue = run73('니트털방울올인원겨울모자여성모자방한모자', '니트털방울올인원겨울모자여성모자방한모자', '그린코코', PNAME73, '4');
  if (rGlue.length > 20) throw new Error('Test 35 20자 초과: ' + rGlue);
  if (!/겨울모자\s*4$|겨울모자4$/.test(rGlue)) throw new Error('Test 35 짧은 품목 명사(겨울모자)가 안 남음: ' + rGlue);
  if (!/그린코코/.test(rGlue)) throw new Error('Test 35 업체명이 빠짐: ' + rGlue);
  if (/니트|털방울|올인원/.test(rGlue)) throw new Error('Test 35 수식어가 품목처럼 남음: ' + rGlue);

  // ④ 상품명이 없어 낱말 후보도 없을 때: 글자를 줄여도 뒤쪽(모자)을 남기고 앞을 줄임
  const rTail = run73('초특가프리미엄여성겨울방한모자', '초특가프리미엄여성겨울방한모자', '그린코코', '', '20');
  if (rTail.length > 20) throw new Error('Test 35 20자 초과: ' + rTail);
  if (!/모자\s*20$|모자20$/.test(rTail)) throw new Error('Test 35 글자를 줄여도 뒤쪽 품목(모자)이 안 남음: ' + rTail);
  if (/^#택?\S*\s+초특가/.test(rTail)) throw new Error('Test 35 앞쪽부터 잘라 품목이 잘림: ' + rTail);
  if (/여성겨울|방한모/.test(rTail.replace(/^#\S+\s+(\S+\s+)?/, ''))) throw new Error('Test 35 품목이 잘린 조각이 남음: ' + rTail);

  // ⑤ 회귀: 20자 안에 다 들어가는 짧은 건은 그대로 (업체명 + 띄어쓰기)
  const rShort = run73('흐착장난감', '흐착장난감', '빌랑', '빌랑 흐착장난감', '4');
  if (rShort !== '#11.17실/빈 빌랑 흐착장난감 4') throw new Error('Test 35 짧은 방제 회귀(실·빈): ' + rShort);

  console.log('✓ 업체명 살리고 대표 키워드로 줄이기 시험 통과 (' + r73 + ' / ' + rLong + ')');
}

console.log('-- Test 36: 6번 구매옵션이 비고 7번에 색상 이야기가 있으면 단일옵션이 뜨지 않음 (11/17 v194)');
{
  // 수진 님 지시: "7번에 색깔 얘기 있을때 단일옵션으로 안뜨게해"
  const reqColor = `#입금대행 실5 텍5 구확10 14900

1. 검색 키워드(미노출시 저희가 키워드땁니다): 여성겨울모자
2. 키워드 검색 시 현재 순위 :모르시면 비워두세요
3. 총 결제하신 건수 : 구확10건 리뷰 10건
4. 하루 구매하는건수 (어뷰징 피하기위해 
조금씩 변동될수 있습니다 : 4건
5. 상품주소(URL) : https://www.coupang.com/vp/products/2332028624
6. 구매옵션 : 
7. 포토제공 (몇명)  /포토없음  선택: 포토(5명)/5 ->포토는 각 색깔별로 1개씩이고 나머지 포토없음 5건과 구확 10건은 다 핑크로 해주세요 
8. 리뷰 가이드 :  자율 
9. 입금하실 입금자명 : 장수정
10.택배대행 Y/N: N`;
  const hC = P.parseAll(reqColor);
  const gC = hC.guides[0];
  if (!gC.hasColorHint) throw new Error('Test 36 7번 색상 이야기(각 색깔별·핑크)를 못 읽음');
  if (/단일옵션/.test(String(gC.option || ''))) throw new Error('Test 36 6번 공란+7번 색상 → 단일옵션이 뜸: ' + gC.option);
  if (gC.option !== '각 색상별 1개씩 / 핑크') throw new Error('Test 36 색상 안내가 옵션으로 안 감: ' + JSON.stringify(gC.option));
  if (!gC.colorHintOnly) throw new Error('Test 36 색상 안내는 페이지 목록이 오면 바뀔 수 있는 상태(colorHintOnly)여야 함');
  if ((gC.optBase || []).length) throw new Error('Test 36 색상 안내로 옵션 이름 목록(optBase)을 임의로 만들면 안 됨');

  // 실제 공지에 '🐥옵션 : 단일옵션'이 찍히지 않는지 (수진 님이 보는 화면)
  getElem('req').value = reqColor;
  getElem('t-ip').checked = true;
  getElem('t-up').checked = false;
  getElem('takdae').checked = false;
  getElem('realship').checked = false;
  getElem('fruit').checked = false;
  getElem('cart').checked = false;
  getElem('day').value = '1';
  getElem('date').value = '2026-11-17';
  getElem('slot').value = 'midnight';
  const ggC = Object.assign({}, gC, { seller: '그린코코', price: '14900', pname: '그린코코 니트 털방울 올인원 겨울모자', platform: '쿠팡' });
  P.setGuides([ggC]);
  ['keyword', 'guide', 'daily', 'total', 'price', 'ship', 'platform', 'seller', 'option', 'pname', 'url', 'pno', 'short', 'page', 'pageM', 'similar', 'photo', 'thumb'].forEach(k => { getElem(k).value = String(ggC[k] === undefined ? '' : ggC[k]); });
  P.render();
  const noticeC = String(getElem('o-notice').value || '');
  if (!/🐥옵션 : 각 색상별 1개씩 \/ 핑크/.test(noticeC)) throw new Error('Test 36 공지 옵션 줄에 색상 안내가 안 들어감: ' + noticeC.split('\n').filter(l => /옵션/.test(l)).join(' | '));
  if (/단일옵션/.test(noticeC)) throw new Error('Test 36 공지에 단일옵션이 찍힘');

  // fillCoupang의 옵션 판단(optForGuide): 단일옵션이 와도 색상 안내는 안 덮어쓰고, 전체 색상 목록이 오면 그게 우선
  const hintG = { hasColorHint: true, colorHint: '각 색상별 1개씩 / 핑크', optBase: [], option: '각 색상별 1개씩 / 핑크' };
  if (P.optForGuide(hintG, '단일옵션', hintG.option).value !== '각 색상별 1개씩 / 핑크') throw new Error('Test 36 페이지가 단일옵션이면 색상 안내를 지켜야 함');
  { const put = P.optForGuide(hintG, '블랙 / 아이보리 / 핑크', hintG.option);
    if (put.value !== '블랙 / 아이보리 / 핑크') throw new Error('Test 36 페이지 전체 색상 목록이 우선이어야 함: ' + put.value);
    if (put.hint) throw new Error('Test 36 페이지 목록을 넣었으면 hint 상태를 풀어야 함'); }
  // 수진 님이 옵션 칸을 직접 고쳤으면 페이지가 단일옵션이어도 그 글을 지우지 않음
  if (P.optForGuide(hintG, '단일옵션', '핑크 1개씩 살 사람만').value !== '핑크 1개씩 살 사람만') throw new Error('Test 36 직접 고친 옵션을 단일옵션/안내로 덮어씀');
  // 상품 정보 칸에 타이핑하면 글자마다 읽혀서 '옵션 : 단' 같은 조각이 들어옴 — 한 값은 색상 안내를 덮으면 안 됨 (11/17 라이브 확인에서 발견)
  if (P.optForGuide(hintG, '단', hintG.option).value !== '각 색상별 1개씩 / 핑크') throw new Error('Test 36 타이핑 중 조각(단)이 색상 안내를 덮음');
  if (P.optForGuide(hintG, '핑크 × 1개', hintG.option).value !== '각 색상별 1개씩 / 핑크') throw new Error('Test 36 고른 한 옵션이 색상 안내를 덮음');
  if (P.optForGuide(hintG, '블랙, 화이트', hintG.option).value !== '블랙, 화이트') throw new Error('Test 36 콤마로 된 색상 목록은 받아야 함');
  // 목록을 타이핑하는 중간 조각(앞부분)은 뒤에 온 완전한 목록으로 바뀌어야 함
  if (P.optForGuide(hintG, '블랙 / 아이보리 / 핑크', '블랙 / 아').value !== '블랙 / 아이보리 / 핑크') throw new Error('Test 36 타이핑 중 색상 목록 조각이 완전한 목록으로 안 바뀜');
  // 회귀: 색상 이야기가 없는 의뢰서는 예전 그대로 — 진짜 단일옵션 상품은 단일옵션, 페이지 옵션은 빈칸일 때만
  const plainG = { optBase: [], option: '' };
  if (P.optForGuide(plainG, '단일옵션', '').value !== '단일옵션') throw new Error('Test 36 회귀: 보통 의뢰서의 단일옵션이 사라짐');
  if (P.optForGuide(plainG, '블랙', '').value !== '블랙') throw new Error('Test 36 회귀: 빈 옵션 칸에 페이지 옵션이 안 들어감');
  if (P.optForGuide({ optBase: [{ label: '블랙', qty: '' }], option: '블랙' }, '아이보리', '블랙').value !== '블랙') throw new Error('Test 36 회귀: 의뢰서 옵션을 페이지 옵션으로 덮어씀');

  // 6번에 옵션이 적혀 있으면 색상 안내를 만들지 않고 의뢰서 옵션 그대로
  const hO = P.parseAll(reqColor.replace('6. 구매옵션 : \n', '6. 구매옵션 : 블랙\n'));
  if (hO.guides[0].hasColorHint) throw new Error('Test 36 6번에 옵션이 있으면 색상 안내를 만들면 안 됨');
  if (hO.guides[0].option !== '블랙') throw new Error('Test 36 6번 옵션 회귀: ' + hO.guides[0].option);

  // 7번·8번에 색상 이야기가 없으면 옵션은 예전처럼 비어 있음 (억지로 안 만음)
  const reqPlain = reqColor.replace(/7\. 포토제공[^\n]*/, '7. 포토제공 (몇명) /포토없음 선택: 포토(5명)/5');
  const hP = P.parseAll(reqPlain);
  if (hP.guides[0].hasColorHint) throw new Error('Test 36 색상 이야기가 없는데 색상 안내를 만듦');
  if (String(hP.guides[0].option || '') !== '') throw new Error('Test 36 색상 없는 의뢰서 옵션은 빈칸이어야 함: ' + hP.guides[0].option);

  console.log('✓ 7번 색상 안내 시 단일옵션 방지 시험 통과 (' + gC.option + ')');
}

// ==========================================
console.log('-- Test 37: 팀룸 #77 — 택대 + 실·배 혼합("실배 나머지 빈") + 쿠팡/네이버 다중 가이드 (11/18)');
{
  // 수진 님 제보 원문 (오리 팀룸 업무방 #77, 2/2 네이버 기준): 방제가 '#11.19 실 네쿠 젊음크림 5'로 나와
  //  #택·실⁄빈이 빠지고, 쿠팡 칸에 네이버 상품번호(13267764523)가 들어가 ❗자리수 확인이 떴다
  const req77 = `#입금대행 택대 네5 쿠5 실배 나머지 빈 39900

1. 검색 키워드: 젊음크림
2. 키워드 검색 시 현재 순위 : 쿠팡 1위, 스스 5위
3. 총 결제하신 건수 : 20건 (쿠팡 10건, 스스 10건)
4. 하루 구매하는건수 :플랫폼 각각 5건씩 2일 
5. 상품주소(URL) :
https://link.coupang.com/a/iLyEyCqBW0

https://naver.me/GDQGBL7P

6. 구매옵션 : 1개
7. 포토제공 (몇명)  /포토없음  선택: 제품제공 후 포토리뷰 작성 요청
8. 리뷰 가이드 : 참고용 전달
9. 입금하실 입금자명 : 김규민`;

  // 1) 실·빈 혼합 인식 — '실배 나머지 빈'은 실배송 단독도, 빈박스 단독도 아님
  if (!P.isSilbin('실배 나머지 빈')) throw new Error('Test 37 "실배 나머지 빈"을 실·빈 혼합으로 못 읽음');
  if (P.isSilbin('실배 9800')) throw new Error('Test 37 실배송 단독을 실·빈 혼합으로 오인식');
  if (P.isSilbin('빈박스 5건')) throw new Error('Test 37 빈박스 단독을 실·빈 혼합으로 오인식');
  if (P.isSilbin('실배송은 방에 인원이 다쓰셔야 페이백 요청됩니다')) throw new Error('Test 37 안내 문장을 실배송 표기로 오인식');

  const h77 = P.parseAll(req77);
  if (!h77.silbin) throw new Error('Test 37 #77 의뢰서를 실·빈 혼합으로 못 읽음');
  if (h77.realship) throw new Error('Test 37 실·빈 혼합은 실배송 단독이 아님(realship=false)' + ' — 아니면 방제에 실이 붙고 택이 날아감');
  if (!h77.takdae) throw new Error('Test 37 의뢰서 헤더 택대를 못 읽음');
  if (h77.guides.length !== 2) throw new Error('Test 37 쿠팡·네이버 두 가이드로 나눠야 함, got: ' + h77.guides.length);
  const [gC, gN] = h77.guides;
  if (gC.platform !== '쿠팡' || gN.platform !== '네이버') throw new Error('Test 37 플랫폼 분리가 틀림: ' + gC.platform + '/' + gN.platform);

  // 2) 플랫폼별 건수는 순위 줄('쿠팡 1위')이 아니라 건수 줄에서 (10/10), 하루는 '각각 5건씩' (5/5)
  if (P.platCountOf('2. 키워드 검색 시 현재 순위 : 쿠팡 1위, 스스 5위', '쿠팡') !== '') throw new Error('Test 37 순위 줄 숫자를 건수로 잡음');
  if (P.platCountOf('3. 총 결제하신 건수 : 20건 (쿠팡 10건, 스스 10건)', '쿠팡') !== '10') throw new Error('Test 37 쿠팡 건수 못 읽음');
  if (P.platCountOf('3. 총 결제하신 건수 : 20건 (쿠팡 10건, 스스 10건)', '네이버') !== '10') throw new Error('Test 37 네이버(스스) 건수 못 읽음');
  if (String(gC.total) !== '10' || String(gN.total) !== '10') throw new Error('Test 37 가이드별 총건수는 10/10이어야 함: ' + gC.total + '/' + gN.total);
  if (String(gC.daily) !== '5' || String(gN.daily) !== '5') throw new Error('Test 37 하루 건수는 5/5여야 함: ' + gC.daily + '/' + gN.daily);

  // 3) 6번 '1개'는 두 가이드 모두 옵션 '단일옵션' — 상품명으로 새지 않음
  if (gC.option !== '단일옵션' || gN.option !== '단일옵션') throw new Error('Test 37 다중 가이드 옵션이 단일옵션이 아님: ' + gC.option + '/' + gN.option);
  if (gC.pname || gN.pname) throw new Error('Test 37 단일옵션이 상품명으로 들어감: ' + JSON.stringify([gC.pname, gN.pname]));

  // 4) 방제: #택11.19실/빈 네쿠 젊음크림10 (하루 인원 = 쿠팡 5 + 네이버 5 = 10)
  getElem('req').value = req77;
  getElem('t-ip').checked = true;
  getElem('t-up').checked = false;
  getElem('takdae').checked = true;
  getElem('realship').checked = false;
  getElem('fruit').checked = false;
  getElem('cart').checked = false;
  getElem('day').value = '1';
  getElem('date').value = '2026-11-19';
  getElem('slot').value = 'midnight';
  P.setGuides(h77.guides.map(g => Object.assign({}, g, { keyword: '젊음크림', guide: '젊음크림', seller: '', pname: '' })));
  ['keyword', 'guide', 'daily', 'total', 'price', 'ship', 'platform', 'seller', 'option', 'pname', 'url', 'pno', 'short', 'page', 'pageM', 'similar', 'photo', 'thumb'].forEach(k => { getElem(k).value = String(h77.guides[0][k] === undefined || h77.guides[0][k] === null ? '' : h77.guides[0][k]); });
  const day1 = P.dayTotalOf(1);
  if (day1 !== '10') throw new Error('Test 37 1일차 인원은 10(⑤+⑤)이어야 함: ' + day1);
  const room77 = P.makeRoom('11.19', day1);
  if (room77 !== '#택11.19실/빈 네쿠 젊음크림10') throw new Error('Test 37 #77 방제 실패: ' + room77 + ' (' + room77.length + '자)');
  if (!P.roomHasTak(room77)) throw new Error('Test 37 실·빈 혼합 방제에서 택이 사라짐: ' + room77);
  if (room77.length > 20) throw new Error('Test 37 방제가 20자를 넘음: ' + room77.length);

  // 5) 붙여넣은 상품이 맞는 가이드로 감 (아이폰에서 탭을 안 바꿔도) — 네이버 번호가 쿠팡 칸을 덮어쓰지 않음
  if (P.routePaste({ pno: '13267764523', thumb: 'https://phinf.pstatic.net/a.jpg' }) !== 1) throw new Error('Test 37 네이버 상품 정보가 네이버 가이드로 안감');
  if (P.routePaste({ pno: '9463496930 - 2816***8459', thumb: 'https://thumbnail7.coupangcdn.com/a.jpg' }) !== 0) throw new Error('Test 37 쿠팡 상품 정보가 쿠팡 가이드로 안감');
  if (P.routePaste({ pno: '13267764523' }) !== 1) throw new Error('Test 37 썸네일·사이트 표시가 없어도 상품번호 모양(네이버=숫자 하나)으로 못 찾음');

  // 6) '에'로 시작하는 판매처(에큐어)가 조사로 오인돼 빈칸이 되지 않음
  if (!P.okSeller('에큐어')) throw new Error('Test 37 "에큐어"가 판매처에서 걸러짐(조사 필터)');
  if (P.okSeller('는 다를 수 있습니다')) throw new Error('Test 37 조사로 시작하는 문장은 판매처가 아님');

  // 7) 공지에서 '(비슷한 상품 많으니 꼭 판매처, 가격 보고 구매해주세요!)' 문구 제거
  P.setGuides([Object.assign({}, h77.guides[0], { keyword: '젊음크림', guide: '젊음크림', pname: '에큐어 젊음크림 팔자주름 크림', seller: '휴리진', option: '단일옵션', pno: '9463496930 - 2816***8459', platform: '쿠팡', price: '39900', page: '1p', similar: '1' })]);
  ['keyword', 'guide', 'daily', 'total', 'price', 'ship', 'platform', 'seller', 'option', 'pname', 'url', 'pno', 'short', 'page', 'pageM', 'similar', 'photo', 'thumb'].forEach(k => { const g0 = { keyword: '젊음크림', guide: '젊음크림', pname: '에큐어 젊음크림 팔자주름 크림', seller: '휴리진', option: '단일옵션', pno: '9463496930 - 2816***8459', platform: '쿠팡', price: '39900', page: '1p', similar: '1' }; getElem(k).value = String(g0[k] === undefined ? '' : g0[k]); });
  P.render();
  const notice77 = String(getElem('o-notice').value || '');
  if (/비슷한 상품 많으니/.test(notice77)) throw new Error('Test 37 공지에 "비슷한 상품 많으니…" 문구가 남아 있음');
  if (/판매처, 가격 보고/.test(notice77)) throw new Error('Test 37 공지에 판매처·가격 보고 안내가 남아 있음');

  // 8) 상품명 끝 ', 1개, 100g'은 원문에 있으면 떼지 않는다 (수진 님 11/18). 옵션 칸은 '단일옵션' 유지
  const fullPname = '에큐어 젊음크림 팔자주름 눈가주름 목주름 영양크림 탄력크림 리프팅 100ml, 1개, 100g';
  if (P.baseName(fullPname, { option: '단일옵션' }, { platform: '쿠팡' }) !== fullPname) throw new Error('Test 37 상품명 끝 수량·용량이 잘림: ' + P.baseName(fullPname, { option: '단일옵션' }, { platform: '쿠팡' }));
  if (P.baseName(fullPname, { option: '100g' }, { platform: '쿠팡' }) !== fullPname) throw new Error('Test 37 옵션이 100g일 때 상품명 끝이 잘림: ' + P.baseName(fullPname, { option: '100g' }, { platform: '쿠팡' }));
  const gFull = { keyword: '젊음크림', guide: '젊음크림', pname: fullPname, seller: '휴리진', option: '단일옵션', pno: '9463496930 - 2816***8459', platform: '쿠팡', price: '39900', page: '1p', similar: '1' };
  P.setGuides([Object.assign({}, gFull, { daily: '5' })]);
  ['keyword', 'guide', 'daily', 'total', 'price', 'ship', 'platform', 'seller', 'option', 'pname', 'url', 'pno', 'short', 'page', 'pageM', 'similar', 'photo', 'thumb'].forEach(k => { getElem(k).value = String(gFull[k] === undefined ? '' : gFull[k]); });
  P.render();
  const noticeFull = String(getElem('o-notice').value || '');
  if (noticeFull.indexOf('🐥상품명 : ' + fullPname) < 0) throw new Error('Test 37 공지 상품명이 원문 그대로가 아님: ' + (noticeFull.match(/🐥상품명 : .*/) || [''])[0]);
  if (!/🐥옵션 : 단일옵션/.test(noticeFull)) throw new Error('Test 37 옵션 칸이 단일옵션으로 유지되지 않음: ' + (noticeFull.match(/🐥옵션 : .*/) || [''])[0]);

  console.log('✓ #77 택대·실⁄빈 혼합·네쿠 방제 및 다중 가이드 상품번호 분리 시험 통과 (' + room77 + ')');
}

// ==========================================
console.log('-- Test 38: 팀룸 #81 — "5건실 나머지 빈" 실·빈 혼합 + 주소 위 줄 건수(5/10) + 옵션(라지)이 키워드로 새지 않기 (11/18)');
{
  // 수진 님 제보 원문 (오리 팀룸 업무방 #81, 1/2 쿠팡 기준): 방제가 '#택11.19 김상사 라지 15'로 나오고,
  //  키워드·상품명이 '라지'가 되고, 공지 인원이 15를 반반 쪼개 '쿠팡 (8명)/(7명)'이 됨
  const req81 = `#입금대행 택대 5건실 나머지 빈  9900 10900

1. 검색 키워드(미노출시 저희가  키워드땁니다):
2. 키워드 검색 시 현재 순위 :모르시면 비워두세요
3. 총 결제하신 건수 : 15
4. 하루 진행 건수 : 15
5. 상품주소(URL) : 
5건 실배
https://www.coupang.com/vp/products/9812998435?itemId=29388465518

10건 빈
https://www.coupang.com/vp/products/9812998435?vendorItemId=96299881395
6. 구매옵션 : 라지 /  9,900원
7. 포토제공 (몇명)  /포토없음  선택: 포토 5명
8. 리뷰 가이드 : 원고제공
9. 입금하실 입금자명 : 김상사(김성열)
10.택배대행 Y/N: N`;

  // 1) 실·빈 혼합 인식 — '5건실'(건수를 실 앞에 붙인 표기)도 실배송 표기로 읽어야 함
  if (!P.isSilbin('#입금대행 택대 5건실 나머지 빈  9900 10900')) throw new Error('Test 38 "5건실 나머지 빈"을 실·빈 혼합으로 못 읽음');
  if (P.isSilbin('5건 실배')) throw new Error('Test 38 "5건 실배"(실배송 단독)를 실·빈 혼합으로 오인식');
  if (P.isSilbin('10건 빈')) throw new Error('Test 38 "10건 빈"(빈박스 단독)을 실·빈 혼합으로 오인식');

  const h81 = P.parseAll(req81);
  if (!h81.silbin) throw new Error('Test 38 #81 의뢰서를 실·빈 혼합으로 못 읽음');
  if (!h81.takdae) throw new Error('Test 38 의뢰서 헤더 택대를 못 읽음');
  // 실·빈 혼합은 실배송이 섞여 있어 택대 유지가 맞고, 10번 N을 충돌로 띄우지 않음 (#81)
  if (h81.conflictTakdae) throw new Error('Test 38 실·빈 혼합인데 택배대행 충돌로 표시됨');
  if (h81.realship) throw new Error('Test 38 실·빈 혼합은 실배송 단독이 아님(realship=false)');
  if (h81.guides.length !== 2) throw new Error('Test 38 상품 두 개로 나눠야 함, got: ' + h81.guides.length);
  const [gA, gB] = h81.guides;

  // 2) 주소 바로 위 줄의 '5건 실배' / '10건 빈'에서 건수·가격을 1:1로 (예전엔 15를 반반 쪼개 8/7)
  if (String(gA.total) !== '5' || String(gB.total) !== '10') throw new Error('Test 38 가이드별 총건수는 5/10이어야 함: ' + gA.total + '/' + gB.total);
  if (String(gA.daily) !== '5' || String(gB.daily) !== '10') throw new Error('Test 38 하루 건수는 5/10이어야 함: ' + gA.daily + '/' + gB.daily);
  if (String(gA.price) !== '9900' || String(gB.price) !== '10900') throw new Error('Test 38 가격은 9900/10900이어야 함: ' + gA.price + '/' + gB.price);
  if (!/9,900/.test(String(gA.page)) || !/10,900/.test(String(gB.page))) throw new Error('Test 38 위치의 가격검색 안내가 상품 가격과 다름: ' + gA.page + ' / ' + gB.page);

  // 3) 옵션 '라지'는 두 가이드의 옵션일 뿐, 상품명·키워드로 새지 않음
  if (gA.option !== '라지' || gB.option !== '라지') throw new Error('Test 38 옵션은 둘 다 라지여야 함: ' + gA.option + '/' + gB.option);
  if (gA.optBase[0].qty !== '5' || gB.optBase[0].qty !== '10') throw new Error('Test 38 옵션별 인원은 5/10이어야 함: ' + JSON.stringify([gA.optBase, gB.optBase]));
  if (gA.pname || gB.pname) throw new Error('Test 38 옵션 이름(라지)이 상품명으로 들어감: ' + JSON.stringify([gA.pname, gB.pname]));
  if (String(gA.keyword) === '라지' || String(gB.keyword) === '라지') throw new Error('Test 38 옵션 이름(라지)이 키워드로 들어감');
  const gOpt = { pname: '라지', keyword: '', kwAuto: true, optBase: [{ label: '라지', qty: '' }], platform: '쿠팡' };
  P.autoKeyword(gOpt);
  if (String(gOpt.keyword || '').trim()) throw new Error('Test 38 상품명이 옵션 이름 그대로면 키워드를 만들면 안 됨: ' + gOpt.keyword);

  // 4) 상품 정보(판매처 김상사, 상품명)를 첫 가이드에만 붙여도 같은 상품번호인 둘째 가이드에 채워짐
  getElem('req').value = req81;
  getElem('t-ip').checked = true;
  getElem('t-up').checked = false;
  getElem('takdae').checked = true;
  getElem('realship').checked = false;
  getElem('fruit').checked = false;
  getElem('cart').checked = false;
  getElem('day').value = '1';
  getElem('date').value = '2026-11-19';
  getElem('slot').value = 'midnight';
  const PNAME81 = '제르넬 남성용 방한장갑 스마트폰 터치 기모 라이더 장갑';
  const gs81 = h81.guides.map(g => Object.assign({}, g, { keyword: '', guide: '', kwAuto: true }));
  gs81[0].seller = '김상사'; gs81[0].pname = PNAME81; gs81[0].kwSug = null;
  P.autoKeyword(gs81[0]);
  if (gs81[0].keyword !== '방한장갑') throw new Error('Test 38 상품명에서 대표 키워드를 못 고름: ' + gs81[0].keyword);
  P.setGuides(gs81);
  ['keyword', 'guide', 'daily', 'total', 'price', 'ship', 'platform', 'seller', 'option', 'pname', 'url', 'pno', 'short', 'page', 'pageM', 'similar', 'photo', 'thumb'].forEach(k => { getElem(k).value = String(gs81[0][k] === undefined || gs81[0][k] === null ? '' : gs81[0][k]); });
  P.render();
  if (gs81[1].pname !== PNAME81) throw new Error('Test 38 같은 상품번호인 둘째 가이드에 상품명이 안 채워짐: ' + gs81[1].pname);
  if (gs81[1].seller !== '김상사') throw new Error('Test 38 같은 상품번호인 둘째 가이드에 판매처가 안 채워짐: ' + gs81[1].seller);
  if (gs81[1].keyword !== '방한장갑') throw new Error('Test 38 둘째 가이드 키워드가 상품명에서 안 채워짐: ' + gs81[1].keyword);

  // 4-1) 같은 상품을 아이템(옵션)만 달리해 나눈 두 가이드에서, 지금 보고 있는 가이드로 붙여넣으면 그 가이드에 들어감 (#81)
  P.setGuides(h81.guides.map(g => Object.assign({}, g)));
  P.setCur(1);
  if (P.routePaste({ pno: '9812998435 - 9629***1395', site: 'coupang' }) !== 1) throw new Error('Test 38 가이드 2를 보고 있을 때 붙여넣기가 가이드 2로 안 감');
  P.setCur(0);
  if (P.routePaste({ pno: '9812998435 - 2653***9917', site: 'coupang' }) !== 0) throw new Error('Test 38 가이드 1로 안 감');
  P.setGuides(gs81);   // 붙여넣기 시험 때문에 산 가이드를 되돌림

  // 5) 방제: #택11.19실/빈 김상사 장갑15 (실/빈·택 유지, 옵션 '라지'가 아니라 상품 품목명)
  const day81 = P.dayTotalOf(1);
  if (day81 !== '15') throw new Error('Test 38 1일차 인원은 15여야 함: ' + day81);
  const room81 = P.makeRoom('11.19', day81);
  if (room81 !== '#택11.19실/빈 김상사 장갑15') throw new Error('Test 38 #81 방제 실패: ' + room81 + ' (' + room81.length + '자)');
  if (!P.roomHasTak(room81)) throw new Error('Test 38 실·빈 혼합 방제에서 택이 사라짐: ' + room81);
  if (room81.length > 20) throw new Error('Test 38 방제가 20자를 넘음: ' + room81.length);

  // 6) 공지: 쿠팡 (5명) / 쿠팡 (10명) — 8명/7명으로 쪼개지지 않고, 키워드에 라지가 없음
  P.render();
  const notice81 = String(getElem('o-notice').value || '');
  if (notice81.indexOf('쿠팡 (5명)') < 0 || notice81.indexOf('쿠팡 (10명)') < 0) throw new Error('Test 38 공지 인원이 5명/10명이 아님: ' + (notice81.match(/쿠팡 \(\d+명\)/g) || []).join(','));
  if (/쿠팡 \((8|7)명\)/.test(notice81)) throw new Error('Test 38 공지 인원이 8명/7명으로 반반 쪼개짐');
  if (/🐥★키워드 : 라지/.test(notice81)) throw new Error('Test 38 공지 키워드에 라지가 들어감');
  if (notice81.indexOf('🐥★키워드 : 방한장갑') < 0) throw new Error('Test 38 공지 키워드가 상품명 추천(방한장갑)이 아님');
  if (notice81.indexOf('🐥상품명 : ' + PNAME81) < 0) throw new Error('Test 38 공지 상품명이 비었거나 라지임');
  if (notice81.indexOf('🐥옵션 : 라지') < 0) throw new Error('Test 38 공지 옵션이 라지가 아님');
  if (!/🐥가격 : 9,900/.test(notice81) || !/🐥가격 : 10,900/.test(notice81)) throw new Error('Test 38 공지 가격이 9,900/10,900이 아님');

  console.log('✓ #81 실·빈("5건실 나머지 빈") 방제·인원 5/10·가격 1:1·옵션 라지 미유입 시험 통과 (' + room81 + ')');
}

// ==========================================
console.log('-- Test 39: 실·빈 혼합 + 헤더 택대 + 10번 N — 값은 택대 Y 유지, 주의 문구·폼 생성 전 확인창, fname 끝 숫자 (11/18 v199)');
{
  // 수진 님 지시: "택대가 맞는데 폼생성전 나한테 주의 혹은 확인해주세요 문구 뜨게해 제대로고쳤나재확인꼼꼼히"
  const reqSilbinN = `#입금대행 택대 5건실 나머지 빈  9900 10900

1. 검색 키워드(미노출시 저희가  키워드땁니다):
2. 키워드 검색 시 현재 순위 :모르시면 비워두세요
3. 총 결제하신 건수 : 15
4. 하루 진행 건수 : 15
5. 상품주소(URL) : 
5건 실배
https://www.coupang.com/vp/products/9812998435?itemId=29388465518

10건 빈
https://www.coupang.com/vp/products/9812998435?vendorItemId=96299881395
6. 구매옵션 : 라지 /  9,900원
7. 포토제공 (몇명)  /포토없음  선택: 포토 5명
8. 리뷰 가이드 : 원고제공
9. 입금하실 입금자명 : 김상사(김성열)
10.택배대행 Y/N: N`;
  const hSbn = P.parseAll(reqSilbinN);
  if (!hSbn.silbin) throw new Error('Test 39 실·빈 혼합으로 못 읽음');
  if (!hSbn.takdae) throw new Error('Test 39 헤더 택대를 못 읽음 (값은 택대 Y로 유지돼야 함)');
  if (hSbn.conflictTakdae) throw new Error('Test 39 실·빈 혼합은 11/12 차단 규칙(conflictTakdae)이 아니라 주의·확인 대상');
  if (!hSbn.silbinTakN) throw new Error('Test 39 실·빈+택대+10번N 주의 플래그(silbinTakN)가 안 섰음');

  // 1) 일반(실·빈 아님)은 11/12 규칙 그대로 차단, 실·빈이 아니면 주의 플래그도 안 섬
  const reqNormalN = `#입금대행 택대 11500

1. 검색 키워드 : 발마사지기
2. 총 구매 건수 : 10건
3. 일 진행 건수 : 10
4. 상품주소(URL) : https://www.coupang.com/vp/products/9778569271?itemId=29274107751
5. 구매옵션 : 1개 11,500원
6. 포토제공 : 유
7. 리뷰 가이드 : 좋아요
8. 입금하실 입금자명 : 김상사
10.택배대행 Y/N: N`;
  const hNormalN = P.parseAll(reqNormalN);
  if (!hNormalN.conflictTakdae) throw new Error('Test 39 실·빈이 아닌 택대+10번N은 기존처럼 차단(conflictTakdae)이어야 함');
  if (hNormalN.silbinTakN) throw new Error('Test 39 실·빈이 아닌데 주의 플래그가 섰음');

  // 2) 정상 택대 Y는 주의 문구도 확인창도 없음
  const reqNormalY = reqNormalN.replace('10.택배대행 Y/N: N', '10.택배대행 Y/N: Y');
  const hNormalY = P.parseAll(reqNormalY);
  if (hNormalY.silbinTakN || hNormalY.conflictTakdae) throw new Error('Test 39 정상 택대 Y에 주의·차단 플래그가 섰음');
  getElem('takdae').checked = true;
  getElem('realship').checked = false;
  P.setHead(hNormalY);
  if (P.silbinTakNNote() !== '') throw new Error('Test 39 정상 택대 Y인데 주의 문구가 뜸');
  if (P.silbinTakNAsk() !== '') throw new Error('Test 39 정상 택대 Y인데 폼 생성 전 확인창이 뜸');

  // 3) 실·빈 + 택대 + 10번N: 화면 주의 문구 (문구 그대로) + 확인창
  P.setHead(hSbn);
  getElem('takdae').checked = true;
  const note = P.silbinTakNNote();
  if (note !== P.SILBIN_TAKN_TEXT) throw new Error('Test 39 주의 문구가 다름: ' + note);
  if (!/헤더는 '택대'인데 10번 택배대행이 'N'/.test(note)) throw new Error('Test 39 주의 문구에 헤더/10번 표기가 빠짐: ' + note);
  if (!/실·빈 혼합이라 택대로 유지됨/.test(note)) throw new Error('Test 39 주의 문구에 실·빈 유지 안내가 빠짐: ' + note);
  if (!/확인해 주세요/.test(note)) throw new Error('Test 39 주의 문구에 확인 요청이 빠짐: ' + note);
  const ask = P.silbinTakNAsk();
  if (!ask) throw new Error('Test 39 실·빈+택대+10번N인데 폼 생성 전 확인창 문구가 없음');
  if (!/10번 택배대행은 \[N\]/.test(ask)) throw new Error('Test 39 확인창에 10번 N 안내가 빠짐: ' + ask);
  if (!/택대로 유지하고/.test(ask)) throw new Error('Test 39 확인창에 택대 유지 안내가 빠짐: ' + ask);
  if (!/\[취소\]/.test(ask)) throw new Error('Test 39 확인창에 취소(중단) 안내가 빠짐: ' + ask);
  // 택배대행 체크를 끄면(수진 님이 직접 고른 것) 주의 문구는 내리고 확인창은 '택 없이'로
  getElem('takdae').checked = false;
  if (P.silbinTakNNote() !== '') throw new Error('Test 39 택배대행 체크를 껐는데 주의 문구가 남음');
  if (!/체크가 꺼져 있어 #택 없이/.test(P.silbinTakNAsk())) throw new Error('Test 39 택배대행을 끈 상태의 확인창 문구가 틀림');
  getElem('takdae').checked = true;

  // 4) fname: 붙여 쓴 건수 방제에서 끝 숫자를 통째로 떼고 넘김 ('장갑1'처럼 잘리지 않게)
  if (P.sheetBaseName('#택11.19실/빈 네쿠 젊음크림10', '10') !== '#택 실/빈 네쿠 젊음크림') throw new Error('Test 39 fname(네쿠) 실패: ' + P.sheetBaseName('#택11.19실/빈 네쿠 젊음크림10', '10'));
  if (P.sheetBaseName('#택11.19실/빈 김상사 장갑15', '15') !== '#택 실/빈 김상사 장갑') throw new Error('Test 39 fname(장갑) 실패: ' + P.sheetBaseName('#택11.19실/빈 김상사 장갑15', '15'));
  if (P.sheetBaseName('#택11.19실/빈 김상사 장갑15', '5') !== '#택 실/빈 김상사 장갑') throw new Error('Test 39 fname: 인원이 달라도 끝 숫자가 통째로 빠져야 함(장갑1 금지): ' + P.sheetBaseName('#택11.19실/빈 김상사 장갑15', '5'));
  if (P.sheetBaseName('#택11.17 실 에스지엠컴퍼니문풍지외4', '4') !== '#택 실 에스지엠컴퍼니문풍지외') throw new Error('Test 39 fname(외4) 실패: ' + P.sheetBaseName('#택11.17 실 에스지엠컴퍼니문풍지외4', '4'));
  if (P.sheetBaseName('#택11.17 실 문풍지 풍선 4', '4') !== '#택 실 문풍지 풍선') throw new Error('Test 39 fname(띄어 쓴 4) 실패: ' + P.sheetBaseName('#택11.17 실 문풍지 풍선 4', '4'));

  // 5) 폼 생성 링크에 그 fname이 실제로 실려 나가는지 (#81 방제 그대로 render)
  getElem('req').value = reqSilbinN;
  getElem('t-ip').checked = true;
  getElem('t-up').checked = false;
  getElem('takdae').checked = true;
  getElem('realship').checked = false;
  getElem('fruit').checked = false;
  getElem('cart').checked = false;
  getElem('day').value = '1';
  getElem('date').value = '2026-11-19';
  getElem('slot').value = 'midnight';
  const gsSbn = [Object.assign({}, hSbn.guides[0], { keyword: '방한장갑', guide: '방한장갑', seller: '김상사', pname: '제르넬 남성용 방한장갑', option: '라지', price: '9,900', platform: '쿠팡', pno: '9812998435 - 2653***9917', page: '1p' })];
  P.setGuides(gsSbn);
  ['keyword', 'guide', 'daily', 'total', 'price', 'ship', 'platform', 'seller', 'option', 'pname', 'url', 'pno', 'short', 'page', 'pageM', 'similar', 'photo', 'thumb'].forEach(k => { getElem(k).value = String(gsSbn[0][k] === undefined || gsSbn[0][k] === null ? '' : gsSbn[0][k]); });
  const room39 = P.makeRoom('11.19', P.dayTotalOf(1));
  getElem('o-room').value = room39;
  P.render();
  const href39 = String(getElem('make-run').href || '');
  const fnameQs = (href39.match(/[&?]fname=([^&]*)/) || [])[1] || '';
  const fname39 = decodeURIComponent(fnameQs).replace(/\+/g, ' ');
  if (!/^#택11\.19실\/빈 김상사 /.test(room39)) throw new Error('Test 39 실·빈+택대 방제가 택을 잃음: ' + room39);
  if (/[0-9]{1,2}\.[0-9]{1,2}/.test(fname39) || /\d$/.test(fname39)) throw new Error('Test 39 폼 생성 링크의 fname에 날짜·끝 숫자가 남음: "' + fname39 + '" (방제 ' + room39 + ')');
  if (fname39.indexOf('김상사') < 0 || !/^#택 실\/빈 /.test(fname39)) throw new Error('Test 39 폼 생성 링크의 fname이 방제와 다름: "' + fname39 + '" (방제 ' + room39 + ')');
  // 2일차(10명) 방제도 이름에서는 건수가 통째로 빠짐
  if (P.sheetBaseName('#택11.20실/빈 김상사 방한장갑10', '10') !== '#택 실/빈 김상사 방한장갑') throw new Error('Test 39 2일차 fname이 틀림: ' + P.sheetBaseName('#택11.20실/빈 김상사 방한장갑10', '10'));
  getElem('day').value = '1';
  getElem('o-room').value = room39;
  P.render();
  // 실·빈이면 방제는 택 유지 + 실/빈 (차단 ⛔ 문구가 아니라 ⚠️ 주의 문구)
  if (!/^#택11\.19실\/빈 김상사 /.test(room39)) throw new Error('Test 39 실·빈+택대 방제가 택을 잃음: ' + room39);
  const warn39 = String(getElem('o-warn').textContent || '');
  if (warn39.indexOf(P.SILBIN_TAKN_TEXT) < 0) throw new Error('Test 39 화면 주의 문구(o-warn)가 안 뜸: ' + warn39.slice(0, 160));
  if (warn39.indexOf('⛔') >= 0) throw new Error('Test 39 실·빈인데 차단(⛔) 문구가 뜸: ' + warn39.slice(0, 160));

  // 6) 상품명이 나중에(기억해 둔 상품 정보·같은 상품의 다른 가이드) 채워져도 대표 키워드가 비지 않음
  //  (11/18 라이브 실측: 상품명·판매처·상품번호는 기억에서 들어왔는데 공지 '🐥★키워드 :' 칸만 빈 채로 나감)
  const gk = Object.assign({}, hSbn.guides[0], { keyword: '', guide: '', kwAuto: true, pname: '제르넬 남성용 방한장갑 스마트폰 터치 기모 라이더 장갑', platform: '쿠팡', price: '9,900', option: '라지', seller: '김상사' });
  P.setGuides([gk]);
  ['keyword', 'guide', 'daily', 'total', 'price', 'ship', 'platform', 'seller', 'option', 'pname', 'url', 'pno', 'short', 'page', 'pageM', 'similar', 'photo', 'thumb'].forEach(k => { getElem(k).value = String(gk[k] === undefined || gk[k] === null ? '' : gk[k]); });
  getElem('keyword').value = ''; getElem('guide').value = '';
  P.render();
  if (getElem('keyword').value !== '방한장갑') throw new Error('Test 39 상품명만 있을 때 대표 키워드가 안 채워짐: "' + getElem('keyword').value + '"');
  if (String(getElem('o-notice').value).indexOf('🐥★키워드 : 방한장갑') < 0) throw new Error('Test 39 공지 키워드 칸이 빈 채로 나감');
  // 수진 님이 키워드를 직접 비운 것(직접 고침)은 다시 채우지 않음
  P.setGuides([Object.assign({}, gk, { keyword: '', kwAuto: false })]);
  ['keyword', 'guide', 'daily', 'total', 'price', 'ship', 'platform', 'seller', 'option', 'pname', 'url', 'pno', 'short', 'page', 'pageM', 'similar', 'photo', 'thumb'].forEach(k => { getElem(k).value = ''; });
  getElem('pname').value = gk.pname; getElem('platform').value = '쿠팡'; getElem('price').value = '9,900';
  P.render();
  if (getElem('keyword').value !== '') throw new Error('Test 39 직접 비운 키워드를 다시 채움: "' + getElem('keyword').value + '"');

  console.log('✓ 실·빈+택대+10번N 주의 문구·확인창·fname 시험 통과 (' + room39 + ' → fname "' + fname39 + '")');
}

// ==========================================
// Test 40: 팀룸 #85 — 네이버 단독 의뢰서(구분선 뒤 옵션 칸) · 1p 가격검색 오탐 · 하루 3건 옵션 2종(라벤더3/브라운3) (11/19)
// ==========================================
console.log('-- Test 40: #85 디어누베 아기풋워머 (네이버 6건·하루 3건·라벤더 3/브라운 3)');
{
  const req85 = `#입금대행 실배 13900

1. 검색 키워드(미노출시 저희가 키워드땁니다): 디어누베 아기풋워머

2. 키워드 검색 시 현재 순위 :모르시면 비워두세요

3. 총 결제하신 건수 : 6

4. 하루 구매하는건수 (어뷰징 피하기위해
조금씩 변동될수 있습니다 : 3건

5. 상품주소(URL) : https://m.smartstore.naver.com/delphiniummarket/products/13882138252
-> 네이버 6건
—————————

6. 구매옵션 :
네이버 - 라벤더 3 , 브라운 3

7. 포토제공 (몇명)  /포토없음  선택: 포토제공x

8. 리뷰 가이드 :
(참고용)
kc인증 받은 안심되는 소재
신겨보았을때 착용모습

9. 입금하실 입금자명 : 강태연(우주파워샵)`;

  const h85 = P.parseAll(req85);
  // ① 주소(URL)가 없는 조각은 독립 상품이 아니다 — 구분선 뒤 옵션·포토·리뷰·입금자명 칸이 별도 '쿠팡' 가이드로 갈라지면 안 됨
  if (h85.guides.length !== 1) throw new Error('Test 40 네이버 단독 의뢰서는 가이드 1개여야 함(유령 쿠팡 블록), got: ' + h85.guides.length + ' / ' + JSON.stringify(h85.guides.map(x => x.platform)));
  const g85 = h85.guides[0];
  if (g85.platform !== '네이버') throw new Error('Test 40 플랫폼은 네이버여야 함: ' + g85.platform);
  if (String(g85.pno) !== '13882138252') throw new Error('Test 40 상품번호: ' + g85.pno);
  if (!/kc인증/.test(g85.review)) throw new Error('Test 40 리뷰 가이드가 유령 블록으로 새서 사라짐: ' + g85.review);

  // ② 위치: 키워드 라벨 안내문 '(미노출시 저희가 키워드땁니다)'만 보고 '(안나오면 가격검색 해주세요)'를 붙이지 않음
  if (g85.page) throw new Error('Test 40 순위를 모를 때 위치는 빈칸이어야 함(양식 안내문 오탐), got: ' + g85.page);
  if (/가격\s*검색/.test(g85.keyword)) throw new Error('Test 40 키워드에 가격검색 안내가 붙음: ' + g85.keyword);
  if (String(g85.keyword) !== '디어누베 아기풋워머') throw new Error('Test 40 키워드: ' + g85.keyword);

  // ③ 옵션: '네이버 - 라벤더 3 , 브라운 3' → 이름표를 떼고 라벤더 3명 / 브라운 3명 (하루 3건)
  if (g85.optBase.length !== 2 || g85.optBase[0].label !== '라벤더' || g85.optBase[0].qty !== '3' || g85.optBase[1].label !== '브라운' || g85.optBase[1].qty !== '3') {
    throw new Error('Test 40 옵션은 라벤더 3 / 브라운 3이어야 함: ' + JSON.stringify(g85.optBase));
  }
  if (g85.option !== '라벤더 (3명)') throw new Error('Test 40 1일차 옵션은 라벤더 (3명): ' + g85.option);
  if (P.optionText(g85, 2) !== '브라운 (3명)') throw new Error('Test 40 2일차 옵션은 브라운 (3명): ' + P.optionText(g85, 2));

  // ④ 2일차 계획: 3명·옵션 이름 목록과 그날 인원([0,3])을 서버에 넘겨 다음 일차 공지 옵션 줄이 '브라운 (3명)'이 되게
  P.setGuides([g85]);
  getElem('day').value = '1';
  getElem('date').value = '2026-11-19';
  getElem('o-room').value = '#11.19 실 아기풋워머 3';
  const plan85 = P.buildPlan();
  if (plan85.length !== 1) throw new Error('Test 40 2일차 계획이 1개여야 함: ' + JSON.stringify(plan85));
  if (Number(plan85[0].n) !== 3) throw new Error('Test 40 2일차 인원은 3명: ' + plan85[0].n);
  const c85 = plan85[0].c[0];
  if (Number(c85[0]) !== 3) throw new Error('Test 40 2일차 건수 3: ' + c85[0]);
  if (JSON.stringify(c85[1]) !== '[0,3]') throw new Error('Test 40 2일차 옵션 인원은 [라벤더 0, 브라운 3]: ' + JSON.stringify(c85[1]));
  if (JSON.stringify(c85[3]) !== '["라벤더","브라운"]') throw new Error('Test 40 2일차 옵션 이름 목록: ' + JSON.stringify(c85[3]));

  // ⑤ 같은 양식 안내문이라도 키워드를 못 받은 의뢰(#81 김상사)는 가격검색 안내 유지
  const hKwMiss = P.parseAll('#입금대행 택대 9900\n\n1. 검색 키워드(미노출시 저희가 키워드땁니다):\n2. 키워드 검색 시 현재 순위 :모르시면 비워두세요\n3. 총 결제하신 건수 : 5\n4. 하루 진행 건수 : 5\n5. 상품주소(URL) : https://www.coupang.com/vp/products/9812998435?itemId=29388465518\n6. 구매옵션 : 라지\n10.택배대행 Y/N: N');
  if (!/가격검색/.test(String(hKwMiss.guides[0].page))) throw new Error('Test 40 키워드 없는 의뢰의 가격검색 안내가 사라짐: ' + hKwMiss.guides[0].page);

  console.log('✓ #85 네이버 단독·유령 쿠팡 없음·위치 빈칸·1일차 라벤더 3명/2일차 브라운 3명 시험 통과');
}

// ==========================================
// Test 41: 팀룸 #88(#89·#91) — 쿠팡 '다른 판매자 보기(2)' 버튼 글자가 판매처로 들어가 방제·명단 제목이 '보기(2)'가 되던 것 (11/19)
// ==========================================
{
  console.log('-- Test 41: #88 판매처에 보기(2) 오인식');
  // ① okSeller: 화면 버튼 글자는 판매처가 아님
  ['보기(2)', '보기', '더보기', '전체 보기', '상품평 보기(12)', '리뷰 보기(3)', '판매자 보기(2)'].forEach(x => {
    if (P.okSeller(x)) throw new Error('Test 41 okSeller가 화면 글자를 판매처로 받음: ' + x);
  });
  // ② 진짜 상호는 그대로 (보기로 시작해도, 괄호 없는 이름도)
  ['디에이치컴퍼니', '보기좋은상회', '에큐어', '김상사'].forEach(x => {
    if (!P.okSeller(x)) throw new Error('Test 41 진짜 판매처를 막음: ' + x);
  });
  // ③ 상품 정보 붙여넣기 칸에 판매처 '보기(2)'가 와도 판매처는 빈칸 (기억·공지·방제로 안 감)
  const cp88 = P.parseCoupang('상품명 : 에르온 웜마스터 프리미엄 남성용 발열 기모내의 상하의 세트\n판매처 : 보기(2)\n상품번호 : 9810539344 - 29380190716');
  if (cp88.seller) throw new Error('Test 41 parseCoupang이 보기(2)를 판매처로 받음: ' + cp88.seller);
  const cp88ok = P.parseCoupang('상품명 : 에르온 웜마스터 프리미엄 남성용 발열 기모내의 상하의 세트\n판매처 : 디에이치컴퍼니\n상품번호 : 9810539344 - 29380190716');
  if (cp88ok.seller !== '디에이치컴퍼니') throw new Error('Test 41 정상 판매처를 막음: ' + cp88ok.seller);

  // ④ #88 의뢰서 그대로: 가이드 2개(남성/여성), 판매처가 제대로 읽힌 경우 방제
  const req88 = `#입금대행 실배 19800 19800\n\n1. 검색 키워드(미노출시 저희가 키워드땁니다): 남성용 기모내의\n2. 키워드 검색 시 현재 순위 : \n3. 총 구매 건수 :  5건 (실배송5건)\n4. 일 진행 건수 : 5건(실구매)\n5. 상품주소(URL) : https://link.coupang.com/a/iNrkgNl5tQ\n6. 구매옵션 : 리뷰어들사이즈에따라\n7. 포토제공 유 무  :  무\n8. 리뷰내용 가이드 : 무조건 포장지사진은x 포장지벗긴 실물사진과 착용사진 등 만적용\n9. 입금하실 입금자명 : 강유정\n10.택배대행 Y/N: N\n================\n\n1. 검색 키워드(미노출시 저희가 키워드땁니다): 여성용 기모내의\n2. 키워드 검색 시 현재 순위 : \n3. 총 구매 건수 :  5건 (실배송5건)\n4. 일 진행 건수 : 5건(실구매)\n5. 상품주소(URL) : https://link.coupang.com/a/iNrsBUCCPc\n6. 구매옵션 : 리뷰어들사이즈에따라\n7. 포토제공 유 무  :  무\n8. 리뷰내용 가이드 : 무조건 포장지사진은x 포장지벗긴 실물사진과 착용사진 등 만적용\n9. 입금하실 입금자명 : 강유정\n10.택배대행 Y/N: N`;
  const h88 = P.parseAll(req88);
  if (h88.guides.length !== 2) throw new Error('Test 41 #88은 가이드 2개여야 함: ' + h88.guides.length);
  getElem('req').value = req88;
  getElem('takdae').checked = false;
  getElem('realship').checked = true;
  getElem('fruit').checked = false;
  getElem('t-up').checked = false;
  h88.guides.forEach(g => { g.seller = '디에이치컴퍼니'; });
  P.setGuides(h88.guides);
  const roomGood = P.makeRoom('11.19', '10');
  if (/보기/.test(roomGood)) throw new Error('Test 41 방제에 화면 글자가 들어감: ' + roomGood);
  if (!/기모내의/.test(roomGood) || roomGood.length > 20) throw new Error('Test 41 방제가 20자에 기모내의를 남겨야 함: ' + roomGood + ' (' + roomGood.length + '자)');

  // ⑤ 판매처가 '보기(2)'로 잘못 들어온 상태라도 방제·명단 제목에는 절대 안 씀 (이중 방어)
  P.setGuides([{ keyword: '남성용 기모내의', guide: '기모내의', seller: '보기(2)', platform: '쿠팡', total: '5', daily: '5' }]);
  const roomBad = P.makeRoom('11.19', '5');
  if (/보기/.test(roomBad)) throw new Error('Test 41 판매처가 보기(2)일 때 방제에 그 글자가 들어감: ' + roomBad);

  console.log('✓ #88 판매처 보기(2) 차단·방제 시험 통과 (정상 판매처 방제: ' + roomGood + ' / 보기(2)일 때: ' + roomBad + ')');
}

// ==========================================
// Test 42: 팀룸 #96 (11/20) — 의뢰서 머리 금액에 배송비를 또 더해 57,000 → 60,000 · 상품명 뒤 '| 판매처 복사'
// ==========================================
console.log('-- Test 42: #96 동대문청년 롱패딩·후리스 (머리 금액 57000 34500 + 배송비 3,000, 네이버 스마트스토어)');
{
  const req96 = `#입금대행 택대 57000 34500

1. 검색 키워드(미노출시 저희가 키워드땁니다): 겨울롱패딩, 단체롱패딩
2. 키워드 검색 시 현재 순위 :모르시면 비워두세요
3. 총 결제하신 건수 : 5
4. 하루 진행 건수 : 2 / 2/ 1
5. 상품주소(URL) : https://smartstore.naver.com/ddmyouth/products/13869405676
6. 구매옵션 : 
7. 포토제공 (몇명)  /포토없음  선택: 포토 다섯명
8. 리뷰 가이드 :  /원고제공 / 
9. 입금하실 입금자명 : 양흥식
10.택배대행 Y/N: 


1. 검색 키워드(미노출시 저희가 키워드땁니다): 양털후리스, 단체후리스
2. 키워드 검색 시 현재 순위 :모르시면 비워두세요
3. 총 결제하신 건수 : 5
4. 하루 진행 건수 : 2 / 2/ 1
5. 상품주소(URL) : https://smartstore.naver.com/ddmyouth/products/13882663982
6. 구매옵션 : `;
  const h96 = P.parseAll(req96);
  if (h96.guides.length !== 2) throw new Error('Test 42 #96은 가이드 2개여야 함: ' + h96.guides.length);
  if (h96.headPrices.join(',') !== '57000,34500') throw new Error('Test 42 머리 줄 금액을 못 읽음: ' + JSON.stringify(h96.headPrices));
  if (h96.guides[0].price !== '57000' || h96.guides[1].price !== '34500') throw new Error('Test 42 머리 금액이 가이드마다 안 들어감: ' + h96.guides[0].price + ' / ' + h96.guides[1].price);

  const gs96 = h96.guides.map((g, i) => Object.assign({}, g, {
    platform: '네이버', seller: '동대문청년', ship: '3,000', page: '1p',
    pno: i ? '13882663982' : '13869405676',
    pname: i ? '남녀공용 양털 후리스 집업 자켓 단체 주문 | 동대문청년' : '남녀공용 에어볼 롱패딩 겨울 돕바 단체복 | 동대문청년 복사'
  }));
  const fillFields = g => {
    ['keyword', 'guide', 'daily', 'total', 'price', 'ship', 'platform', 'seller', 'option', 'pname', 'url', 'pno', 'short', 'page', 'pageM', 'similar', 'photo', 'thumb']
      .forEach(k => { getElem(k).value = String(g[k] === undefined || g[k] === null ? '' : g[k]); });
  };
  P.setGuides(gs96);
  P.setHead(h96);
  getElem('req').value = req96;
  getElem('t-ip').checked = true;
  getElem('t-up').checked = false;
  getElem('takdae').checked = true;
  getElem('realship').checked = false;
  getElem('cart').checked = false;
  getElem('fruit').checked = false;
  getElem('day').value = '1';
  getElem('date').value = '2026-11-20';
  getElem('slot').value = 'midnight';
  fillFields(gs96[0]);
  P.render();
  const n96 = String(getElem('o-notice').value || '');

  // ① 1번 상품: 의뢰서 금액 57,000 그대로 (60,000 아님)
  if (n96.indexOf('🐥가격 : 57,000') < 0) throw new Error('Test 42 1번 가격이 57,000이 아님:\n' + n96.split('\n').filter(l => /가격/.test(l)).join(' / '));
  if (/60,000|37,500/.test(n96)) throw new Error('Test 42 배송비가 또 더해짐(60,000/37,500): ' + n96.split('\n').filter(l => /가격/.test(l)).join(' / '));
  if (n96.indexOf('🐥가격 : 34,500') < 0) throw new Error('Test 42 2번 가격이 34,500이 아님:\n' + n96.split('\n').filter(l => /가격/.test(l)).join(' / '));
  // ② 상품명 끝 '| 동대문청년 복사'가 남지 않음
  if (/복사/.test(n96)) throw new Error('Test 42 공지 상품명에 복사 단추 글자가 남음: ' + n96.split('\n').filter(l => /상품명/.test(l)).join(' / '));
  if (/\|\s*동대문청년/.test(n96)) throw new Error('Test 42 공지 상품명에 판매처 꼬리가 남음: ' + n96.split('\n').filter(l => /상품명/.test(l)).join(' / '));
  if (n96.indexOf('🐥상품명 : 남녀공용 에어볼 롱패딩 겨울 돕바 단체복\n') < 0) throw new Error('Test 42 상품명이 잘림: ' + JSON.stringify(n96.split('\n').filter(l => /상품명/.test(l)).join(' / ')));
  if (n96.indexOf('🐥상품명 : 남녀공용 양털 후리스 집업 자켓 단체 주문\n') < 0) throw new Error('Test 42 2번 상품명에 판매처 꼬리가 남음');
  // ③ 폼·결제금액 확인에 쓰는 가격도 57,000 (60,000이면 실제 결제 57,000과 어긋나 오탐)
  const href96 = String(getElem('make-run').href || '');
  const prices96 = decodeURIComponent((href96.match(/[&?]prices=([^&]*)/) || [])[1] || '');
  if (prices96.indexOf('57000') < 0 || prices96.indexOf('60000') >= 0) throw new Error('Test 42 폼 생성 링크 가격이 틀림: "' + prices96 + '"');

  // ④ 반대 케이스: 의뢰서에 금액이 없고 상품 페이지 가격(31,500)만 + 배송비 3,000 → 예전처럼 더함 (34,500)
  P.setHead({ headPrices: [] });
  getElem('req').value = req96.replace('#입금대행 택대 57000 34500', '#입금대행 택대');
  P.setGuides([Object.assign({}, gs96[1], { price: '31,500', ship: '3,000', shipInHead: undefined })]);
  fillFields(Object.assign({}, gs96[1], { price: '31,500' }));
  P.render();
  const nNoHead = String(getElem('o-notice').value || '');
  if (nNoHead.indexOf('🐥가격 : 34,500 (배송비 3,000원 포함)') < 0) throw new Error('Test 42 페이지 가격+배송비 케이스가 깨짐(34,500이어야 함): ' + nNoHead.split('\n').filter(l => /가격/.test(l)).join(' / '));

  // ⑤ 의뢰서 금액이 페이지 가격과 똑같으면(배송비 별도로 확인됨, shipInHead=false) 더해야 함
  P.setHead({ headPrices: ['34500'] });
  P.setGuides([Object.assign({}, gs96[1], { price: '34,500', ship: '3,000', shipInHead: false })]);
  fillFields(Object.assign({}, gs96[1], { price: '34,500' }));
  P.render();
  const nSep = String(getElem('o-notice').value || '');
  if (nSep.indexOf('🐥가격 : 37,500 (배송비 3,000원 포함)') < 0) throw new Error('Test 42 배송비 별도(shipInHead=false) 케이스가 깨짐(37,500이어야 함): ' + nSep.split('\n').filter(l => /가격/.test(l)).join(' / '));

  // ⑥ 상품명 정제: 판매처 꼬리·복사만 떼고 규격·수량은 그대로
  if (P.baseName('남녀공용 에어볼 롱패딩 겨울 돕바 단체복 | 동대문청년 복사', {}, { platform: '네이버', seller: '동대문청년' }) !== '남녀공용 에어볼 롱패딩 겨울 돕바 단체복') throw new Error('Test 42 네이버 상품명 정제 실패: ' + P.baseName('남녀공용 에어볼 롱패딩 겨울 돕바 단체복 | 동대문청년 복사', {}, { platform: '네이버', seller: '동대문청년' }));
  if (P.baseName('무릎담요 3kg 극세사', {}, { platform: '쿠팡', seller: '동대문청년' }) !== '무릎담요 3kg 극세사') throw new Error('Test 42 규격이 붙은 상품명을 건드림');
  if (P.baseName('제르넬 남성용 방한장갑 | 동대문청년', {}, { platform: '쿠팡', seller: '동대문청년' }) !== '제르넬 남성용 방한장갑') throw new Error('Test 42 쿠팡 상품명의 판매처 꼬리를 못 뗌');
  if (P.baseName('무선마우스 | 화이트', {}, { platform: '네이버', seller: '동대문청년' }) !== '무선마우스 | 화이트') throw new Error('Test 42 판매처가 아닌 \'|\' 꼬리를 잘라냄');

  console.log('✓ #96 머리 금액 배송비 중복 가산·상품명 \'| 판매처 복사\' 시험 통과 (57,000·34,500 / 페이지 가격만일 때 34,500 / 배송비 별도 37,500)');
}


// ==========================================
// Test 43: 의뢰서에 섞인 '사진 주소'는 상품 주소로 안 읽기 (11/20 사용자 제보 — [한 번에 가져오기]가 이미지 탭만 열고 끝)
// ==========================================
console.log('-- Test 43: 사진(썸네일) 주소 제외 · 상품 주소만 · 썸네일 칸 대체');
{
  if (typeof P.isImgUrl !== 'function') throw new Error('Test 43: isImgUrl 이 없음');
  [
    'https://shop-phinf.pstatic.net/20241120_1/1234_1700000000000PNG/1234_1700000000000.png?type=w860',
    'https://thumbnail7.coupangcdn.com/thumbnails/remote/230x230ex/image/vendor_inventory/abc.jpg',
    'https://postfiles.pstatic.net/MjAyNDExMjBfMS/photo.JPG',
    'https://blogfiles.naver.net/MjAyNDExMjBfMS/blog.gif',
    'https://cdn.example.com/a/b.webp#x',
    'https://cdn.example.com/a/b.bmp',
    'https://cdn.example.com/a/b.jpeg?w=1'
  ].forEach(u => { if (!P.isImgUrl(u)) throw new Error('Test 43 사진 주소를 못 알아봄: ' + u); });
  [
    'https://www.coupang.com/vp/products/9778569271?itemId=29274107751',
    'https://m.coupang.com/vm/products/9778569271',
    'https://smartstore.naver.com/ecureshop/products/1234567890',
    'https://link.coupang.com/a/abc123',
    'https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo=A000000123456'
  ].forEach(u => { if (P.isImgUrl(u)) throw new Error('Test 43 상품 주소를 사진으로 잘못 봄: ' + u); });

  const req = `#입금대행 실배 11500

1. 검색 키워드 : k포두부
3. 총 구매 건수 : 2
4. 일 진행 건수 : 2
5. 상품주소(URL) : https://shop-phinf.pstatic.net/20241120_1/1234_1700000000000PNG/1234_1700000000000.png?type=w860
https://www.coupang.com/vp/products/9778569271
6. 구매옵션 : 1kg 11,500원
7. 포토제공 유 무 : 유 2`;
  const h = P.parseAll(req);
  const g = h.guides[0];
  if (!g) throw new Error('Test 43 가이드를 못 읽음');
  if (/pstatic|\.png/i.test(String(g.url || ''))) throw new Error('Test 43 사진 주소가 상품 주소 칸에 들어감: ' + g.url);
  if (!/coupang\.com\/vp\/products\/9778569271/.test(String(g.url || ''))) throw new Error('Test 43 상품 주소를 못 읽음: ' + g.url);
  if (!/pstatic/.test(String(g.thumb || ''))) throw new Error('Test 43 사진 주소를 썸네일 칸에 안 채움: ' + g.thumb);
  // 사진 주소만 있는 의뢰서 → 상품 주소는 비고 사진은 썸네일로만
  const h2 = P.parseAll(req.replace('https://www.coupang.com/vp/products/9778569271', ''));
  const g2 = h2.guides[0];
  if (/https?:/.test(String(g2.url || ''))) throw new Error('Test 43 사진 주소만 있는데 상품 주소가 생김: ' + g2.url);
  if (!/pstatic/.test(String(g2.thumb || ''))) throw new Error('Test 43 사진만 있을 때 썸네일을 못 채움: ' + g2.thumb);
  // 상품 주소 칸의 주소는 [열기] 단추 대상에서도 사진 주소를 뺌
  if (!/filter\(u => u && !isImgUrl\(u\.url\)\)/.test(scriptContent)) throw new Error('Test 43 updateProductLink 가 사진 주소를 거르지 않음');
  console.log('✓ 사진 주소 제외·상품 주소 유지·썸네일 대체 시험 통과');
}

// ==========================================
// Test 44: 의뢰서 칸에 '상품 정보'(확장 결과 모양)만 붙여넣음 — 상품번호로 상품 주소 (11/20 사용자: k포두부, v205에서 아무 창도 안 열림)
// ==========================================
console.log('-- Test 44: 상품 정보 모양 → 상품번호로 상품 주소');
{
  if (typeof P.infoAsReq !== 'function') throw new Error('Test 44: infoAsReq 가 없음');
  const info = `상품명 : 국내생산 가짜두부 500g 냉장 건두부 [원산지:상세설명에 표시]
판매처 : 가짜두부상회
상품번호 : 13805546799
옵션 : 500g
가격 : 10,600원
배송비 : 1,000원 (20,000원 이상 무료인데 이 가격은 안 됨)
썸네일 : https://shop-phinf.pstatic.net/20261018_158/1234_PNG/5678_9999.png?type=o1000`;
  const g = P.parseAll(info).guides[0];
  if (!g) throw new Error('Test 44 가이드를 못 읽음');
  if (String(g.url || '').trim() !== 'https://smartstore.naver.com/main/products/13805546799') throw new Error('Test 44 네이버 상품 주소를 못 만듦: ' + g.url);
  // 쿠팡 결과 모양(번호 - 아이템)
  const cg = P.parseAll(info.replace('13805546799', '9463496930 - 2816***8459').replace(/썸네일 : .*/, '썸네일 : https://thumbnail7.coupangcdn.com/thumbnails/remote/a.jpg')).guides[0];
  if (String(cg.url || '').trim() !== 'https://www.coupang.com/vp/products/9463496930') throw new Error('Test 44 쿠팡 상품 주소를 못 만듦: ' + cg.url);
  // 진짜 의뢰서는 건드리지 않음
  ['1. 검색 키워드 : 두부\n' + info, '5. 상품주소(URL) : https://smartstore.naver.com/abc/products/1\n' + info, '#입금대행 실배 10600\n' + info,
   info + '\nhttps://smartstore.naver.com/abc/products/1'].forEach(t => { if (P.infoAsReq(t)) throw new Error('Test 44 진짜 의뢰서를 상품 정보로 봄: ' + t.split('\n')[0]); });
  // 칸이 2개뿐이거나 상품번호가 없으면 만들지 않음
  if (P.infoAsReq('상품명 : 두부\n가격 : 1,000원')) throw new Error('Test 44 칸 2개로 주소를 만듦');
  if (P.infoAsReq('상품명 : 두부\n판매처 : 가게\n가격 : 1,000원\n썸네일 : https://shop-phinf.pstatic.net/a.png')) throw new Error('Test 44 상품번호 없이 주소를 만듦');
  if (!/fillReq\(t\)/.test(scriptContent) || !/fillReq\(val\)/.test(scriptContent)) throw new Error('Test 44 붙여넣기·분석 단추가 fillReq 를 안 씀');
  console.log('✓ 상품 정보 모양 → 상품 주소 시험 통과');
}

// ==========================================
// Test 45: '1번) …' 번호+번 양식 (11/20 사용자: 두부과자 의뢰서 — 칸을 못 읽어 키워드가 상품명에서 '냉장'으로 뜸)
// ==========================================
console.log('-- Test 45: N번) 양식');
{
  if (typeof P.beonReq !== 'function') throw new Error('Test 45: beonReq 가 없음');
  const req = `#입금대행 실배 10600
포토2분 

1번)  건강에좋은음식 몸에좋은 영양소 국내생산 HACCP 신선 단백질
글루텐프리 다이어트에 좋은음식 고단백 두부과자
2번)  하단 이미지 첨부
3번) 리뷰10개
4번) 1건~2건
5번)  https://naver.me/GHLF5veG
6번)  옵션없음
7번)  포토제공5명
8번) 리뷰가이드:   HACCP  국내생산
NonGMO   비닐패키지 로하스인증
다양한종류  (판두부 4mm면  8mm면)  당일배송  
9번)  홍길동`;
  const g = P.parseAll(req).guides[0];
  if (!g) throw new Error('Test 45 가이드를 못 읽음');
  if (!/^건강에좋은음식/.test(String(g.keyword || ''))) throw new Error('Test 45 키워드를 못 읽음: ' + g.keyword);
  if (String(g.total) !== '10') throw new Error('Test 45 총 건수: ' + g.total);
  if (String(g.daily) !== '2') throw new Error('Test 45 일 건수: ' + g.daily);
  if (String(g.url || '').trim() !== 'https://naver.me/GHLF5veG') throw new Error('Test 45 상품 주소: ' + g.url);
  if (/건강에좋은음식|naver\.me/.test(String(g.review || ''))) throw new Error('Test 45 1~5번이 리뷰 안내로 들어감: ' + g.review);
  if (!/HACCP/.test(String(g.review || ''))) throw new Error('Test 45 8번 리뷰 가이드를 못 읽음: ' + g.review);
  // '번' 줄이 2개 이하면 건드리지 않음 (본문 중 '1번 옵션' 같은 말)
  const few = '1번) 가\n2번) 나\n3. 총 구매 건수 : 5';
  if (P.beonReq(few) !== few) throw new Error('Test 45 번 줄 2개인데 바꿈');
  console.log('✓ N번) 양식 시험 통과');
}

// ==========================================
// Test 46: #99 의뢰서 머리 금액 = 상품 페이지 가격이면 배송비를 또 더하지 않음 (11/20 사용자: K-포두부 10,600 → 11,600)
// ==========================================
console.log('-- Test 46: #99 머리 금액 = 페이지 가격일 때 배송비 중복 가산 금지');
{
  if (typeof P.fillCoupang !== 'function') throw new Error('Test 46: fillCoupang 이 없음');
  const req99 = `#입금대행 실배 10600
포토2분 

1번)  건강에좋은음식 몸에좋은 영양소 국내생산 HACCP 신선 단백질
글루텐프리 다이어트에 좋은음식 고단백 두부과자
2번)  하단 이미지 첨부
3번) 리뷰10개
4번) 1건~2건
5번)  https://naver.me/GHLF5veG
6번)  옵션없음
7번)  포토제공5명
8번) 리뷰가이드:   HACCP  국내생산
NonGMO   비닐패키지 로하스인증
다양한종류  (판두부 4mm면  8mm면)  당일배송  
9번)  이창익`;
  const h99 = P.parseAll(req99);
  if (h99.headPrices.join(',') !== '10600') throw new Error('Test 46 머리 금액을 못 읽음: ' + JSON.stringify(h99.headPrices));
  const g99 = Object.assign({}, h99.guides[0], {
    platform: '네이버', seller: 'K-포두부', pno: '13805546799', page: '1p',
    pname: '국내생산 k포두부 500g 냉장 건두부 쌈두부 얇은두부면 신선 저탄수 마라탕 [원산지:상세설명에 표시]',
    price: '', ship: '', shipInHead: undefined
  });
  P.setGuides([g99]);
  P.setHead(h99);
  P.setCur(0);
  getElem('req').value = req99;
  ['keyword', 'guide', 'daily', 'total', 'price', 'ship', 'platform', 'seller', 'option', 'pname', 'url', 'pno', 'short', 'page', 'pageM', 'similar', 'photo', 'thumb']
    .forEach(k => { getElem(k).value = String(g99[k] === undefined || g99[k] === null ? '' : g99[k]); });
  getElem('t-ip').checked = true; getElem('t-up').checked = false;
  getElem('takdae').checked = false; getElem('realship').checked = true;
  getElem('cart').checked = false; getElem('fruit').checked = false;
  getElem('day').value = '1'; getElem('date').value = '2026-11-20'; getElem('slot').value = 'midnight';
  getElem('toast').textContent = '';

  // 상품 페이지를 읽어 온 상황: 가격 10,600원, 배송비 1,000원
  P.fillCoupang({ price: '10,600', ship: 1000 });
  if (getElem('ship').value !== '1,000') throw new Error('Test 46 배송비 칸이 1,000이 아님: ' + getElem('ship').value);
  const tst = String(getElem('toast').textContent || '');
  if (tst.indexOf('의뢰서 금액과 페이지 가격이 같아 더하지 않았어요') < 0) throw new Error('Test 46 배송비 안내 문구가 틀림: ' + tst);

  P.render();
  const n99 = String(getElem('o-notice').value || '');
  if (n99.indexOf('🐥가격 : 10,600 (배송비 1,000원 포함)') < 0) throw new Error('Test 46 가격이 10,600이 아님:\n' + n99.split('\n').filter(l => /가격/.test(l)).join(' / '));
  if (/11,600/.test(n99)) throw new Error('Test 46 배송비가 또 더해짐(11,600): ' + n99.split('\n').filter(l => /가격/.test(l)).join(' / '));

  // 예전 기억(shipInHead=false)이 남아 있는 가이드를 다시 채워도 더하지 않음 (#99 재현: 페이지 가격 = 머리 금액)
  const gOld = Object.assign({}, g99, { price: '', ship: '', shipInHead: false });
  P.setGuides([gOld]); P.setCur(0);
  ['price', 'ship'].forEach(k => { getElem(k).value = ''; });
  P.fillCoupang({ price: '10,600', ship: 1000 });
  P.render();
  const nOld = String(getElem('o-notice').value || '');
  if (nOld.indexOf('🐥가격 : 10,600') < 0 || /11,600/.test(nOld)) throw new Error('Test 46 예전 기억이 남은 가이드에서 배송비가 또 더해짐: ' + nOld.split('\n').filter(l => /가격/.test(l)).join(' / '));

  // 머리 금액이 '페이지 가격 + 배송비'인 경우(#96처럼 11,600 = 10,600 + 1,000)는 예전처럼 더해 11,600 (머리 금액과 같음)
  P.setHead({ headPrices: ['11600'] });
  P.setGuides([Object.assign({}, g99, { price: '', ship: '', shipInHead: undefined })]); P.setCur(0);
  getElem('price').value = ''; getElem('ship').value = '';
  P.fillCoupang({ price: '10,600', ship: 1000 });
  P.render();
  const nSum = String(getElem('o-notice').value || '');
  if (nSum.indexOf('🐥가격 : 11,600 (배송비 1,000원 포함)') < 0) throw new Error('Test 46 머리 금액 = 페이지 가격 + 배송비 경우가 깨짐(11,600이어야 함): ' + nSum.split('\n').filter(l => /가격/.test(l)).join(' / '));

  // 제보 문구·버전 표시가 v207
  // 버전 숫자를 시험에 박으면 다음 버전에서 무조건 빨간불(plantitle 날짜 하드코딩 교훈) → 페이지 표기에서 읽어 비교
  const GVER = (html.match(/생성기 v(\d+)/) || [])[1] || '';
  ['[생성기 v' + GVER + ' 제보]', '[가이드 생성기 v' + GVER + ' 공지 오류 제보]'].forEach(s => {
    if (scriptContent.indexOf(s) < 0) throw new Error('Test 46 제보 문구가 페이지 버전(v' + GVER + ')과 다름: ' + s);
  });
  if (/생성기 v182/.test(scriptContent) || /생성기 v182/.test(html)) throw new Error('Test 46 v182 문구가 남아 있음');
  if (!GVER || Number(GVER) < 208) throw new Error('Test 46 생성기 버전 표시가 v208 이상이 아님: ' + GVER);
  console.log('✓ #99 배송비 중복 가산 금지 시험 통과 (10,600 유지 · 안내 문구 · v207)');
}

// ==========================================
// Test 47: 팀룸 #104 — 키워드는 '면도기'인데 방제가 '초슬림' (11/21)
// ==========================================
{
  console.log('-- Test 47: #104 — 상품명 속 초슬림이 아니라 품목명 면도기가 키워드·방제로');
  const P104 = '[츄리샤] 휴대용 초슬림 전동 면도기 전기 면도기 USB충전식 방수 남성 미니';

  // ① 대표 키워드 추천이 수식어(초슬림·전동·전기·휴대용·미니·방수)를 빼고 품목명 '면도기'
  const s104 = P.suggestKeywords(P104, []);
  if (s104.main !== '면도기') throw new Error('Test 47 대표 키워드가 면도기가 아님: ' + JSON.stringify(s104.main));
  const kwList104 = P.sugKw(P104);
  if (!kwList104.length || kwList104.some(k => /초슬림/.test(k))) throw new Error('Test 47 추천 키워드에 초슬림이 남음: ' + JSON.stringify(kwList104));
  if (!kwList104.some(k => /면도기/.test(k))) throw new Error('Test 47 추천 키워드에 면도기가 없음: ' + JSON.stringify(kwList104));

  // ② 상품명만 넣으면 키워드·짧은 상품명이 면도기로 자동 입력되고 방제도 면도기
  getElem('req').value = '';
  ['keyword', 'guide', 'seller', 'pname', 'o-room', 'o-list'].forEach(k => { getElem(k).value = ''; getElem(k).textContent = ''; });
  getElem('date').value = '2026-11-21';
  getElem('day').value = '1';
  getElem('takdae').checked = true;
  getElem('realship').checked = false;
  getElem('fruit').checked = false;
  getElem('cart').checked = false;
  P.setGuides([{ pname: P104, keyword: '', guide: '', daily: '5', total: '5', days: [{ n: '5' }], platform: '쿠팡', url: '', seller: '' }]);
  P.setCur(0);
  getElem('pname').value = P104;
  fireInput('pname');
  if (getElem('keyword').value !== '면도기') throw new Error('Test 47 상품명 입력 후 키워드가 면도기가 아님: ' + getElem('keyword').value);
  if (getElem('guide').value !== '면도기') throw new Error('Test 47 짧은 상품명이 면도기가 아님: ' + getElem('guide').value);
  const room104 = P.makeRoom('11.21', '5');
  if (/초슬림/.test(room104)) throw new Error('Test 47 방제에 초슬림이 남음: ' + room104);
  if (!/면도기/.test(room104)) throw new Error('Test 47 방제에 면도기가 없음: ' + room104);

  // ③ 예전 자동값('초슬림')이 짧은 상품명에 남은 상태에서 사용자가 #keyword를 '면도기'로 고치면 방제·명단 제목도 면도기
  const gOld = { pname: P104, keyword: '초슬림', guide: '초슬림', kwAuto: true, daily: '5', total: '5', days: [{ n: '5' }], platform: '쿠팡', url: '', seller: '실버반석' };
  P.setGuides([gOld]);
  P.setCur(0);
  getElem('keyword').value = '면도기';
  getElem('guide').value = '초슬림';
  fireInput('keyword');
  if (getElem('guide').value !== '면도기') throw new Error('Test 47 키워드를 고쳐도 짧은 상품명이 안 바뀜: ' + getElem('guide').value);
  const roomOld = P.makeRoom('11.21', '5');
  if (/초슬림/.test(roomOld)) throw new Error('Test 47 키워드를 고쳐도 방제에 초슬림이 남음: ' + roomOld);
  if (!/면도기/.test(roomOld)) throw new Error('Test 47 방제에 면도기가 없음: ' + roomOld);
  const listOld = String(getElem('o-list').value || getElem('o-list').textContent || '');
  if (/초슬림/.test(listOld)) throw new Error('Test 47 명단 제목에 초슬림이 남음: ' + listOld);
  if (!/면도기/.test(listOld)) throw new Error('Test 47 명단 제목에 면도기가 없음: ' + listOld);

  // ④ 짧은 상품명(#guide)을 직접 고친 경우는 키워드를 바꿔도 그 이름 그대로
  getElem('guide').value = '내가정한이름';
  fireInput('guide');
  getElem('keyword').value = '면도날';
  fireInput('keyword');
  if (getElem('guide').value !== '내가정한이름') throw new Error('Test 47 직접 고친 짧은 상품명이 덮어써짐: ' + getElem('guide').value);

  console.log('✓ #104 품목명 면도기·초슬림 수식어 제외·키워드 고치면 방제/명단 제목도 같이 시험 통과');
}


// ==========================================
// Test 48: v208 — 사전 한 곳(ori/kw_dict.json)·규칙(음식·꼬리·무선이어폰)·고친 키워드 기억 (11/21)
// ==========================================
{
  console.log('-- Test 48: 사전 통합·키워드 규칙(음식/무선이어폰/꼬리)·고친 키워드 기억');
  const fs2 = require('fs');
  const { execFileSync } = require('child_process');

  // ① 사전은 한 곳에서 — 어긋나면 'sync_kw.js --check'가 실패
  try {
    execFileSync(process.execPath, [path.resolve(__dirname, '../tools/sync_kw.js'), '--check'], { stdio: 'pipe' });
  } catch (e) {
    throw new Error('사전이 어긋났어요 (node ori/tools/sync_kw.js 로 맞추세요): ' + String((e.stdout || '') + (e.stderr || '')).slice(0, 400));
  }
  console.log('  ✓ sync_kw.js --check 통과 (사전 21곳 일치)');

  // ② 음식 오탐 방지 — 한 글자 접두(고·무·초·저)를 수식어로 보고 잘라내지 않음
  [['꿀 고구마 3kg 세척고구마', '고구마'], ['무말랭이 1kg 국산 무말랭이', '무말랭이'],
   ['수제 초콜릿 선물세트', '초콜릿'], ['저당 요구르트 12개입', '요구르트']].forEach(([nm, want]) => {
    const m = P.suggestKeywords(nm, []).main;
    if (m !== want) throw new Error('Test 48 음식 키워드가 틀림 (' + nm + ' → ' + JSON.stringify(m) + ', 기대 ' + want + ')');
    const k = P.sugKw(nm);
    if (k.some(x => x === '무' || x === '초' || x === '고' || x === '저')) throw new Error('Test 48 한 글자 접두가 키워드로 남음: ' + JSON.stringify(k));
  });
  console.log('  ✓ 고구마·무말랭이·초콜릿·저당 — 품목 명사가 키워드(한 글자 접두 안 잘림)');

  // ③ 무선이어폰 — 사전 품목(이어폰) 접미 일치로 잡고 키워드는 붙은 그대로
  const ie = P.suggestKeywords('무선이어폰 블루투스 5.3 노이즈캔슬링', []);
  if (ie.main !== '무선이어폰') throw new Error('Test 48 무선이어폰 대표 키워드: ' + JSON.stringify(ie.main));
  if (!P.sugKw('무선이어폰 블루투스 5.3 노이즈캔슬링').some(k => /무선이어폰/.test(k))) throw new Error('Test 48 무선이어폰 추천에 무선이어폰이 없음');
  if (P.suggestKeywords('무선 이어폰 케이스', []).main !== '이어폰') throw new Error('Test 48 띄어 쓴 무선 이어폰: ' + P.suggestKeywords('무선 이어폰 케이스', []).main);
  console.log('  ✓ 무선이어폰 → 무선이어폰(붙은 그대로) · 무선 이어폰 → 이어폰');

  // ④ 꼬리 단어(남성·방수·미니)만 남으면 키워드를 지어내지 않음
  const tailOnly = P.suggestKeywords('남성 방수 미니', []);
  if (tailOnly.main) throw new Error('Test 48 꼬리 단어가 대표 키워드로 남음: ' + JSON.stringify(tailOnly.main));
  if (P.sugKw('남성 방수 미니').length) throw new Error('Test 48 꼬리 단어 추천이 남음: ' + JSON.stringify(P.sugKw('남성 방수 미니')));
  // 꼬리·규격이 붙어 있어도 그 앞 핵심 명사를 잡음
  const withTail = P.suggestKeywords('츄리샤 휴대용 초슬림 전동 면도기 전기 면도기 USB충전식 방수 남성 미니', []);
  if (withTail.main !== '면도기') throw new Error('Test 48 꼬리 붙은 상품명 대표 키워드: ' + JSON.stringify(withTail.main));
  console.log('  ✓ 꼬리(남성·방수·미니)만 있으면 빈 키워드 · 꼬리가 붙어도 그 앞 품목(면도기)');

  // ⑤ 고친 키워드 기억 — (상품번호·판매처·원래 상품명 → 고친 키워드)를 남기고, 같은 상품이 다시 오면 그대로
  const PNO = '9911223344';
  const PNAME = '[츄리샤] 휴대용 초슬림 전동 면도기 전기 면도기 USB충전식 방수 남성 미니';
  LS.removeItem(P.KW_MEM_KEY);
  if (P.kwMemFind({ pno: PNO, pname: PNAME })) throw new Error('Test 48 처음인데 기억이 있음');
  // ㉠ 상품명만 넣어 자동 키워드가 붙은 뒤, 수진 님이 #keyword 를 직접 고침
  ['keyword', 'guide', 'seller', 'pname', 'pno', 'o-room', 'o-list'].forEach(k => { getElem(k).value = ''; getElem(k).textContent = ''; });
  P.setGuides([{ pname: PNAME, keyword: '', guide: '', pno: PNO, seller: '실버반석', daily: '5', total: '5', days: [{ n: '5' }], platform: '쿠팡', url: '', kwAuto: true }]);
  P.setCur(0);
  getElem('pname').value = PNAME;
  getElem('pno').value = PNO;
  getElem('seller').value = '실버반석';
  fireInput('pname');
  if (getElem('keyword').value !== '면도기') throw new Error('Test 48 자동 키워드가 면도기가 아님: ' + getElem('keyword').value);
  getElem('keyword').value = '전동면도기';
  fireInput('keyword');
  const memRaw = JSON.parse(LS.getItem(P.KW_MEM_KEY) || '{}');
  if (!memRaw['p' + PNO] || memRaw['p' + PNO].kw !== '전동면도기') throw new Error('Test 48 고친 키워드가 기억에 없음: ' + JSON.stringify(memRaw));
  if (memRaw['p' + PNO].seller !== '실버반석' || !/츄리샤/.test(memRaw['p' + PNO].pname)) throw new Error('Test 48 기억에 판매처·원래 상품명이 없음: ' + JSON.stringify(memRaw['p' + PNO]));
  console.log('  ✓ #keyword 를 고치면 (상품번호·판매처·원래 상품명 → 고친 키워드)가 저장');

  // ㉡ 같은 상품번호가 다시 들어오면 자동 추천 대신 기억한 키워드
  ['keyword', 'guide', 'seller', 'pname', 'pno'].forEach(k => { getElem(k).value = ''; });
  P.setGuides([{ pname: PNAME, keyword: '', guide: '', pno: PNO, seller: '실버반석', daily: '5', total: '5', days: [{ n: '5' }], platform: '쿠팡', url: '', kwAuto: true }]);
  P.setCur(0);
  getElem('pname').value = PNAME;
  getElem('pno').value = PNO;
  getElem('seller').value = '실버반석';
  fireInput('pname');
  if (getElem('keyword').value !== '전동면도기') throw new Error('Test 48 같은 상품인데 기억한 키워드가 안 쓰임: ' + getElem('keyword').value);
  if (getElem('guide').value !== '전동면도기') throw new Error('Test 48 기억한 키워드로 짧은 상품명이 안 바뀜: ' + getElem('guide').value);
  console.log('  ✓ 같은 상품번호가 다시 오면 기억한 키워드(전동면도기)를 그대로');

  // ㉢ 상품번호가 없으면 같은 상품명으로 기억
  LS.removeItem(P.KW_MEM_KEY);
  P.kwMemSave({ pname: '바나바스토어 저주파 마사지기', seller: '바나바' }, '발마사지기');
  P.setGuides([{ pname: '바나바스토어 저주파 마사지기', keyword: '', guide: '', seller: '', pno: '', daily: '3', total: '3', days: [{ n: '3' }], platform: '쿠팡', url: '', kwAuto: true }]);
  P.setCur(0);
  getElem('pno').value = ''; getElem('keyword').value = ''; getElem('guide').value = '';
  getElem('pname').value = '바나바스토어 저주파 마사지기';
  fireInput('pname');
  if (getElem('keyword').value !== '발마사지기') throw new Error('Test 48 상품번호 없이 상품명으로 기억이 안 됨: ' + getElem('keyword').value);
  console.log('  ✓ 상품번호가 없으면 같은 상품명으로 기억');

  // ㉣ 의뢰서가 준 키워드(1번)가 있으면 기억보다 의뢰서가 먼저
  P.setGuides([{ pname: PNAME, keyword: '면도날', guide: '면도날', pno: PNO, seller: '실버반석', daily: '5', total: '5', days: [{ n: '5' }], platform: '쿠팡', url: '', kwAuto: false }]);
  P.setCur(0);
  getElem('keyword').value = '면도날';
  getElem('pname').value = PNAME;
  getElem('pno').value = PNO;
  fireInput('pname');
  if (getElem('keyword').value !== '면도날') throw new Error('Test 48 의뢰서 키워드를 기억이 덮어씀: ' + getElem('keyword').value);
  console.log('  ✓ 의뢰서 1번 키워드가 있으면 그게 먼저 (기억이 덮지 않음)');

  // ⑥ [새 진행 만들기]로 보낼 값 — pname(짧은 상품명)·kwfix(고친 기록)
  P.kwMemSave({ pno: PNO, pname: PNAME, seller: '실버반석' }, '전동면도기');
  P.setGuides([{ pname: PNAME, keyword: '전동면도기', guide: '전동면도기', pno: PNO, seller: '실버반석', daily: '5', total: '5', days: [{ n: '5' }], platform: '쿠팡', url: '' }]);
  P.setCur(0);
  getElem('o-room').value = '#택11.21 실 실버반석 면도기 5';
  getElem('keyword').value = '전동면도기';
  getElem('guide').value = '전동면도기';
  P.render();
  const href = getElem('make-run').href || '';
  if (!/[?&]pname=/.test(href)) throw new Error('Test 48 새 진행 만들기 주소에 pname 이 없음');
  if (!/pname=[^&]*%EC%A0%84%EB%8F%99%EB%A9%B4%EB%8F%84%EA%B8%B0/.test(href)) throw new Error('Test 48 pname 값이 짧은 상품명이 아님: ' + href.slice(0, 200));
  const kwfix = decodeURIComponent(((href.match(/[?&]kwfix=([^&]*)/) || [])[1] || ''));
  if (!/전동면도기/.test(kwfix) || !new RegExp(PNO).test(kwfix)) throw new Error('Test 48 kwfix 규격이 틀림: ' + kwfix);
  const kf = JSON.parse(kwfix)[0];
  if (!('pno' in kf) || !('seller' in kf) || !('pname' in kf) || !('kw' in kf)) throw new Error('Test 48 kwfix 항목 규격(pno·seller·pname·kw): ' + kwfix);
  console.log('  ✓ 새 진행 만들기에 pname·kwfix(pno·seller·pname·kw)를 함께 보냄');

  // ⑦ 사전 파일이 비어 있지 않고, 확장·북마크도 같은 사전을 쓰는지 (한 곳에서 관리)
  const dict = JSON.parse(fs2.readFileSync(path.resolve(__dirname, '../kw_dict.json'), 'utf8'));
  ['nouns', 'modifiers', 'tails', 'colors'].forEach(k => { if (!Array.isArray(dict[k]) || !dict[k].length) throw new Error('Test 48 kw_dict.json 에 ' + k + ' 가 없음'); });
  if (dict.nouns.indexOf('면도기') < 0 || dict.modifiers.indexOf('초슬림') < 0 || dict.modifiers.indexOf('무타공') < 0) throw new Error('Test 48 v207(면도기·초슬림)·확장(무타공) 단어가 한 사전에 없음');
  console.log('  ✓ 사전(nouns ' + dict.nouns.length + '·수식어 ' + dict.modifiers.length + '·꼬리 ' + dict.tails.length + '·색 ' + dict.colors.length + ')에 생성기·확장 단어가 모두 있음');

  console.log('✓ v208 사전 통합·규칙(음식/무선이어폰/꼬리)·고친 키워드 기억 시험 통과');
}

console.log('✓ 모든 가이드 생성기 파서 단위 시험 통과 (42개 샘플 전원 일치)');
process.exit(0);



