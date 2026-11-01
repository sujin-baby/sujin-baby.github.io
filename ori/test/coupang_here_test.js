// 쿠팡 '지금 화면만 읽기' (확장 1.6.0, 11/1): 확장이 쿠팡 검색 화면을 혼자 열면 쿠팡이 막아서(금요일 코드도 11/1 'Access Denied'),
//  상품 정보만 자동 → 검색은 사람이 생성기 [쿠팡에서 검색]으로 열고 → 그 화면에서 아이콘을 누르면 위치.  node coupang_here_test.js
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..', '..');
const bg = fs.readFileSync(path.join(root, 'ori/ext/bg.js'), 'utf8');
const pg = fs.readFileSync(path.join(root, 'ori/ext/page.js'), 'utf8');
const gen = fs.readFileSync(path.join(root, 'guide/index.html'), 'utf8');
const man = JSON.parse(fs.readFileSync(path.join(root, 'ori/ext/manifest.json'), 'utf8'));
let fail = 0;
const ok = (c, t) => { if (!c) fail++; console.log((c ? '✓ ' : '✗ ') + t); };
// 함수 하나 꺼내기 (중괄호 짝 맞춰서)
function fnSrc(s, head) {
  const a = s.indexOf(head); if (a < 0) throw new Error('못 찾음: ' + head);
  let i = s.indexOf('{', a), d = 0;
  for (; i < s.length; i++) { if (s[i] === '{') d++; else if (s[i] === '}' && --d === 0) return s.slice(a, i + 1); }
  throw new Error('짝 안 맞음: ' + head);
}

// 1) 쿠팡 자동 검색이 없어야 함: 상품 화면·검색 화면 함수가 쿠팡 주소를 열거나 넘기지 않음, 개발자 도구 연결 없음
const cpProd = fnSrc(bg, 'async function coupangProduct('), cpHere = fnSrc(bg, 'async function coupangHere(');
const NAV = /tabs\.create|tabs\.update\([^)]*url|openWork\(|nav\(|searchDev\(|clickPage|priceUI|windows\.create|tabs\.reload/;
ok(!NAV.test(cpProd), '상품 화면(coupangProduct)은 다른 쿠팡 화면을 안 엶');
ok(!NAV.test(cpHere), '검색 화면(coupangHere)은 화면을 안 넘기고 안 엶');
ok(!/chrome\.debugger\./.test(bg), 'bg.js에 chrome.debugger(개발자 도구 연결) 없음');
ok((man.permissions || []).indexOf('debugger') === -1, 'manifest에 debugger 권한 없음');
const runSrc = fnSrc(bg, 'async function run(');
ok(/site === "coupang"\) return coupangProduct\(/.test(runSrc) && runSrc.indexOf('coupangProduct(') < runSrc.indexOf('openWork('), 'run(): 쿠팡 상품은 자동 검색 전에 coupangProduct로 끝남');
ok(/coupang\\\.com\\\/\(np\|nm\)\\\/search\/\.test\(tab\.url \|\| ""\)\) return coupangHere\(tab\)/.test(runSrc), 'run(): 쿠팡 검색 화면이면 coupangHere');

// 2) 위치 글자
const ctx = {}; vm.createContext(ctx);
vm.runInContext(bg.match(/^const gageom = .*$/m)[0] + '\n' + fnSrc(bg, 'function cpPos(') + '\nthis.cpPos = cpPos;', ctx);
const P1 = ctx.cpPos({ page: 1, lo: 9800, hi: 9800 }, { hit: 0, org: 1 }, false);
ok(P1.line === 'PC 위치 : 1p' && P1.filt === '가검9800', 'PC 1페이지 + 가격 9800 → "PC 위치 : 1p", 필터 가검9800 (' + P1.line + ' / ' + P1.filt + ')');
const P3 = ctx.cpPos({ page: 3, lo: 0, hi: 0 }, { hit: 5, org: 4 }, false);
ok(P3.line === 'PC 위치 : 3p' && P3.filt === '', 'PC 3페이지(주소 page=3), 필터 없음');
const M = ctx.cpPos({ page: 1 }, { hit: 50, org: 40 }, true);
ok(M.line === '모바일 위치 : 2p', '모바일: 광고 뺀 40번째 → 2p (' + M.line + ')');
const P0 = ctx.cpPos({ page: 0, lo: 8800, hi: 10800 }, { hit: 0, org: 1 }, false);
ok(P0.line === 'PC 위치 : 1p' && P0.filt === '가검8800~10800', '페이지 모르면 1p, 가격 범위 가검8800~10800');

// 3) page.js here(): 쿠팡 주소의 q·page·minPrice·maxPrice, 상품 칸 가격('9,800원~12,800원')은 필터로 안 읽음
function here(url, body, naver) {
  const c = { URL, Number, String, location: { href: url, hostname: new URL(url).hostname },
    document: { querySelector: () => null, querySelectorAll: () => [], body: { innerText: body } } };
  vm.createContext(c);
  vm.runInContext('const isNaver = ' + !!naver + '; const numOf = s => Number(String(s || "").replace(/[^0-9]/g, "")) || 0;\n' + fnSrc(pg, 'function here(') + '\nthis.r = here();', c);
  return c.r;
}
const h1 = here('https://www.coupang.com/np/search?q=%EB%8C%80%EB%B4%89%EA%B0%90&channel=user&isPriceRange=true&minPrice=9800&maxPrice=9800&page=2', '가을제철 햇감 9,800원~12,800원');
ok(h1.query === '대봉감' && h1.page === 2 && h1.lo === 9800 && h1.hi === 9800, '쿠팡 검색 주소 → 검색어 대봉감, 2페이지, 가격 9800 (' + JSON.stringify(h1) + ')');
const h2 = here('https://www.coupang.com/np/search?q=abc&channel=user', '상품 9,800원 ~ 12,800원');
ok(h2.lo === 0 && h2.hi === 0 && h2.page === 1, '쿠팡: 상품 칸 가격 범위를 필터로 안 읽음, page 없으면 1');
const h3 = here('https://search.shopping.naver.com/search/all?query=abc&pagingIndex=3', '가격 9,800원 ~ 9,800원', true);
ok(h3.query === 'abc' && h3.page === 3 && h3.lo === 9800, '네이버는 그대로 (query, pagingIndex, 화면 가격 필터)');

// 4) 생성기 검색 링크
const g = { lines: s => String(s || '').split('\n').map(x => x.trim()).filter(Boolean), v: () => '쿠팡 : 9796919905 - 2933***1008' };
vm.createContext(g);
vm.runInContext(fnSrc(gen, 'function cpSearchUrl(') + '\n' + fnSrc(gen, 'function cpPidOf(') + '\nthis.cpSearchUrl = cpSearchUrl; this.cpPidOf = cpPidOf;', g);
const u0 = g.cpSearchUrl('대봉감', 0, '9796919905');
ok(u0 === 'https://www.coupang.com/np/search?q=%EB%8C%80%EB%B4%89%EA%B0%90&channel=user#kw=%EB%8C%80%EB%B4%89%EA%B0%90&pid=9796919905', '[쿠팡에서 검색] 주소 (# 뒤 kw·pid는 쿠팡에 안 보내짐): ' + u0);
const u1 = g.cpSearchUrl('대봉감', 9800, '');
ok(/&isPriceRange=true&minPrice=9800&maxPrice=9800#kw=/.test(u1) && !/pid=/.test(u1), '[쿠팡 검색 + 가검9800] 주소');
ok(g.cpPidOf('https://link.coupang.com/a/ifs285AXwO', 0) === '9796919905', '단축 링크면 상품번호 칸에서 상품번호');
ok(g.cpPidOf('https://www.coupang.com/vp/products/123456789?itemId=1', 0) === '123456789', '상품 주소면 주소에서');
ok(/\.pl-auto, \.pl-cp/.test(gen) && /className = "btn ghost pl-cp"/.test(gen), '검색 링크는 확장이 있을 때만 보임 (한 번에 가져오기가 세는 .pl-auto와 따로)');
ok(!/r\.seller = bCand/.test(gen), '생성기: 판매처를 상품명 첫 단어로 안 채움');

// 5) 1.7.0: 확장은 쿠팡 탭을 직접 열지 않음 — 생성기가 사람 클릭으로 열고(# 뒤 plt=), 확장은 그 탭만 읽음
const gjs = fs.readFileSync(path.join(root, 'ori/ext/gen.js'), 'utf8');
const ar = fnSrc(bg, 'async function autoRun(');
ok(/coupang\\\.com\/i\.test\(String\(url\)\)\) \{ pushGen/.test(ar) && ar.indexOf('coupang\\.com/i.test') < ar.indexOf('tabs.create'), 'autoRun: 쿠팡 주소면 탭을 열기 전에 멈춤 (예전 생성기에서 눌러도 확장이 쿠팡을 안 엶)');
const ao = fnSrc(bg, 'async function autoOpened(');
ok(!/tabs\.create|tabs\.update\([^)]*url|tabs\.reload|windows\.create/.test(ao), 'autoOpened: 쿠팡 탭을 열거나 새로고침하지 않음 (생성기가 연 탭을 찾아 읽고 닫기만)');
ok(/m\.plt \? autoOpened\(/.test(bg), '생성기가 plt를 보내면 autoOpened');
ok(/plt: j\.plt/.test(gjs), 'gen.js가 plt를 확장에 넘김');
ok(/\(kw\|plt\)=/.test(bg), 'hashOf: # 뒤 plt=도 탭마다 기억');
ok(/window\.open\(a\.href \+ \(a\.href\.indexOf\("#"\) === -1 \? "#" : "&"\) \+ "plt=" \+ plt, "_blank", "noopener"\)/.test(gen) && /if \(cpOpen\) ab\.dataset\.cp = "1"/.test(gen), '생성기 [자동 가져오기]: 쿠팡은 사람 클릭 안에서 생성기가 새 탭으로 엶');
ok(/function batchGesture\(/.test(gen) && /b\.dataset\.cp && !\(navigator\.userActivation && navigator\.userActivation\.isActive\)/.test(gen), '한 번에 가져오기: 쿠팡 상품은 "▶ 다음" 단추 클릭 때 하나씩');
ok(/\/차단\|사용권한\/\.test\(m\.status\)\) \{ batchStop = true; batchBlocked = true;/.test(gen), '한 번에 가져오기: 쿠팡 차단이면 멈춤 (더 열면 더 오래 막힘)');

if (fail) { console.error(fail + '개 실패'); process.exit(1); }
console.log('✓ 쿠팡 지금 화면 시험 통과');
