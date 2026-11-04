// 쿠팡 (확장 1.8.0, 11/1): 금요일(1.5.0) 방식 그대로 + 쿠팡 차단 화면이면 새로고침·재시도 없이 바로 멈춤.
//  10/31~11/1 막힘은 대봉감 상품 주소 하나를 너무 많이 열어서(차단 시 새로고침 재시도 등) 그 주소만 막힌 것 — 다른 상품은 열림(사용자 확인).
//  + 쿠팡 검색 화면에서 아이콘을 누르면 그 화면만 읽어 위치 (자동 위치를 못 찾았을 때 손으로).  node coupang_here_test.js
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..', '..');
const bg = fs.readFileSync(path.join(root, 'ori/ext/bg.js'), 'utf8');
const pg = fs.readFileSync(path.join(root, 'ori/ext/page.js'), 'utf8');
const gen = fs.readFileSync(path.join(root, 'guide/index.html'), 'utf8');
let fail = 0;
const ok = (c, t) => { if (!c) fail++; console.log((c ? '✓ ' : '✗ ') + t); };
function fnSrc(s, head) {
  const a = s.indexOf(head); if (a < 0) throw new Error('못 찾음: ' + head);
  let i = s.indexOf('{', a), d = 0;
  for (; i < s.length; i++) { if (s[i] === '{') d++; else if (s[i] === '}' && --d === 0) return s.slice(a, i + 1); }
  throw new Error('짝 안 맞음: ' + head);
}

// 1) 차단 화면이면 바로 멈춤 (새로고침·재시도·다시 열기 없음)
ok(!/tabs\.reload/.test(bg), 'bg.js에 새로고침(tabs.reload) 없음 (1.5.1~1.5.8 차단 시 새로고침 재시도가 같은 주소를 반복해서 엶)');
ok(/const HARD_BLOCK = [^\n]*사용권한이\\s\*없/.test(bg), "검색 창: '사용권한이 없습니다'면 기다리거나 다시 열지 않고 바로 멈춤(HARD_BLOCK)");
ok(/if \(HARD_BLOCK\.test\(work\.blockSnip \|\| ""\)\) return false;/.test(fnSrc(bg, 'async function waitHuman(')), 'waitHuman: HARD_BLOCK이면 바로 false');
const runSrc = fnSrc(bg, 'async function run(');
ok(runSrc.indexOf('if (info.err)') > 0 && runSrc.indexOf('if (info.err)') < runSrc.indexOf('openWork('), 'run(): 상품 화면이 차단(readProduct err)이면 검색 창을 열기 전에 멈춤');
ok(/if \(\/사용권한이\\s\*없/.test(pg), "page.js: 쿠팡 차단 화면은 상품 정보로 안 씀 (err)");
ok(/\(\/\^https:\\\/\\\/\(www\|m\)\\\.coupang\\\.com\\\/\(np\|nm\)\\\/search\/\.test\(tab\.url \|\| ""\)\) return coupangHere\(tab\)/.test(runSrc), 'run(): 쿠팡 검색 화면에서 아이콘 → 그 화면만 읽기');
ok(!/tabs\.create|tabs\.update\([^)]*url|nav\(|clickPage|reload/.test(fnSrc(bg, 'async function coupangHere(')), 'coupangHere: 화면을 넘기거나 새로 열지 않음');

// 2) 위치 글자
const ctx = {}; vm.createContext(ctx);
vm.runInContext(bg.match(/^const gageom = .*$/m)[0] + '\n' + fnSrc(bg, 'function cpPos(') + '\nthis.cpPos = cpPos;', ctx);
const P1 = ctx.cpPos({ page: 1, lo: 9800, hi: 9800 }, { hit: 0, org: 1 }, false);
ok(P1.line === 'PC 위치 : 1p' && P1.filt === '가검9800', 'PC 1페이지 + 가격 9800 → "PC 위치 : 1p", 가검9800');
const M = ctx.cpPos({ page: 1 }, { hit: 50, org: 40 }, true);
ok(M.line === '모바일 위치 : 2p', '모바일: 광고 뺀 40번째 → 2p');

// 3) page.js here(): 쿠팡 주소의 q·page·minPrice·maxPrice
function here(url, body, naver) {
  const c = { URL, Number, String, location: { href: url, hostname: new URL(url).hostname },
    document: { querySelector: () => null, querySelectorAll: () => [], body: { innerText: body } } };
  vm.createContext(c);
  vm.runInContext('const isNaver = ' + !!naver + '; const numOf = s => Number(String(s || "").replace(/[^0-9]/g, "")) || 0;\n' + fnSrc(pg, 'function here(') + '\nthis.r = here();', c);
  return c.r;
}
const h1 = here('https://www.coupang.com/np/search?q=%EB%8C%80%EB%B4%89%EA%B0%90&channel=user&isPriceRange=true&minPrice=9800&maxPrice=9800&page=2', '9,800원~12,800원');
ok(h1.query === '대봉감' && h1.page === 2 && h1.lo === 9800, '쿠팡 검색 주소 → 대봉감, 2페이지, 가격 9800');
const h2 = here('https://www.coupang.com/np/search?q=abc', '상품 9,800원 ~ 12,800원');
ok(h2.lo === 0 && h2.page === 1, '쿠팡: 상품 칸 가격 범위를 필터로 안 읽음');
const h3 = here('https://search.shopping.naver.com/search/all?query=abc&pagingIndex=3', '가격 9,800원 ~ 9,800원', true);
ok(h3.query === 'abc' && h3.page === 3 && h3.lo === 9800, '네이버는 그대로');

// 4) 생성기: 단추는 예전처럼 [상품 페이지 열기] [자동 가져오기]만, 차단이면 한 번에 가져오기 멈춤, 판매처 첫 단어 안 채움
ok(!/pl-cp|cpSearchUrl|batchGesture|window\.open\(a\.href/.test(gen), '생성기: [쿠팡에서 검색]·▶다음 단추·생성기가 쿠팡 여는 코드 없음 (예전 단추만)');
ok(/\/차단\|사용권한\/\.test\(m\.status\)\) \{ batchStop = true; batchBlocked = true;/.test(gen), '한 번에 가져오기: 쿠팡 차단이면 멈춤');
ok(!/r\.seller = bCand/.test(gen), '생성기: 판매처를 상품명 첫 단어로 안 채움');

// 5) 확장 버전: 생성기 EXT_VER = manifest 버전 (확장을 고치면 같이 올려야 예전 확장 경고가 맞게 뜸), 예전 확장이면 안 보내고 알림 (11/3)
const man = JSON.parse(fs.readFileSync(path.join(root, 'ori/ext/manifest.json'), 'utf8'));
const ev = (gen.match(/const EXT_VER = "([\d.]+)"/) || [])[1];
ok(ev === man.version, '생성기 EXT_VER(' + ev + ') = 확장 manifest 버전(' + man.version + ') — 확장을 고치면 EXT_VER도 같이');
{
  const c = { document: { documentElement: { getAttribute: () => c.__v } }, EXT_VER: ev }; vm.createContext(c);
  vm.runInContext('const EXT_VER = "' + ev + '";\n' + fnSrc(gen, 'function extOld(') + '\nthis.extOld = extOld;', c);
  c.__v = '1.7.0'; const o1 = c.extOld(); c.__v = ev; const o2 = c.extOld(); c.__v = null; const o3 = c.extOld(); c.__v = '9.0.0'; const o4 = c.extOld();
  ok(o1 === '1.7.0' && o2 === '' && o3 === '' && o4 === '', '예전 확장(1.7.0)만 경고, 같거나 새 버전·확장 없음은 경고 안 함');
}
ok(/const ov = extOld\(\); if \(ov\) \{ batchSay\(extOldSay\(ov\), true\); return; \}/.test(gen) && /if \(ov\) \{ extOldSay\(ov\); return; \} autoIdx/.test(gen), '예전 확장이면 [한 번에 가져오기]·[자동 가져오기]를 안 보내고 알림');
ok(/\/생성기를\\s\*새로고침\/\.test\(m\.status\)\) \{ batchStop = true;/.test(gen), "예전 확장이 '생성기를 새로고침'만 하면 한 번에 가져오기 바로 멈춤 (4분씩 안 기다림)");

if (fail) { console.error(fail + '개 실패'); process.exit(1); }
console.log('✓ 쿠팡 시험 통과');
