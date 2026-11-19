// (11/19 한 번, 사용자 승인) 기한 전인데 잘못 뜬 '[업체 전달 못 함]' 할 일 9건만 지움  node stuckdel_test.js <Main.js>
const H = require('./harness'); const vm = require('vm');
const env = H.makeEnv({ main: process.argv[2], props: { OUTBOX_SORTED: '1', OUTBOX_FMT2: '1', RVSTUCKMSG_S1: '1', RVSTUCKMSG_S2: '1' } }); const G = k => vm.runInContext(k, env); const LH = G('LIST_HEADER');
const fails = [], ok = (c, m) => { if (!c) fails.push(m); };
const mk = o => LH.map(h => o[h] !== undefined ? o[h] : '');
const t0 = new Date(); t0.setHours(0, 0, 0, 0); const day = n => new Date(t0.getTime() + n * 86400000), md = d => (d.getMonth() + 1) + '.' + d.getDate();
env.__ss.sheets['진행목록'] = new H.Sheet('진행목록', [LH.slice(),
  mk({ '진행일': day(-7), '명단 제목': '#' + md(day(-7)) + ' 산지잇다 감홍사과 20 (뽀짝오리)', '시트ID': 'S1', '진행 상태': '진행중', '인원': 20, '총건수': 20 }),
  mk({ '진행일': day(-14), '명단 제목': '#' + md(day(-14)) + ' 과일쏙 못난이사과외 10 (뽀짝오리)', '시트ID': 'S2', '진행 상태': '진행중', '인원': 10, '총건수': 10, '리뷰 취합': day(-2) })]);
env.__ss.sheets['보낼메시지'] = new H.Sheet('보낼메시지', [['ID', '보낼 날짜', '종류', '카톡방', '메시지', '보냄 체크'],
  ['a1', day(-7), '할 일', '내 할 일', '[업체 전달 못 함] 산지잇다 감홍사과 (' + md(day(-7)) + ') — 리뷰 확인 안 된 20명: …', '대기'],
  ['a2', day(-14), '할 일', '내 할 일', '[업체 전달 못 함] 과일쏙 못난이사과외 (' + md(day(-14)) + ') — 리뷰 확인 안 된 1명: …', '대기'],
  ['a3', day(-7), '할 일', '내 할 일', '[결제금액 확인] 산지잇다 감홍사과', '대기']]);
G('stuckTodoDel1_()');
const ids = () => env.__ss.sheets['보낼메시지'].rows.slice(1).map(r => r[0]);
ok(JSON.stringify(ids()) === '["a2","a3"]', '기한 전 9건 중 하나만 지움, 늦은 것·다른 할 일은 그대로 ' + JSON.stringify(ids()));
ok(!env.__props.get('RVSTUCKMSG_S1') && env.__props.get('RVSTUCKMSG_S2') === '1', '지운 의뢰만 알림 표시 지움');
ok(/^✓ .* 지움 1: 산지잇다 감홍사과/.test(env.__props.get('STUCKDEL1') || ''), '결과 ' + env.__props.get('STUCKDEL1'));
G('stuckTodoDel1_()');
ok(ids().length === 2, '한 번만');
console.log(fails.length ? 'XX 업체 전달 못 함 할 일 지우기 시험 실패:\n- ' + fails.join('\n- ') : '✓ 기한 전 업체 전달 못 함 할 일 9건 지우기 시험 통과');
process.exit(fails.length ? 1 : 0);
