// userscript_test.js: 생성기 v195 — 아이폰 사파리 자동 실행(Userscripts) 파일과 모바일 편의 UI
//  1) ori/product-helper.user.js 는 생성기 안 us-src·bm-src 와 같은 글자여야 함 (한 곳만 고치고 안 맞추는 일 막기)
//  2) @match 4곳, 유효한 문법, 플로팅 단추 2개(📋 상품정보 가져오기 / 🔍 위치 찾기)
//  3) 모바일에서만 보이는 UI(#m-bar·원터치 붙여넣기)와 PC 화면이 그대로인지(880px 미디어 쿼리)
//  4) open.html 의 [🚀 사파리에서 바로 열기] (rel=noreferrer noopener + #kw= 유지)
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..', '..');
const gen = fs.readFileSync(path.join(root, 'guide', 'index.html'), 'utf8');
const open = fs.readFileSync(path.join(root, 'guide', 'open.html'), 'utf8');
const usFile = fs.readFileSync(path.join(root, 'ori', 'product-helper.user.js'), 'utf8');

let fail = 0;
const ok = (c, t) => { if (!c) fail++; console.log((c ? '✓ ' : '✗ ') + t); };
const pick = id => ((gen.match(new RegExp('<script type="text/plain" id="' + id + '">([\\s\\S]*?)<\\/script>')) || [])[1] || '');

// --- 1) 생성기 안 스크립트와 파일이 같은가
const bm = pick('bm-src'), us = pick('us-src');
ok(!!bm && bm.length > 50000, 'guide/index.html 에 북마크 코드(bm-src)가 있음');
ok(!!us && us.length > 50000, 'guide/index.html 에 유저스크립트(us-src)가 있음 (다운로드·복사용)');
ok(us.trim() === usFile.trim(), 'ori/product-helper.user.js 와 생성기 us-src 가 같은 글자 (node ori/tools/build_userscript.js 로 맞춤)');

// --- 2) bm-src 본문이 유저스크립트 안에 그대로 들어 있는가 (읽기 규칙이 두 벌로 갈라지지 않게)
const HEAD = '(async (oriMode) => {', TAIL = '})();';
const i = bm.indexOf(HEAD), j = bm.lastIndexOf(TAIL);
const body = i >= 0 && j > i ? bm.slice(i + HEAD.length, j).replace(/^\s*\n/, '').replace(/\s+$/, '') : '';
ok(!!body && us.indexOf(body) >= 0, '유저스크립트가 북마크 코드 본문을 그대로 담음 (규칙 한 벌)');

// --- 3) 유저스크립트 자체
let synErr = '';
try { new vm.Script(us, { filename: 'product-helper.user.js' }); } catch (e) { synErr = e.message; }
ok(!synErr, '유저스크립트 문법 통과' + (synErr ? ' — ' + synErr : ''));

// --- 3-1) 단추를 화면에 실제로 붙이는지 (가짜 DOM 으로 유저스크립트를 그대로 실행 — 쿠팡에 접속하지 않음)
{
  const mkEl = tag => ({
    tagName: (tag || 'div').toUpperCase(), id: '', textContent: '', style: {}, dataset: {}, children: [],
    appendChild(c) { this.children.push(c); return c; }, addEventListener() {}, setAttribute() {}, removeAttribute() {}, remove() {},
    getAttribute() { return ''; }, querySelector() { return null; }, querySelectorAll() { return []; }
  });
  const body = mkEl('body');
  const doc = { readyState: 'complete', body, documentElement: mkEl('html'), createElement: mkEl, getElementById: () => null, addEventListener() {}, querySelectorAll: () => [] };
  const ctx = { document: doc, navigator: { userAgent: 'Mozilla/5.0 (iPhone) Safari', clipboard: { writeText: () => Promise.resolve() } },
    location: { href: 'https://www.coupang.com/vp/products/1', hostname: 'www.coupang.com', hash: '', pathname: '/vp/products/1', search: '' },
    alert() {}, setTimeout, clearTimeout, console, Promise, JSON, String, Number, Math, Date, Object, Array, RegExp, Boolean,
    encodeURIComponent, decodeURIComponent, DOMParser: function () {}, URLSearchParams, localStorage: { getItem: () => null, setItem() {} } };
  ctx.window = ctx; ctx.globalThis = ctx; ctx.self = ctx; ctx.screen = { width: 390 };
  let err = '';
  try { vm.createContext(ctx); vm.runInContext(us, ctx, { filename: 'product-helper.user.js(실행)' }); } catch (e) { err = e.message; }
  const bar = body.children.filter(c => c && c.id === 'ori-helper-bar')[0];
  const labels = bar ? bar.children.map(b => b.textContent) : [];
  ok(!err, '유저스크립트 실행 시 오류 없음' + (err ? ' — ' + err : ''));
  ok(!!bar, '화면(body)에 플로팅 단추 상자를 붙임');
  ok(labels.indexOf('📋 상품정보 가져오기') >= 0 && labels.indexOf('🔍 위치 찾기') >= 0, '단추 두 개가 실제로 만들어짐 (' + labels.join(' / ') + ')');
}
['coupang.com', 'naver.com', 'toss.shopping', 'oliveyoung.co.kr'].forEach(h => {
  ok(new RegExp('// @match\\s+\\*://\\*\\.' + h.replace(/\./g, '\\.') + '/\\*|// @match\\s+\\*://' + h.replace(/\./g, '\\.') + '/\\*').test(us), '유저스크립트 @match 에 ' + h);
});
ok(/@grant\s+none/.test(us) && /@noframes/.test(us), '유저스크립트가 @grant none · @noframes');
ok(us.indexOf('📋 상품정보 가져오기') > 0 && us.indexOf('🔍 위치 찾기') > 0, '플로팅 단추 두 개(📋 상품정보 가져오기 / 🔍 위치 찾기)');
ok(/function ORI_RUN\(oriMode\)/.test(us) && /oriBar\(\)/.test(us) && /document\.body\.appendChild\(bar\)/.test(us), '단추를 누르면 ORI_RUN 을 실행하고 화면에 붙임');
ok(us.indexOf('if (oriMode === "pos") out = out.split') > 0, '[🔍 위치 찾기]는 위치 줄만 남김');
ok(us.indexOf('if (oriMode === "pos" || oriMode === "info") { show("", "쿠팡 상품 페이지에서') > 0, '유저스크립트에서는 상품번호 입력 팝업(prompt)을 띄우지 않음');
// 유저스크립트는 줄 단위로 실행되므로 // 주석이 있어도 되지만, 북마크릿(bm-src)은 한 줄로 이어 붙이므로 // 주석 금지 (coupang_here_test 가 확인)

// --- 4) 모바일 편의 UI (v195) — 880px 이하에서만, PC 화면은 그대로
//  버전 숫자를 시험에 박아 두면 다음 버전에서 무조건 빨간불이 된다(plantitle 날짜 하드코딩 교훈, 11/18) → v195 이상인지만 본다
const gver = (gen.match(/생성기 v(\d+)/) || [])[1];
ok(!!gver && Number(gver) >= 195, 'guide/index.html 버전 표기(생성기 v' + (gver || '?') + ')');
ok(/@media \(max-width: 880px\) \{[\s\S]*#m-bar/.test(gen), '#m-bar 는 @media (max-width: 880px) 안에서만 보임');
ok(/\.m-only \{ display: none; \}/.test(gen) && /\.m-only \{ display: block; \}/.test(gen), 'PC에서는 숨고 모바일에서만 보이는 .m-only 규칙');
['parse', 'paste', 'notice', 'make'].forEach(m => {
  ok(new RegExp('data-m="' + m + '"').test(gen), '하단 고정 바 버튼 data-m=' + m);
});
ok(/barOn\("parse", \(\) => \{ \$\("parse"\)\.click\(\);/.test(gen), '하단 바가 기존 단추를 그대로 눌러 줌');
ok(/id="paste-cp-big"[^>]*>📋 결과 바로 붙여넣기</.test(gen) || /📋 결과 바로 붙여넣기/.test(gen), '상품 정보 칸 위 큰 [📋 결과 바로 붙여넣기]');
ok(/📋 의뢰서 붙여넣기 &amp; 분석/.test(gen) && /id="paste-req-btn"/.test(gen), '의뢰서 칸 [📋 붙여넣기 & 분석]');
ok(/navigator\.clipboard\.readText\(\)/.test(gen) && /const pasteCp = \(\) => clipRead/.test(gen) && /const pasteReq = \(\) => clipRead/.test(gen), '클립보드 읽기(navigator.clipboard.readText)로 원터치 붙여넣기');
ok(/body \{ padding-bottom: calc\(76px/.test(gen), '고정 바가 내용을 가리지 않게 본문 아래 여백');
ok(/id="us-dl"/.test(gen) && /id="us-copy"/.test(gen) && /ori-product-helper\.user\.js/.test(gen), '⚙️ 설치 안내 안에 유저스크립트 저장·복사 단추');
ok(/App Store에서 무료 <b>Userscripts<\/b>/.test(gen) && /확장 프로그램<\/b>에서 <b>Userscripts<\/b> 켜기/.test(gen), 'Userscripts 설치 3줄 안내');

// --- 5) open.html: 1탭 열기
ok(/id="open-safari-btn"/.test(open) && /rel="noreferrer noopener"/.test(open), 'open.html 에 [🚀 사파리에서 바로 열기] (noreferrer noopener)');
ok(/openBtn\.href = goTarget/.test(open), 'open.html 이 #kw= 붙은 주소를 단추에 넣음');
ok(/const fullTarget = buildTargetUrl\(cleanTarget, k0, pr, fn\);/.test(open) && /const goTarget = fullTarget \|\| cleanTarget;/.test(open), '해시(#kw=·#pr=·#fn=)를 그대로 유지한 주소로 엶');

if (fail) { console.error(fail + '개 실패'); process.exit(1); }
console.log('✓ 유저스크립트·모바일 UI 시험 통과');
