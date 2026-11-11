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
    localStorage: { getItem: () => 'test-key', setItem: () => {} },
    navigator: {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
      platform: 'iPhone',
      maxTouchPoints: 5,
      clipboard: { writeText: () => Promise.resolve() }
    }
  },
  prompt: () => 'test-key',
  alert: () => {},
  localStorage: { getItem: () => 'test-key', setItem: () => {} },
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

// 쿠팡 상품명은 옵션 규격 정리 유지
const coupangPname = '홍시용 대봉감, 소과, 3kg, 1박스';
const cpClean = P.baseName(coupangPname, null, { platform: '쿠팡' });
if (cpClean === tossPname) throw new Error('Coupang pname should strip trailing box/kg');

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

console.log('✓ 모든 가이드 생성기 파서 단위 시험 통과 (22개 샘플 전원 일치)');
process.exit(0);



