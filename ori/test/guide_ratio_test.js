// 생성기: '포토리뷰와 텍스트 리뷰 비율은 6:4' 문장이 포토제공 '유'를 덮어쓰지 않고, 총 30건이면 유 18개·무 12개로 (11/2 데이디 미니사과)
const src = require('fs').readFileSync(__dirname + '/guide_parser_test.js', 'utf8');
const pre = src.slice(0, src.indexOf('// Test 1'));
eval(pre + '\nglobalThis.__P = P; globalThis.__S = sandbox;');
const P = globalThis.__P;
const req = `#입금대행 택대 10500

1. 검색 키워드(미노출시 저희가 키워드땁니다): 미니사과
2. 키워드 검색 시 현재 순위 : '미니사과'라고 검색 시 하위권 노출
3. 총 구매 건수 : 30건
4. 일 진행 건수 : 30건
5. 상품주소(URL) : https://www.coupang.com/vp/products/9800791446
6. 구매옵션 : 1kg x 1박스
7. 포토제공 유 무  : 유
8. 리뷰내용 가이드 : 자율작성 요청
9. 입금하실 입금자명 : 박영찬
10.택배대행 Y/N: Y


포토리뷰와 텍스트 리뷰 비율은 6:4정도로 부탁 드립니다.`;
const r = P.parseAll(req);
const g = (r.guides || [r])[0];
const ok = g.photo === '유 18개, 무 12개' && g.review === '자율작성 요청';
console.log(ok ? '✓ 포토:텍스트 비율 의뢰서 시험 통과 (' + g.photo + ')' : 'XX 비율 의뢰서 시험 실패: ' + JSON.stringify({ photo: g.photo, review: g.review }));
process.exit(ok ? 0 : 1);
