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
if (gFull.seller !== '아텍스') throw new Error('gFull seller should default to 아텍스 from keyword, got: ' + gFull.seller);
if (gFull.pname !== '아텍스 산리오 캐릭터즈 우사하나 밴드 표준형') throw new Error('gFull pname should default to keyword, got: ' + gFull.pname);
if (gFull.page !== '1p') throw new Error('gFull page should default to 1p, got: ' + gFull.page);
if (gFull.option !== '10개') throw new Error('gFull option should be 10개, got: ' + gFull.option);

// ==========================================
// Test 9: 텀블러 의뢰서 파싱 및 4색상·리뷰·신상품 검증 (10/31)
// 1) 4색상 5개씩 -> 검정·아이보리·연그린·하늘색 자동 분할
// 2) 2개 정도만 사진 나머지는 별점만 -> 포토리뷰 2개 / 텍스트리뷰 3개
// 3) 신상품 순위 -> 1p
// 4) 판매처 바나바스토어 보존
// ==========================================
console.log('-- Test 9: 텀블러 의뢰서 파싱 (4색상 분할, 구어체 리뷰, 신상품 1p, 바나바스토어 보존)');
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
if (gTumblerFull.page !== '1p') throw new Error('gTumblerFull page should be 1p, got: ' + gTumblerFull.page);
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
if (gBag.seller !== '아이누빅') throw new Error('gBag seller should be 아이누빅, got: ' + gBag.seller);

console.log('✓ 모든 가이드 생성기 파서 단위 시험 통과 (11개 샘플 전원 일치)');
process.exit(0);


