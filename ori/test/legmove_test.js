// (11/18 하루) 레깅스 50 응답 옮기기: 옛 폼 → 새 폼 같은 답, 옛 폼·응답 탭·명단 탭은 하나씩 정확히 지움, 끊겨도 두 폼에 안 남음  node legmove_test.js <Main.js>
const H = require('./harness'); const vm = require('vm');
const env = H.makeEnv({ main: process.argv[2] }); const G = k => vm.runInContext(k, env);
const fails = [], ok = (c, m) => { if (!c) fails.push(m); };
G(`
const TITLES = ['방에 참여한 카카오톡 닉네임', '계정명(수령인)', '전화번호 ', '옵션 '];
const mkItem = function (t, i) { return { getTitle: function () { return t; }, getType: function () { return i === 3 ? 'MULTIPLE_CHOICE' : 'TEXT'; },
  asTextItem: function () { const me = this; return { createResponse: function (v) { return { item: me, v: v }; } }; },
  asMultipleChoiceItem: function () { const me = this; return { hasOtherOption: function () { return false; }, getChoices: function () { return [{ getValue: function () { return '블랙'; } }, { getValue: function () { return '네이비'; } }]; }, createResponse: function (v) { return { item: me, v: v }; } }; } }; };
const mkForm = function (id) { const f = { id: id, items: TITLES.map(mkItem), resps: [], seq: 0 };
  f.getItems = function () { return f.items; };
  f.getResponses = function () { return f.resps.slice(); };
  f.deleteResponse = function (rid) { const i = f.resps.findIndex(function (r) { return r.getId() === rid; }); if (i < 0) throw new Error('없는 응답'); f.resps.splice(i, 1); };
  f.add = function (t, vals) { const rid = id + '-' + (++f.seq), ts = new Date(t); f.resps.push({ getId: function () { return rid; }, getTimestamp: function () { return ts; }, vals: vals,
    getItemResponses: function () { return vals.map(function (v, i) { return { getItem: function () { return f.items[i]; }, getResponse: function () { return v; } }; }); } }); };
  f.createResponse = function () { const got = []; return { withItemResponse: function (ir) { got.push(ir); return this; }, submit: function () {
    if (globalThis.__FAIL_AT && f.resps.length + 1 === globalThis.__FAIL_AT) throw { kill: 1 };
    f.add(Date.now(), f.items.map(function (it) { const h = got.filter(function (g) { return g.item === it; })[0]; return h ? h.v : ''; })); } }; };
  return f; };
globalThis.OF = mkForm('OLDFORM'); globalThis.NF = mkForm('NEWFORM');
FormApp = { openById: function (id) { return id === 'OLDFORM' ? OF : NF; }, ItemType: { TEXT: 'TEXT', PARAGRAPH_TEXT: 'PARAGRAPH_TEXT', MULTIPLE_CHOICE: 'MULTIPLE_CHOICE', LIST: 'LIST', CHECKBOX: 'CHECKBOX' } };
const T = function (h, m, s) { return new Date('2026-11-18T' + h + ':' + m + ':' + s + '.400+09:00').getTime(); };
// 옛 폼: 레깅스 30 사람(09:00) + 레깅스 50 사람(14:21~, 14:30:21·14:30:22는 1초 차이)
OF.add(T('09','00','35'), ['슬기', '양슬기', '010-1111-0825', '블랙']);
OF.add(T('14','21','09'), ['김현진', '김현진', '010-2222-2556', '블랙']);
OF.add(T('14','30','21'), ['권용인', '박철용', '010-3333-9507', '네이비']);
OF.add(T('14','30','22'), ['황성례', '황성례', '010-4444-0917', '블랙']);
OF.add(T('15','09','52'), ['이효주', '이효주', '010-5555-5868', '블랙']);
// 새 폼: 이효주는 이미 새 폼에도 냄
NF.add(T('15','30','00'), ['이효주', '이효주', '01055555868', '블랙']);
// 옛 명단 시트: 응답 탭(시각은 초 단위) + 값 명단 탭(2행 머리글)
const sec = function (t) { return new Date(Math.floor(t / 1000) * 1000); };
const mkTab = function (rows, url) { const t = { rows: rows, url: url }; t.getFormUrl = function () { return url; }; t.getLastRow = function () { return t.rows.length; };
  t.getLastColumn = function () { return 3; };
  t.getRange = function (r, c, nr, nc) { return { getValues: function () { const o = []; for (let i = 0; i < (nr || 1); i++) { const row = t.rows[r - 1 + i] || []; o.push(row.slice(c - 1, c - 1 + (nc || 1))); } return o; } }; };
  t.deleteRow = function (r) { t.rows.splice(r - 1, 1); }; return t; };
globalThis.RAW = mkTab([['타임스탬프', '닉', '수령인']].concat(OF.resps.map(function (r) { return [sec(r.getTimestamp().getTime()), r.vals[0], r.vals[1]]; })), 'https://docs.google.com/forms/d/OLDFORM/edit');
globalThis.LT = mkTab([['안내'], ['타임스탬프', '닉', '수령인']].concat(OF.resps.map(function (r) { return [sec(r.getTimestamp().getTime()), r.vals[0], r.vals[1]]; })), '');
globalThis.OTHER = mkTab([['타임스탬프'], [sec(T('14','30','22'))]], 'https://docs.google.com/forms/d/ANOTHERFORM/edit');
SpreadsheetApp.openById = function (id) { return { getId: function () { return id; }, getSheets: function () { return id === 'OLDSHEET' ? [RAW, OTHER] : []; }, getSheetByName: function (n) { return id === 'OLDSHEET' && n === LIST_TAB ? LT : null; }, getName: function () { return id; } }; };
SpreadsheetApp.flush = function () {};
PropertiesService.getScriptProperties().setProperty('LISTV_OLDSHEET', '1');
globalThis.__RUNS = [{ row: 17, '요청ID': 'npb3d175-2', '폼ID': 'OLDFORM', '시트ID': 'OLDSHEET', '명단 제목': '#11.18 실 탄탄상점 레깅스 30' },
  { row: 9, '요청ID': 'src3cf7o', '폼ID': 'NEWFORM', '시트ID': LEG_NEW_SID, '명단 제목': '#11.18 실 탄탄상점 레깅스 50' }];
readRuns_ = function () { return __RUNS; };
globalThis.__SET = [];
setRun_ = function (row, h, v) { __SET.push([row, h, v]); };
runCount_ = function () { return RAW.rows.length - 1; };
syncList_ = function () { return 0; };
`);
// 1) 미리보기: 아무것도 안 바뀜
const dry = G('legMove_(true)');
ok(dry.plan.length === 4 && dry.prob.length === 0, '1) 미리보기 4명 ' + JSON.stringify(dry));
ok(/이미 있음/.test(dry.plan[3]), '1) 새 폼에 이미 있는 이효주 표시 ' + dry.plan[3]);
ok(G('OF.resps.length') === 5 && G('NF.resps.length') === 1 && G('RAW.rows.length') === 6, '1) 미리보기는 안 바꿈');
// 2) 지난번이 끊김: 김현진을 새 폼에 넣고 기록(LEGMV_PEND)까지 한 뒤 6분 제한에 끊긴 상태 → 이번엔 옛 김현진부터 지우고, 새 폼에 두 번 안 넣음
G("const k = OF.resps[1]; NF.add(Date.now(), k.vals.slice()); PropertiesService.getScriptProperties().setProperty('LEGMV_PEND', JSON.stringify([{ id: k.getId(), t: k.getTimestamp().getTime() }]));");
// 넣다가 오류(예: 폼이 안 받음)가 난 사람은 옛 것도 안 지움
G('globalThis.__FAIL_AT = 0');
G('globalThis.__ORI_NOTES = []; legMove_(false, true)');
// 3) 결과: 새 폼 = 이효주(원래) + 김현진·박철용·황성례 / 옛 폼 = 양슬기만 / 응답 탭·명단 탭도 양슬기만 / 다른 폼 탭은 그대로
const nf = G('NF.resps.map(function (r) { return r.vals[1]; })'), of = G('OF.resps.map(function (r) { return r.vals[1]; })');
ok(JSON.stringify(nf.slice().sort()) === JSON.stringify(['김현진', '박철용', '이효주', '황성례'].sort()), '3) 새 폼(김현진 한 번만) ' + JSON.stringify(nf));
ok(JSON.stringify(of) === JSON.stringify(['양슬기']), '3) 옛 폼 ' + JSON.stringify(of));
ok(JSON.stringify(G('RAW.rows.slice(1).map(function (r) { return r[2]; })')) === JSON.stringify(['양슬기']), '3) 응답 탭 ' + JSON.stringify(G('RAW.rows')));
ok(JSON.stringify(G('LT.rows.slice(2).map(function (r) { return r[2]; })')) === JSON.stringify(['양슬기']), '3) 명단 탭 ' + JSON.stringify(G('LT.rows')));
ok(G('OTHER.rows.length') === 2, '3) 다른 폼 탭은 안 건드림');
ok(G('NF.resps.filter(function (r) { return r.vals[1] === "박철용"; })[0].vals[3]') === '네이비', '3) 옵션 그대로');
ok(!env.__props.get('LEGMV_PEND'), '3) 기록 비움');
ok(JSON.stringify(G('__SET.slice(-1)[0]')) === JSON.stringify([17, '인원', 1]), '3) 옛 진행 인원 다시 셈 ' + JSON.stringify(G('__SET')));
ok(/레깅스 50 응답 옮김/.test(JSON.stringify(G('globalThis.__ORI_NOTES'))), '3) 실행 기록');
// 4) 다시 돌려도 그대로 (옮길 게 없음)
G('legMove_(false, true)');
ok(G('NF.resps.length') === 4 && G('OF.resps.length') === 1, '4) 두 번 돌려도 그대로');
// 5) 늦게 옛 폼으로 들어온 것도 옮김
G("OF.add(new Date('2026-11-18T16:10:05+09:00').getTime(), ['현주', '박재홍', '010-6666-4747', '블랙']); RAW.rows.push([new Date('2026-11-18T16:10:05+09:00'), '현주', '박재홍']);");
G('legMove_(false, true)');
ok(G('NF.resps.length') === 5 && G('OF.resps.length') === 1 && G('RAW.rows.length') === 2, '5) 늦게 온 것도 옮김');
// 6) 다른 날엔 아무것도 안 함
ok(G("(function(){ const f = Utilities.formatDate; Utilities.formatDate = function (d, z, p) { return p === 'yyyyMMdd' ? '20261119' : f(d, z, p); }; const r = legMove_(false); Utilities.formatDate = f; return r; })()") === null, '6) 다른 날엔 안 함');
// 7) 새 폼에 넣다가 오류가 나면 그 사람은 옛 폼에 그대로 (지우지 않음)
G("OF.add(new Date('2026-11-18T16:20:00+09:00').getTime(), ['오류', '오류님', '010-7777-0000', '블랙']); RAW.rows.push([new Date('2026-11-18T16:20:00+09:00'), '오류', '오류님']); globalThis.__FAIL_AT = NF.resps.length + 1;");
const r7 = G('legMove_(false, true)'); G('globalThis.__FAIL_AT = 0');
ok(r7.prob.length === 1 && G('OF.resps.length') === 2 && G('RAW.rows.length') === 3, '7) 오류 난 사람은 옛 폼에 그대로 ' + JSON.stringify(r7.prob));
if (fails.length) { console.log('✗ ' + fails.join('\n✗ ')); process.exit(1); }
console.log('✓ 레깅스 50 응답 옮기기 시험 통과');
