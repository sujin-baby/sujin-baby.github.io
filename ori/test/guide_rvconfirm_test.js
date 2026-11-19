// guide_parser_test.js: 가이드 생성기(guide/index.html) 의뢰서 파서 단위 시험
// 실제 의뢰서 샘플들을 돌려 방제, 키워드, 포토/텍스트 분할, 옵션, 일차별 배정이 올바르게 파싱되는지 검증
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// (setup copied from guide_parser_test.js)

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
// ==========================================
// (11/19 수진 님) 폼 만들기 전 '리뷰 구성 확인': 의뢰서에서 읽은 포토대기·포토리뷰·텍스트·별점 개수 + 경고 + 고친 값이 관리 시트 리뷰 정보로
// ==========================================
const fails = [], ok = (c, m) => { if (!c) fails.push(m); };
const G = (o) => Object.assign({ guide: '', keyword: '', total: 10, daily: 5, photo: '', review: '', days: [] }, o);
// 1) 기본값: 포토 '유'(포토대기) → 포토대기 = 총건수
P.setGuides([G({ keyword: '사과', total: 10, photo: '유' })]);
let d = P.rvDefaults(G({ keyword: '사과', total: 10, photo: '유' }));
ok(d.w === 10 && d.p === 0 && d.t === 0, '포토 유 → 포토대기 10 ' + JSON.stringify(d));
// 2) 리뷰 종류가 나뉜 의뢰서 → 그 개수
d = P.rvDefaults(G({ total: 15, review: '포토리뷰 5개 / 별점만 10개' }));
ok(d.p === 5 && d.s === 10 && d.w === 0, '포토리뷰 5·별점 10 ' + JSON.stringify(d));
// 3) 아무 말 없으면 텍스트 = 총건수, 경고 없음
const g3 = G({ keyword: '귤', total: 8 });
P.setGuides([g3]);
d = P.rvDefaults(g3);
ok(d.t === 8 && P.rvIssues().length === 0 && P.reviewKind() === 'text', '텍스트 8·경고 없음 ' + JSON.stringify(d) + ' ' + JSON.stringify(P.rvIssues()));
// 4) 의뢰서 리뷰 칸에 '사진'이 있는데 텍스트로 읽힌 경우를 사람이 고치지 않으면 경고 / 합계 ≠ 총건수 경고
const g4 = G({ keyword: '사과감귤', total: 20, review: '사진 첨부 부탁드려요' });
P.setGuides([g4]);
ok(P.rvDefaults(g4).p === 20, '사진 → 포토리뷰 20');
g4.rvSet = { w: 0, p: 0, t: 20, s: 0 }; g4.rvEdited = true;
ok(P.rvIssues().some(x => /포토가 있는데/.test(x)), '포토 0 경고 ' + JSON.stringify(P.rvIssues()));
g4.rvSet = { w: 5, p: 0, t: 10, s: 0 };
ok(P.rvIssues().some(x => /개수 합 15개 ≠ 총건수 20건/.test(x)), '합계 경고 ' + JSON.stringify(P.rvIssues()));
// 5) 고친 값 → 관리 시트 리뷰 정보: 포토대기 5 + 텍스트 15 → kind mix, mix 글에 포토대기 (관리 시트 포토전달 탭이 잡음), 진행목록 포토 유
g4.rvSet = { w: 5, p: 0, t: 15, s: 0 };
ok(P.rvIssues().length === 0, '맞으면 경고 없음 ' + JSON.stringify(P.rvIssues()));
ok(P.reviewKind() === 'mix' && P.reviewTotals() === '포토대기 5, 텍스트리뷰 15' && P.photoWait(g4) === true, '포토대기 5·텍스트 15 → mix ' + P.reviewKind() + ' / ' + P.reviewTotals());
ok(JSON.stringify(P.reviewMix(g4)) === JSON.stringify([{ label: '포토대기', n: 5 }, { label: '텍스트리뷰', n: 15 }]), '공지 배분도 고친 값 ' + JSON.stringify(P.reviewMix(g4)));
// 6) 전부 포토대기로 고치면 kind photo
g4.rvSet = { w: 20, p: 0, t: 0, s: 0 };
ok(P.reviewKind() === 'photo' && P.reviewTotals() === '포토대기 20', '전부 포토대기 → photo ' + P.reviewKind() + ' / ' + P.reviewTotals());
// 7) 여러 상품: 한 상품만 고쳐도 상품마다 이름 붙여 보냄
const a = G({ guide: '쿠팡', keyword: '젊음크림', total: 10 }), b = G({ guide: '네이버', keyword: '젊음크림', total: 10 });
P.setGuides([a, b]);
a.rvSet = { w: 10, p: 0, t: 0, s: 0 }; a.rvEdited = true;
ok(P.reviewKind() === 'mix' && P.reviewTotals() === '쿠팡 : 포토대기 10 / 네이버 : 텍스트리뷰 10', '상품마다 ' + P.reviewTotals());
// 8) 안 고치면 예전과 똑같이 (기존 계산 그대로)
const c0 = G({ keyword: '배', total: 10, review: '포토리뷰 5개 / 별점만 5개' });
P.setGuides([c0]);
ok(JSON.stringify(P.reviewMix(c0).map(x => x.label + x.n)) === JSON.stringify(['포토리뷰5', '별점만5']), '안 고치면 원래 그대로 ' + JSON.stringify(P.reviewMix(c0)));
console.log(fails.length ? 'XX 리뷰 구성 확인 시험 실패:\n- ' + fails.join('\n- ') : '✓ 생성기 리뷰 구성 확인 시험 통과');
process.exit(fails.length ? 1 : 0);
