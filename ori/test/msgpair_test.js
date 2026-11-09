// 리뷰비(페이백) 요청 ↔ 취완 같이 체크 (11/10): 한쪽을 보냄 체크하면 같은 카톡방 짝도 보냄, 풀면 같이 풀림, 다른 방은 그대로  node msgpair_test.js <Main.js>
const H = require('./harness'); const vm = require('vm');
const env = H.makeEnv({ main: process.argv[2], props: { OUTBOX_SORTED: '1', OUTBOX_FMT2: '1' } }); const G = k => vm.runInContext(k, env);
const fails = [], ok = (c, m) => { if (!c) fails.push(m); };
const LH = G('LIST_HEADER'), mk = o => LH.map(h => o[h] !== undefined ? o[h] : '');
env.__ss.sheets['진행목록'] = new H.Sheet('진행목록', [LH.slice(),
  mk({ '진행일': new Date(2026, 10, 3), '명단 제목': '#택11.3 귤 5 (뽀짝오리)', '카톡방': '#택11.3 귤 5', '시트ID': 'S1', '인원': 5 }),
  mk({ '진행일': new Date(2026, 10, 3), '명단 제목': '#11.3 실 밴드 4 (뽀짝오리)', '카톡방': '#11.3 실 밴드 4', '실배송': 'Y', '시트ID': 'S2', '인원': 4 }),
  mk({ '진행일': new Date(2026, 10, 4), '명단 제목': '#택11.4 감 3 (뽀짝오리)', '카톡방': '#택11.4 감 3', '시트ID': 'S3', '인원': 3 })]);
const OBH = ['ID', '보낼 날짜', '종류', '카톡방', '메시지', '보냄 체크'];
env.__ss.sheets['보낼메시지'] = new H.Sheet('보낼메시지', [OBH,
  ['a1', new Date(), '취완', '#택11.3 귤 5', '취완', '대기'],
  ['a2', new Date(), '리뷰비 요청', '리뷰비시트', '11/3\t#택11.3 귤 5\t5건\thttps://x', '대기'],
  ['b1', new Date(), '취완', '#11.3 실 밴드 4', '취완', '대기'],
  ['b2', new Date(), '페이백 요청', '오리명단방(뽀짝)', '[전원 리뷰완료] #11.3 실 밴드 4 페이백 요청드립니다!\n명단시트: https://y', '대기'],
  ['c1', new Date(), '취완', '#택11.4 감 3', '취완', '대기'],
  ['c2', new Date(), '리뷰비 요청', '리뷰비시트', '11/4\t#택11.4 감 3\t3건\thttps://z', '대기']]);
G('msgViewBuild_ = function (f, gi) { (globalThis.__RB = globalThis.__RB || []).push(gi); }; rvSetColl_ = function () { return 0; };');
const ob = () => G('outboxSheet_()'), st = () => Object.fromEntries(env.__ss.sheets['보낼메시지'].rows.slice(1).map(r => [r[0], r[5]]));
const orows = () => env.__ss.sheets['보낼메시지'].rows.slice(1).map(r => r.slice());
const giDone = G("MSGV_GROUPS.map(function (g) { return g.key; }).indexOf('done')"), giPay = G("MSGV_GROUPS.map(function (g) { return g.key; }).indexOf('pay')");
// 1) 취완(귤) 체크 → 귤 리뷰비 요청도 보냄
env.__ss.sheets['보낼메시지'].rows[1][5] = '보냄';
let note = G('msgvPairSync_')(ob(), orows(), [['a1']], [[true]], 1, giDone);
ok(st().a2 === '보냄' && st().c2 === '대기' && st().b2 === '대기', '귤 취완 → 귤 리뷰비만 ' + JSON.stringify(st()));
ok(/리뷰비 요청 1개도 같이 보냄 체크/.test(note), '알림 ' + note);
ok(JSON.stringify(G('__RB')) === JSON.stringify([giPay]), '짝 탭(리뷰비)만 다시 그림 ' + JSON.stringify(G('__RB')));
ok(env.__props.get('MSGV_S_a2'), '보낸 시각 (이틀 회색)');
// 2) 페이백 요청(실배송 밴드) 체크 → 그 방 취완도
env.__ss.sheets['보낼메시지'].rows[4][5] = '보냄';
G('msgvPairSync_')(ob(), orows(), [['b2']], [[true]], 1, giPay);
ok(st().b1 === '보냄' && st().c1 === '대기', '밴드 페이백 → 밴드 취완 ' + JSON.stringify(st()));
// 3) 잘못 눌러 풀면 짝도 풀림
env.__ss.sheets['보낼메시지'].rows[1][5] = '대기';
G('msgvPairSync_')(ob(), orows(), [['a1']], [[false]], 1, giDone);
ok(st().a2 === '대기' && !env.__props.get('MSGV_S_a2'), '풀면 같이 풀림 ' + JSON.stringify(st()));
// 4) 다른 종류(방공지 등)는 아무것도 안 함
ok(G('msgvPairSync_')(ob(), [['z', new Date(), '방 공지', '#택11.3 귤 5', 'x', '보냄']], [['z']], [[true]], 1, 0) === '', '다른 종류는 그대로');
console.log(fails.length ? 'XX 리뷰비↔취완 같이 체크 시험 실패:\n- ' + fails.join('\n- ') : '✓ 리뷰비(페이백) 요청 ↔ 취완 같이 체크 시험 통과');
process.exit(fails.length ? 1 : 0);
