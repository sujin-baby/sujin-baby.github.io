// ori/tools/build_userscript.js — 아이폰 사파리 자동 실행(Userscripts) 파일 만들기 (v195)
//
//  생성기(guide/index.html)의 북마크 코드 <script id="bm-src"> 하나를 그대로 써서
//  ori/product-helper.user.js 를 만들고, 같은 글자를 생성기 안 <script id="us-src"> 에도 넣습니다.
//  → 상품 정보를 읽는 규칙은 한 곳(bm-src)만 고치고, 이 명령을 다시 돌리면 둘이 맞춰집니다.
//
//  쓰는 법:  node ori/tools/build_userscript.js
//  (ori/test/userscript_test.js 가 어긋남·문법·@match 를 확인합니다)
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const GUIDE = path.join(ROOT, 'guide', 'index.html');
const OUT = path.join(ROOT, 'ori', 'product-helper.user.js');

// 1) 생성기에서 북마크 코드 읽기
let html = fs.readFileSync(GUIDE, 'utf8');
const bmM = html.match(/<script type="text\/plain" id="bm-src">([\s\S]*?)<\/script>/);
if (!bmM) throw new Error('guide/index.html 에서 <script id="bm-src"> 를 못 찾았어요');
const bm = bmM[1];

// 2) 겉포장(async (oriMode) => { … })(); 을 벗겨 함수 본문만 꺼내기
const HEAD = '(async (oriMode) => {';
const TAIL = '})();';
const i = bm.indexOf(HEAD);
if (i < 0) throw new Error('bm-src 첫 줄이 "' + HEAD + '" 가 아니에요 (북마크 코드 겉포장이 바뀌면 이 파일도 고쳐야 해요)');
const j = bm.lastIndexOf(TAIL);
if (j < i) throw new Error('bm-src 끝의 "' + TAIL + '" 를 못 찾았어요');
if (bm.slice(j + TAIL.length).trim()) throw new Error('bm-src 끝에 예상 밖의 코드가 있어요: ' + JSON.stringify(bm.slice(j + TAIL.length).slice(0, 80)));
const body = bm.slice(i + HEAD.length, j).replace(/^\s*\n/, '').replace(/\s+$/, '');

// 3) 유저스크립트가 기대하는 표시가 코드 안에 있는지 (없으면 조용히 깨지므로 여기서 멈춤)
[
  'if (oriMode === "pos") out = out.split',
  'let out = [',
  'const readAllColors =',
  'oriMode === "pos" || oriMode === "info"'
].forEach(s => { if (bm.indexOf(s) < 0) throw new Error('bm-src 에 "' + s + '" 가 없어요'); });

// 4) 유저스크립트 만들기
const header = [
  '// ==UserScript==',
  '// @name         오리 상품정보 도우미',
  '// @namespace    https://sujin-baby.github.io/guide/',
  '// @version      196.0',
  '// @description  쿠팡·네이버·토스·올리브영 화면 오른쪽 아래 단추로 상품 정보를 한 번에 가져와요 (오리방 체험단)',
  '// @author       오리방',
  '// @match        *://*.coupang.com/*',
  '// @match        *://*.naver.com/*',
  '// @match        *://toss.shopping/*',
  '// @match        *://*.oliveyoung.co.kr/*',
  '// @run-at       document-idle',
  '// @grant        none',
  '// @noframes',
  '// ==/UserScript==',
  ''
].join('\n');

const intro = [
  '/*',
  '  오리 상품정보 도우미 (생성기 v196)',
  '  - 생성기(guide/index.html)의 \'상품 위치 찾기\' 북마크 코드(bm-src)를 그대로 담고 있어요.',
  '  - 상품 정보를 읽는 규칙을 고치면  node ori/tools/build_userscript.js  를 다시 돌려',
  '    이 파일과 생성기 안의 스크립트(us-src)를 함께 맞춰 주세요. (안 맞으면 CI가 멈춥니다)',
  '  - 화면 오른쪽 아래 단추:',
  '      📋 상품정보 가져오기  상품명·판매처·상품번호·옵션·가격·위치를 한 번에 읽어 복사',
  '      🔍 위치 찾기          위치 줄(찾은 키워드·필터·PC/모바일 위치)만',
  '*/',
  ''
].join('\n');

const ui = [
  '',
  '  /* 화면 오른쪽 아래 단추 (작고 깔끔하게, 상품 화면을 가리지 않게) */',
  '  function oriBar() {',
  '    if (!document.body) { setTimeout(oriBar, 300); return; }',
  '    if (document.getElementById("ori-helper-bar")) return;',
  '    var bar = document.createElement("div");',
  '    bar.id = "ori-helper-bar";',
  '    var narrow = /iPhone|iPad|Android/i.test(navigator.userAgent) ||',
  '      Math.min(window.innerWidth || 999, (window.screen && window.screen.width) || 999) < 600;',
  '    bar.style.cssText = "position:fixed;right:10px;bottom:" + (narrow ? "calc(96px + env(safe-area-inset-bottom, 0px))" : "16px") +',
  '      ";z-index:2147483646;display:flex;flex-direction:column;align-items:flex-end;gap:6px;" +',
  '      "font-family:-apple-system,BlinkMacSystemFont,\'Apple SD Gothic Neo\',\'Noto Sans KR\',sans-serif;";',
  '    function mk(label, mode, bg) {',
  '      var b = document.createElement("button");',
  '      b.type = "button"; b.textContent = label;',
  '      b.style.cssText = "border:1.5px solid #3a2230;border-radius:999px;padding:9px 13px;font-size:12.5px;font-weight:800;" +',
  '        "line-height:1.2;color:#fff;background:" + bg + ";box-shadow:0 2px 8px rgba(0,0,0,.22);opacity:.92;white-space:nowrap;" +',
  '        "cursor:pointer;-webkit-tap-highlight-color:transparent";',
  '      b.addEventListener("click", function (ev) {',
  '        ev.preventDefault(); ev.stopPropagation();',
  '        var was = b.textContent;',
  '        b.disabled = true; b.textContent = "읽는 중…"; b.style.opacity = ".6";',
  '        Promise.resolve().then(function () { return ORI_RUN(mode); }).catch(function (e) {',
  '          alert("상품 정보를 읽지 못했어요: " + ((e && e.message) || e));',
  '        }).then(function () { b.disabled = false; b.textContent = was; b.style.opacity = ".92"; });',
  '      }, true);',
  '      return b;',
  '    }',
  '    bar.appendChild(mk("📋 상품정보 가져오기", "info", "#5b2a86"));',
  '    bar.appendChild(mk("🔍 위치 찾기", "pos", "#d63384"));',
  '    var h = document.createElement("button");',
  '    h.type = "button"; h.textContent = "×"; h.title = "이 화면에서 단추 치우기";',
  '    h.style.cssText = "border:1px solid #ced4da;background:#fff;color:#868e96;border-radius:999px;width:22px;height:22px;" +',
  '      "font-size:12px;line-height:1;padding:0;cursor:pointer;opacity:.75";',
  '    h.addEventListener("click", function (ev) { ev.preventDefault(); ev.stopPropagation(); bar.remove(); }, true);',
  '    bar.appendChild(h);',
  '    document.body.appendChild(bar);',
  '  }',
  '  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", oriBar); else oriBar();',
  '})();',
  ''
].join('\n');

const wrapperHead = [
  '(function () {',
  '  "use strict";',
  '  if (window.__ORI_HELPER__) return;',
  '  window.__ORI_HELPER__ = "196.0";',
  '',
  '  /* 상품 정보 읽기 = 생성기 북마크 코드 그대로. oriMode: "info" 전체 / "pos" 위치 줄만 */',
  '  async function ORI_RUN(oriMode) {',
  ''
].join('\n');

const us = header + intro + wrapperHead + body + '\n  }\n' + ui;

// 5) 파일로 저장
fs.writeFileSync(OUT, us, 'utf8');

// 6) 생성기 안 us-src 도 같은 글자로 (다운로드·복사가 네트워크 없이 되게)
const tagOpen = '<script type="text/plain" id="us-src">';
const tagRe = /<script type="text\/plain" id="us-src">[\s\S]*?<\/script>/;
if (!tagRe.test(html)) throw new Error('guide/index.html 에 <script id="us-src"> 자리가 없어요');
const clean = us.replace(/<\/script>/gi, '<\\/script>');   // 혹시 모를 조기 종료 방지
html = html.replace(tagRe, () => tagOpen + '\n' + clean + '</script>');
fs.writeFileSync(GUIDE, html, 'utf8');

console.log('✓ ori/product-helper.user.js (' + us.length + '자)');
console.log('✓ guide/index.html us-src 맞춤');
