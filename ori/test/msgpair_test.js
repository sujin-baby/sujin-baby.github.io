// 리뷰비 탭에서 취완도 따로 체크 (11/10): L칸 체크 → 그 방 취완만 보냄, B칸(리뷰비 요청)은 그대로. 자동으로 같이 체크되지 않음  node msgpair_test.js <Main.js>
const H = require('./harness'); const vm = require('vm');
const env = H.makeEnv({ main: process.argv[2], props: { OUTBOX_SORTED: '1', OUTBOX_FMT2: '1' } }); const G = k => vm.runInContext(k, env);
const fails = [], ok = (c, m) => { if (!c) fails.push(m); };
const LH = G('LIST_HEADER'), mk = o => LH.map(h => o[h] !== undefined ? o[h] : '');
env.__ss.sheets['진행목록'] = new H.Sheet('진행목록', [LH.slice(),
  mk({ '진행일': new Date(2026, 10, 3), '명단 제목': '#택11.3 귤 5 (뽀짝오리)', '카톡방': '#택11.3 귤 5', '시트ID': 'S1', '인원': 5 }),
  mk({ '진행일': new Date(2026, 10, 3), '명단 제목': '#11.3 실 밴드 4 (뽀짝오리)', '카톡방': '#11.3 실 밴드 4', '실배송': 'Y', '시트ID': 'S2', '인원': 4 })]);
const OBH = ['ID', '보낼 날짜', '종류', '카톡방', '메시지', '보냄 체크'];
const obRows = [OBH,
  ['a1', new Date(), '취완', '#택11.3 귤 5', '취완', '대기'],
  ['a2', new Date(), '리뷰비 요청', '리뷰비시트', '11/3\t#택11.3 귤 5\t5건\thttps://x', '대기'],
  ['b1', new Date(), '취완', '#11.3 실 밴드 4', '취완', '대기'],
  ['b2', new Date(), '페이백 요청', '오리명단방(뽀짝)', '[전원 리뷰완료] #11.3 실 밴드 4 페이백 요청드립니다!\n명단시트: https://y', '대기']];
env.__ss.sheets['보낼메시지'] = new H.Sheet('보낼메시지', obRows.map(r => r.slice()));
const st = () => Object.fromEntries(env.__ss.sheets['보낼메시지'].rows.slice(1).map(r => [r[0], r[5]]));
// 1) 모델: 리뷰비·페이백 줄에 그 방 취완 번호
const rows = env.__ss.sheets['보낼메시지'].rows.slice(1);
env.__ROWS = rows;
G("globalThis.__CH = function (x) { const runs = readRuns_(); const rooms = rvCollRunsOf_(x, runs).map(function (r) { return String(r['카톡방']); }); const c = __ROWS.filter(function (y) { return y[2] === '취완' && rooms.indexOf(String(y[3])) >= 0; })[0]; return c ? { id: c[0], sent: c[5] === '보냄' } : null; }");
const m = G('msgViewModel_')(rows, {}, null, null, G('__CH'));
const gp = G("MSGV_GROUPS.map(function (g) { return g.key; }).indexOf('pay')");
const pl = m.groups[gp].lines;
ok(pl.length === 2 && pl.every(l => l.chwan && l.chwan.id) && pl.find(l => l.kind === '리뷰비 요청').chwan.id === 'a1' && pl.find(l => l.kind === '페이백 요청').chwan.id === 'b1', '리뷰비 탭 줄에 취완 번호 ' + JSON.stringify(pl.map(l => [l.kind, l.chwan])));
// 2) L칸 체크 → 취완만 보냄
const tab = new H.Sheet('💰리뷰비 2', [['', '보냄', '', '', '주문 날짜', '', '', '', '', '', '', '취완', ''], ['a2', false, '', '', '', '', '', '', '', '', '', true, 'a1']]);
G('msgViewBuild_ = function (f, gi) { (globalThis.__RB = globalThis.__RB || []).push(gi); }; rvSetColl_ = function () { return 0; };');
let toastMsg = '';
env.__EV = { range: tab.getRange(2, 12), source: { toast: function (t) { toastMsg = t; } } };
let err = ''; try { G('msgvChwanEdit_')(G('__EV'), tab, 2, 1, function (t) { toastMsg = t; }); } catch (e) { err = String(e.stack || e); }
ok(!err, '오류 ' + err);
ok(st().a1 === '보냄' && st().a2 === '대기', '취완만 보냄, 리뷰비 요청은 그대로 ' + JSON.stringify(st()));
ok(env.__props.get('MSGV_S_a1'), '보낸 시각 (이틀 회색)');
ok(/취완 1개 보냄 체크/.test(toastMsg), '알림 ' + toastMsg);
// 3) 풀면 대기
tab.rows[1][11] = false;
G('msgvChwanEdit_')(G('__EV'), tab, 2, 1, function (t) { toastMsg = t; });
ok(st().a1 === '대기' && !env.__props.get('MSGV_S_a1'), '풀면 대기 ' + JSON.stringify(st()));
// 4) 취완 번호 없는 줄에 체크 → 지움
const tab2 = new H.Sheet('💰리뷰비 2', [['', '보냄'], ['zz', false, '', '', '', '', '', '', '', '', '', true, '']]);
G('msgvChwanEdit_')(G('__EV'), tab2, 2, 1, function (t) { toastMsg = t; });
ok(tab2.rows[1][11] === '' && /아직 없어요/.test(toastMsg), '취완 없는 줄 ' + JSON.stringify(tab2.rows[1]) + ' ' + toastMsg);
ok(!G("typeof msgvPairSync_ === 'function'"), '자동 같이 체크는 없앰');
console.log(fails.length ? 'XX 리뷰비 탭 취완 체크 시험 실패:\n- ' + fails.join('\n- ') : '✓ 리뷰비 탭에서 취완 따로 체크 시험 통과');
process.exit(fails.length ? 1 : 0);
