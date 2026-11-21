// (11/21) 보낼메시지 대기 일괄 정리 obClear2_: 돈·상태 바뀌는 종류, 결제금액 확인, 앞으로 진행 공지는 남김  node obclear_test.js <Main.js>
const H = require('./harness'); const vm = require('vm');
const env = H.makeEnv({ main: process.argv[2], props: { OUTBOX_SORTED: '1', OUTBOX_FMT2: '1' } }); const G = k => vm.runInContext(k, env);
const fails = [], ok = (c, m) => { if (!c) fails.push(m); };
const t0 = new Date(); t0.setHours(0, 0, 0, 0);
const dm = n => { const d = new Date(t0.getTime() + n * 86400000); return (d.getMonth() + 1) + '.' + d.getDate(); };
const F = 'https://forms.gle/abc';
const rows = [
  ['a1', new Date(), '방 공지', '#' + dm(-3) + ' 가짜 양말 5', '구매 공지 ' + F, '대기'],
  ['a2', new Date(), '방 공지', '#' + dm(2) + ' 가짜 양말 5', '구매 공지 ' + F, '대기'],
  ['a3', new Date(), '방 공지', '#' + dm(-5) + ' 가짜 귤 3', '🐥리뷰내용 가이드🐥\n\n텍스트리뷰(3명) : 홍길동', '대기'],
  ['a4', new Date(), '방 공지', '#' + dm(0) + ' 가짜 귤 3', '🐥리뷰내용 가이드🐥\n\n텍스트리뷰(3명) : 홍길동', '대기'],
  ['a5', new Date(), '할 일', '내 할 일', '[결제금액 확인] #' + dm(-1) + ' 가짜 3 | 홍길동: 15,900원 결제', '대기'],
  ['a6', new Date(), '할 일', '내 할 일', '[업체 전달 못 함] 가짜 귤', '대기'],
  ['a7', new Date(), '페이백 요청', '오리명단방(뽀짝)', '[전원 리뷰완료] #' + dm(-8) + ' 실 가짜 2 페이백 요청드립니다!', '대기'],
  ['a8', new Date(), '취완', '#' + dm(-8) + ' 실 가짜 2', '취완', '대기'],
  ['a9', '포토전달대기', '포토 가이드', '#' + dm(-4) + ' 가짜 사과 20', '🐥리뷰내용 가이드🐥 포토', '대기'],
  ['b1', new Date(), '리뷰 독촉', '#' + dm(-10) + ' 가짜 배 3', '⏰ 리뷰 작성 기한이 지났어요', '대기'],
  ['b2', new Date(), '방 공지', '#' + dm(-2) + ' 가짜 감 4', '구매 공지 ' + F, '보냄'],
  ['b3', new Date(), '리뷰비 요청', '리뷰비시트', '11/1\t#11.1 가짜 3\t3건\thttps://x', '대기']
];
env.__ss.sheets['보낼메시지'] = new H.Sheet('보낼메시지', [['ID', '보낼 날짜', '종류', '카톡방', '메시지', '보냄 체크']].concat(rows));
let err = ''; try { G('obClear2_()'); } catch (e) { err = String(e.stack || e); }
ok(!err, '오류 ' + err);
const st = id => (env.__ss.sheets['보낼메시지'].rows.find(r => r[0] === id) || [])[5];
const want = { a1: '보냄', a2: '대기', a3: '보냄', a4: '대기', a5: '대기', a6: '보냄', a7: '대기', a8: '대기', a9: '대기', b1: '보냄', b2: '보냄', b3: '대기' };
Object.keys(want).forEach(id => ok(st(id) === want[id], id + ' ' + st(id) + ' (기대 ' + want[id] + ')'));
const P = G("PropertiesService.getScriptProperties().getProperty('OBCLEAR2')");
ok(/^✓/.test(P) && /방 공지 2/.test(P) && /할 일 1/.test(P) && /리뷰 독촉 1/.test(P), '기록 ' + P);
// 두 번째는 안 돎
env.__ss.sheets['보낼메시지'].rows.find(r => r[0] === 'a2')[5] = '대기';
G('obClear2_()'); ok(st('a1') === '보냄' && st('a2') === '대기', '한 번만');
console.log(fails.length ? 'XX 보낼메시지 정리 시험 실패:\n- ' + fails.join('\n- ') : '✓ 보낼메시지 대기 정리(돈·앞으로 진행은 남김) 시험 통과');
process.exit(fails.length ? 1 : 0);
