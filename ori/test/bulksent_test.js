// (11/19 한 번, 사용자 승인) 할일·방공지 탭 대기 일괄 보냄: 리뷰 가이드·다른 종류는 안 건드림, 내일 이후 진행 폼 공지는 남김  node bulksent_test.js <Main.js>
const H = require('./harness'); const vm = require('vm');
const env = H.makeEnv({ main: process.argv[2], props: { OUTBOX_SORTED: '1', OUTBOX_FMT2: '1' } }); const G = k => vm.runInContext(k, env);
const fails = [], ok = (c, m) => { if (!c) fails.push(m); };
const t0 = new Date(); t0.setHours(0, 0, 0, 0); const day = n => new Date(t0.getTime() + n * 86400000), md = d => (d.getMonth() + 1) + '.' + d.getDate();
env.__ss.sheets['보낼메시지'] = new H.Sheet('보낼메시지', [['ID', '보낼 날짜', '종류', '카톡방', '메시지', '보냄 체크'],
  ['t1', day(-3), '할 일', '내 할 일', '[결제금액 확인] 가', '대기'],
  ['t2', day(0), '할 일', '사장님', '포토 요청', '대기'],
  ['n1', day(0), '방 공지', '#' + md(day(0)) + ' 귤 5', '★★★바로구매★★★\n폼 https://forms.gle/abc', '대기'],
  ['n2', day(0), '방 공지', '#' + md(day(1)) + ' 귤 5', '★★★자정 ~ 오전 7시 구매★★★\n폼 https://forms.gle/xyz', '대기'],
  ['n3', day(0), '방 공지', '#' + md(day(-2)) + ' 사과 10', '공지 바뀜 안내', '대기'],
  ['g1', day(0), '방 공지', '#' + md(day(-5)) + ' 배 5', '🐥리뷰내용 가이드🐥\n\n텍스트리뷰(5명) : 가 나', '대기'],
  ['r1', day(0), '리뷰비 요청', '리뷰비시트', '요청', '대기'],
  ['s1', day(-1), '할 일', '내 할 일', '이미 보냄', '보냄']]);
G('bulkSent1_()');
const st = id => env.__ss.sheets['보낼메시지'].rows.find(r => r[0] === id)[5];
ok(st('t1') === '보냄' && st('t2') === '보냄', '할 일 다 보냄');
ok(st('n1') === '보냄' && st('n3') === '보냄', '오늘·지난 방 공지 보냄');
ok(st('n2') === '대기', '내일 진행 폼 공지는 남김');
ok(st('g1') === '대기' && st('r1') === '대기', '리뷰 가이드·리뷰비는 안 건드림');
ok(!!env.__props.get('MSGV_S_t1') && !env.__props.get('MSGV_S_g1'), '보낸 것만 체크 시각');
ok(/^✓ .*할 일 2 · 방 공지 2 · 남김\(내일 이후 진행 폼 공지\) 1/.test(env.__props.get('BULKSENT1') || ''), '결과 ' + env.__props.get('BULKSENT1'));
env.__ss.sheets['보낼메시지'].rows.push(['t9', day(0), '할 일', '내 할 일', '새 할 일', '대기']);
G('bulkSent1_()');
ok(st('t9') === '대기', '한 번만');
console.log(fails.length ? 'XX 일괄 보냄 시험 실패:\n- ' + fails.join('\n- ') : '✓ 할일·방공지 일괄 보냄(한 번) 시험 통과');
process.exit(fails.length ? 1 : 0);
