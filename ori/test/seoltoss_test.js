// (11/10) 설향딸기외 11.10 쿠팡 취소 → 토스만 각 5명: 공지에서 토스만 남김(번호 다시), 방제 …10·목표 10, 안 보낸 쿠팡 공지는 지우고 새 공지  node seoltoss_test.js <Main.js>
const H = require('./harness'); const vm = require('vm');
const env = H.makeEnv({ main: process.argv[2], props: { OUTBOX_SORTED: '1', OUTBOX_FMT2: '1' } }); const G = k => vm.runInContext(k, env);
const fails = [], ok = (c, m) => { if (!c) fails.push(m); };
const SEP = '————————————————————————';
const blk = (n, who, kw, opt, price) => [n + ') ' + who, '링크타고 검색▼( 상번이 네이버일때 무시)', 'https://coupa.ng/x', '🐥판매처 : 오늘과일', '🐥상품명 : ' + kw + ' 상품', '🐥★키워드 : ' + kw, '🐥옵션 : ' + opt, '🐥가격 : ' + price, '🐥리뷰 : 포토대기'].join('\n');
const notice = ['★★★자정 ~ 오전 7시까지 구매★★★', '', '가격이 높으면 사지 마세요!', '▶ 결제 스크린샷은 필수입니다', '', '☆★☆★ 양식 작성 폼 ☆★☆★', 'https://forms.gle/AAA', '',
  blk(1, '11명쿠팡 - 11명 :', '설향딸기', '350g(특품)x1박스', '25,600'), '', SEP, '', blk(2, '10명쿠팡 - 10명 :', '황금향', '3kg', '13,800'), '', SEP, '',
  blk(3, '5명토스 - 5명 :', '콜라비', '1박스, 3kg', '12,400'), '', SEP, '', blk(4, '5명토스 - 5명 :', '설향딸기', '350g', '25,600')].join('\n');
env.__N = notice;
const t = G('tossOnlyNotice_(__N)');
ok(t && t.indexOf('쿠팡') < 0 && /^1\) 5명토스 - 5명 :/m.test(t) && /^2\) 5명토스 - 5명 :/m.test(t) && !/^3\)/m.test(t), '토스만, 번호 1·2 ' + t);
ok(t.indexOf('★★★자정 ~ 오전 7시까지 구매★★★') === 0 && t.indexOf('https://forms.gle/AAA') > 0 && t.indexOf('🐥★키워드 : 콜라비') > 0 && t.split('\n').filter(l => /^[—]{5,}$/.test(l.trim())).length === 1, '머리 글·폼 링크·구분선 하나');
ok(!/————\s*$/.test(t), '끝에 구분선 없음');
ok(G("tossOnlyNotice_('1) 5명토스 - 5명 :\\n🐥x\\n2) 5명토스 - 5명 :\\n🐥y')") === '', '쿠팡 없으면 그대로');
// 진행 바꾸기
const LH = G('LIST_HEADER'), mk = o => LH.map(h => o[h] !== undefined ? o[h] : '');
env.__ss.sheets['진행목록'] = new H.Sheet('진행목록', [LH.slice(),
  mk({ '진행일': new Date(2026, 10, 10), '명단 제목': '#택11.10 오늘과일 설향딸기외 31 (뽀짝오리)', '카톡방': '#택11.10 오늘과일 설향딸기외 31', '택대': 'Y', '시트ID': 'S1', '목표인원': 31, '총건수': 120, '진행 상태': '진행중', '캠페인': '오늘과일 설향딸기외' })]);
env.__ss.sheets['보낼메시지'] = new H.Sheet('보낼메시지', [['ID', '보낼 날짜', '종류', '카톡방', '메시지', '보냄 체크'],
  ['n1', new Date(2026, 10, 10), '방 공지', '#택11.10 오늘과일 설향딸기외 31', notice, '보냄'],
  ['n2', new Date(2026, 10, 10), '방 공지', '#택11.10 오늘과일 설향딸기외 31', '🐥리뷰내용 가이드🐥', '대기']]);
G("payRename_ = function (a, b) { globalThis.__PR = a + '→' + b; }; renameRunFiles_ = function () { return []; }; updatePay_ = function () { globalThis.__UP = 1; };");
let err = ''; try { G('seolToss1_()'); } catch (e) { err = String(e.stack || e); }
ok(!err, '오류 ' + err);
const r = G('readRuns_()')[0];
ok(String(r['명단 제목']) === '#택11.10 오늘과일 설향딸기외 10 (뽀짝오리)' && Number(r['목표인원']) === 10 && r['카톡방'] === '#택11.10 오늘과일 설향딸기외 10', '방제·목표 ' + r['명단 제목'] + ' ' + r['목표인원'] + ' ' + env.__props.get('SEOLTOSS1'));
const rows = env.__ss.sheets['보낼메시지'].rows.slice(1);
const nn = rows.filter(x => x[2] === '방 공지' && x[5] !== '보냄' && /양식 작성 폼/.test(x[4]));
ok(nn.length === 1 && nn[0][3] === '#택11.10 오늘과일 설향딸기외 10' && nn[0][4].indexOf('쿠팡') < 0, '새 공지 하나 ' + JSON.stringify(nn.map(x => [x[3], x[4].slice(0, 40)])));
ok(rows.some(x => x[0] === 'n1' && x[5] === '보냄') && rows.some(x => x[0] === 'n2' && x[3] === '#택11.10 오늘과일 설향딸기외 10'), '보낸 공지 그대로, 다른 공지는 새 방으로');
ok(G('__PR') === '#택11.10 오늘과일 설향딸기외 31→#택11.10 오늘과일 설향딸기외 10' && G('__UP') === 1, '월급시트 ' + G('__PR'));
console.log(fails.length ? 'XX 토스만 시험 실패:\n- ' + fails.join('\n- ') : '✓ 설향딸기외 11.10 토스만 10명 (공지·방제·월급시트) 시험 통과');
process.exit(fails.length ? 1 : 0);
