// 장바구니건 리뷰 사진 (11/8): 캡처 1장 = 1명. 포토 폴더 = 포토 1 + 텍스트(상품수-1), 텍스트 폴더 = 텍스트만. 보고 글 총 = 사람 × 상품 수.
//  그리고 '리뷰 사진 확인' 할 일은 의뢰마다 하나만, 경고가 없어지면 지움  node rvcart_test.js <Main.js>
const H = require('./harness'); const vm = require('vm');
const env = H.makeEnv({ main: process.argv[2], props: { OUTBOX_SORTED: '1', OUTBOX_FMT2: '1', CART_S3: '3' } }); const G = k => vm.runInContext(k, env);
const fails = [], ok = (c, m) => { if (!c) fails.push(m); };
const a = G('rvCartCounts_(8, 12, 0, 3, 20)');
ok(JSON.stringify(a.cnt) === JSON.stringify({ 포토: 8, 텍스트: 52, 별점: 0 }) && a.warn.length === 0, '개수 ' + JSON.stringify(a));
const b = G('rvCartCounts_(8, 10, 0, 3, 20)');
ok(b.warn.length === 1 && /2명 캡처가 빠졌는지/.test(b.warn[0]) && b.cnt === null, '빠진 캡처 ' + JSON.stringify(b));
const c2 = G('rvCartCounts_(8, 25, 0, 3, 20)');
ok(c2.cnt === null && /두 장 이상/.test(c2.warn[0]) && c2.txt === '포토 포함 8장, 텍스트만 25장', '캡처가 사람보다 많음 ' + JSON.stringify(c2));
const rmN = G("rvReportMsg_('L', [{ '명단 제목': '#10.28 유러피안샐러드외 60 (뽀짝오리)', '인원': 20, '총건수': 20, '시트ID': 'S3' }], '', null)");
ok(rmN.split('\n')[3] === '총 60건 리뷰 취합본 전달드립니다!', '개수 모를 때 총 = 사람 × 상품 수 ' + JSON.stringify(rmN.split('\n')[3]));
ok(G("rvCartDirName_('포토', 8)") === '포토 포함 (8명)' && G("rvCartDirName_('텍스트', 12)") === '텍스트만 (12명)', '폴더 이름');
ok(G("rvTypeOf_('포토 포함 (8명)')") === '포토' && G("rvTypeOf_('텍스트만 (12명)')") === '텍스트', '폴더 이름으로 종류 알아봄');
const rm = G("rvReportMsg_('L', [{ '명단 제목': '#10.28 유러피안샐러드외 60 (뽀짝오리)', '인원': 20, '총건수': 20, '시트ID': 'S3' }], '', { 포토: 8, 텍스트: 52, 별점: 0 })");
ok(rm.split('\n')[3] === '총 60건 리뷰 취합본(포토리뷰 8개, 텍스트리뷰 52개) 전달드립니다!', '보고 글 ' + JSON.stringify(rm.split('\n')[3]));
// 리뷰 사진 확인 할 일 하나만, 경고 없어지면 지움
env.__ss.sheets['보낼메시지'] = new H.Sheet('보낼메시지', [['ID', '보낼 날짜', '종류', '카톡방', '메시지', '보냄 체크'],
  ['t1', new Date(), '할 일', '내 할 일', '[#택 과일쏙 대봉감] 리뷰 사진 확인 (사진 10장 · 텍스트 10)\n⚠ 의뢰서(텍스트 15)와 폴더 사진 수(텍스트 10)가 달라요', '대기'],
  ['t2', new Date(), '할 일', '내 할 일', '[#택 과일쏙 대봉감] 리뷰 사진 확인 (사진 12장 · 텍스트 12)\n⚠ …', '대기'],
  ['t3', new Date(), '할 일', '내 할 일', '[# 실 속눈썹영양제] 리뷰 사진 확인 (사진 20장)', '대기']]);
const left = () => env.__ss.sheets['보낼메시지'].rows.slice(1).filter(r => r[0]).map(r => r[0] + ':' + String(r[4]).split('\n')[0]);
G("rvCheckMsgSync_('#택 과일쏙 대봉감', '[#택 과일쏙 대봉감] 리뷰 사진 확인 (사진 14장 · 텍스트 14)\\n⚠ 새 경고')");
ok(left().filter(x => /과일쏙/.test(x)).length === 1 && left().some(x => /14장/.test(x)), '하나만 남기고 지금 글로 ' + JSON.stringify(left()));
G("rvCheckMsgSync_('#택 과일쏙 대봉감', '')");
ok(!left().some(x => /과일쏙/.test(x)) && left().some(x => /속눈썹/.test(x)), '경고 없어지면 지움 (다른 의뢰는 그대로) ' + JSON.stringify(left()));
// 받는 곳 사진 → 의뢰: 의뢰 이름 낱말이 먼저 (11/8 시온스 발마사지기 사진이 같은 상품이 든 '시온스 양모볼외'로 감)
env.__c = [{ name: '실 시온스 양모볼외', words: ['시온스', '양모볼', '투온스', '데일리케어', '저주파', '발마사지기', 'EMS'], nameWords: ['시온스', '양모볼'] }, { name: '시온스 발마사지기', words: ['시온스', '발마사지기'], nameWords: ['시온스', '발마사지기'] }];
const m1 = G("rvMatchCamp_('투온스 데일리케어 저주파 발마사지기 EMS 발매트', __c)"), m2 = G("rvMatchCamp_('시온스 양모볼 건조기볼', __c)");
ok(m1 && m1.name === '시온스 발마사지기' && m2 && m2.name === '실 시온스 양모볼외', '의뢰 찾기 ' + [m1 && m1.name, m2 && m2.name].join(' / '));
console.log(fails.length ? 'XX 장바구니건 리뷰 시험 실패:\n- ' + fails.join('\n- ') : '✓ 장바구니건 리뷰·리뷰 사진 확인 할 일 시험 통과');
process.exit(fails.length ? 1 : 0);
