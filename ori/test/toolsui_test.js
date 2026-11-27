// 11/28 사용자 (진행 도우미 화면)
//  ① '할일 메뉴에서 전체는 빼도 될 듯' → 알약 '전체' 빼고 처음엔 첫 탭(방공지)으로 열기
//  ② '공지 썸네일 오른쪽 여백이 너무 많아 스크롤이 길다' → 썸네일 96px 왼쪽 + 본문(pre) 오른쪽 가로 배치
//  node toolsui_test.js <Main.js>
const H = require('./harness');
const vm = require('vm');
const fails = [], ok = (c, m) => { if (!c) fails.push(m); };
const env = H.makeEnv({ main: process.argv[2] });
const G = k => vm.runInContext(k, env);
const T = G('TOOLS_HTML'), O = G('OUTBOX_HTML');

// ① 알약: '전체' 없음 · 처음엔 첫 탭 · 탭 순서 그대로
ok(T.indexOf("add('', '전체'") < 0, "할 일 알약에 '전체'가 남아 있음");
ok(/todoSub = String\(grp\[0\]\.i\)/.test(T), '처음 열 때 첫 탭으로 안 감');
ok(/grp\.forEach\(function \(g\) \{ add\(g\.i, g\.label/.test(T), '탭 알약 그리기');

// 실제 todoBars() 를 가짜 DOM 으로 돌려서 확인 (첫 알약 = 방공지, 개수 = 탭 수, '전체' 없음)
const shim = () => {
  const mk = tag => {
    const e = {
      tagName: tag, children: [], style: {}, attrs: {}, className: '', _t: '',
      appendChild(c) { this.children.push(c); c.parentNode = this; return c; },
      insertBefore(c, ref) { const i = this.children.indexOf(ref); if (i < 0) this.children.push(c); else this.children.splice(i, 0, c); c.parentNode = this; return c; },
      setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return this.attrs[k]; },
      querySelector() { return mk('x'); }, querySelectorAll() { return []; },
      set innerHTML(v) { this.children = []; }, get innerHTML() { return ''; },
      set textContent(v) { this._t = String(v); this.children = []; }, get textContent() { return this._t; },
    };
    return e;
  };
  const els = { obsub: mk('div'), ob: mk('div'), obcnt: mk('span'), tabob: mk('span') };
  const document = { createElement: mk, createTextNode: t => ({ _t: String(t), nodeType: 3 }), getElementById: i => els[i] || null, querySelectorAll: () => [] };
  return { els, document };
};
const S = shim();
const ctx = { document: S.document, $: i => S.els[i] || null, TODO: { all: [], tabs: [], grp: [], later: 0 }, todoSub: '', console, String, Number, Object, Array };
vm.createContext(ctx);
const body = T.slice(T.indexOf('function todoBars()'), T.indexOf('function statPaint()'));
ok(body.indexOf('function todoBars()') === 0 && body.indexOf('function todoPaint()') > 0, 'todoBars·todoPaint 코드를 못 찾음');
vm.runInContext(body, ctx, { filename: 'tools-html-js' });
const pills = () => (ctx.$('obsub').children || []).map(b => ({ label: (b.children || []).filter(c => c.nodeType === 3).map(c => c._t).join(''), cls: b.className, n: (b.children || []).filter(c => c.className === 'n').map(c => c._t)[0] }));
ctx.TODO = { all: [{ g: 0 }, { g: 0 }, { g: 3 }], tabs: ['', '', '', 'T4'], grp: [{ i: 0, label: '방공지' }, { i: 2, label: '명단·가이드' }, { i: 3, label: '할일' }, { i: 5, label: '리뷰비' }], later: 0 };
ctx.todoSub = '';
vm.runInContext('todoBars()', ctx);
let P = pills();
ok(P.map(x => x.label).join('|') === '방공지|명단·가이드|할일|리뷰비', '알약 이름·순서 ' + JSON.stringify(P.map(x => x.label)));
ok(P.length === 4, "'전체' 알약이 남아 있음 (알약 " + JSON.stringify(P.map(x => x.label)) + ')');
ok(String(ctx.todoSub) === '0', '처음 고른 탭이 첫 탭(0)이 아님: ' + ctx.todoSub);
ok(P[0].n === '2' && P[2].n === '1' && P[1].n === '0', '개수 배지 ' + JSON.stringify(P.map(x => x.n)));
ok(P[0].cls.indexOf(' on') >= 0, '첫 탭이 켜져 있지 않음');
// 탭을 누르면 그 탭이 남아 있는지 (다시 그려도 그대로)
vm.runInContext('todoSub = "3"; todoBars();', ctx);
P = pills();
ok(String(ctx.todoSub) === '3' && P[2].cls.indexOf(' on') >= 0, '고른 탭이 다시 그려도 유지');

// ② 썸네일 + 본문 가로 배치
ok(/var row = document\.createElement\('div'\); row\.className = 'obrow';/.test(T), '진행 도우미: 썸네일·본문 묶음(.obrow)이 없음');
ok(/c\.insertBefore\(row, before\); row\.appendChild\(before\)/.test(T), '진행 도우미: 본문(pre)을 썸네일 옆으로 안 옮김');
ok(/\.ob \.obrow \{ display: flex; gap: 10px; align-items: flex-start;/.test(T), '진행 도우미: .obrow 가로 배치 CSS 없음');
ok(/\.ob \.obrow \.th \{ flex: 0 0 96px; width: 96px; \}/.test(T), '진행 도우미: 썸네일 96px 아님');
ok(/\.ob \.obrow pre \{ flex: 1 1 auto; min-width: 0; margin: 0; \}/.test(T), '진행 도우미: 본문이 남은 폭을 안 씀');
ok(T.indexOf('max-width:140px') < 0 && T.indexOf('사진 길게 눌러 저장 → 카톡에 첨부') < 0, '진행 도우미: 예전 썸네일 코드가 남아 있음');
ok(/row\.className = 'obrow'/.test(O) && /\.obrow\{display:flex/.test(O), '보낼 메시지함: 가로 배치 아님');

// ③ 글꼴은 화면을 막지 않게 (11/28 켤 때 느림 — 바깥 CSS가 첫 화면을 잡고 있었음)
ok(/fonts\.googleapis\.com[^"]+" media="print" onload="this\.media='all'"/.test(T), '진행 도우미: 글꼴 CSS가 아직 화면을 막음');

console.log(fails.length ? 'XX 진행 도우미 화면 시험 실패:\n- ' + fails.join('\n- ') : "✓ 진행 도우미 화면: 알약 '전체' 뺌·첫 탭으로 열기·공지 썸네일 옆 본문 시험 통과");
process.exit(fails.length ? 1 : 0);
