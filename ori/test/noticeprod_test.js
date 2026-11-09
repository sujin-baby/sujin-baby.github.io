// 공지 상품 나누기 (11/9 설향딸기외): ————(긴 줄표) 구분선도 상품마다 나눔 → 택배 상품·결제금액 확인이 옵션 상품 가격으로  node noticeprod_test.js <Main.js>
const H = require('./harness'); const vm = require('vm');
const env = H.makeEnv({ main: process.argv[2], props: { OUTBOX_SORTED: '1', OUTBOX_FMT2: '1' } }); const G = k => vm.runInContext(k, env);
const fails = [], ok = (c, m) => { if (!c) fails.push(m); };
const SEP = '————————————————————————';
const prod = (n, kw, opt, price) => [n + ') 10명쿠팡 - 10명 :', '🐥판매처 : 오늘과일', '🐥상품명 : ' + kw + ' 상품', '🐥★키워드 : ' + kw, '🐥옵션 : ' + opt, '🐥가격 : ' + price, '🐥리뷰 : 포토대기'].join('\n');
const desc = ['가격이 높으면 사지 마세요!', '▶ 결제 스크린샷은 필수입니다', '', prod(1, '설향딸기', '350g(특품)x1박스', '25,600'), '', SEP, '', prod(2, '황금향', '3kg(로얄과) x 1박스', '13,800'), '', SEP, '', prod(3, '콜라비', '1박스, 3kg', '12,400'), '', SEP, '', prod(4, '설향딸기', '350g', '25,600')].join('\n');
env.__D = desc;
const ps = G('noticeProducts_(__D)');
ok(ps.length === 4 && ps.map(p => p.name).join(',') === '설향딸기,황금향,콜라비,설향딸기', '상품 4개 ' + JSON.stringify(ps.map(p => p.name)));
ok(JSON.stringify(ps.map(p => p.prices)) === '[[25600],[13800],[12400],[25600]]', '상품마다 가격 ' + JSON.stringify(ps.map(p => p.prices)));
ok(G("noticeProducts_('🐥상품명 : 귤\\n🐥★키워드 : 귤\\n🐥가격 : 9,100\\n-----\\n🐥상품명 : 감\\n🐥★키워드 : 감\\n🐥가격 : 8,000')").length === 2, '예전 ----- 구분선도 그대로');
// 결제금액 확인: 옵션 글의 상품 이름 → 그 가격
G("cachedNoticeProducts_ = function () { return noticeProducts_(globalThis.__D); }");
const r = { '폼ID': 'F1' };
env.__R = r;
ok(G("payProdHit_(__R, '콜라비 12.400')").map(p => p.name).join() === '콜라비', '옵션 → 콜라비');
ok(G("payProdHit_(__R, '설향딸기 350g(특품)x1박스')").length === 2, '옵션 → 설향딸기 (쿠팡·토스)');
// 이미 들어간 '공지 가격을 못 찾음' 할 일 다시 보기
const LH = G('LIST_HEADER'), mk = o => LH.map(h => o[h] !== undefined ? o[h] : '');
env.__ss.sheets['진행목록'] = new H.Sheet('진행목록', [LH.slice(), mk({ '진행일': new Date(), '명단 제목': '#택11.9 오늘과일 설향딸기외 30 (뽀짝오리)', '시트ID': 'S1', '폼ID': 'F1', '인원': 30 })]);
const tail = '→ 결제 캡처를 보고, 다르면 그분께 따로 물어보기 (쿠폰·할인이면 그대로 둬도 돼요)';
const pc = (id, line) => [id, new Date(), '할 일', '내 할 일', '[결제금액 확인] #택11.9 오늘과일 설향딸기외 30\n' + line + '\n' + tail, '대기'];
env.__ss.sheets['보낼메시지'] = new H.Sheet('보낼메시지', [['ID', '보낼 날짜', '종류', '카톡방', '메시지', '보냄 체크'],
  pc('a', '김혜영: 12,400원 결제 (공지 가격을 못 찾음, 옵션 콜라비 12.400) → 확인 필요'),
  pc('b', '류미리: 25,600원 결제 (공지 가격을 못 찾음, 옵션 설향딸기 350g(특품)x1박스) → 확인 필요'),
  pc('c', '틀림: 12,400원 결제 (공지 가격을 못 찾음, 옵션 황금향 13,800) → 확인 필요'),
  pc('d', '모름: 9,999원 결제 (공지 가격을 못 찾음, 옵션 사과) → 확인 필요'),
  ['e', new Date(), '할 일', '내 할 일', '[결제금액 확인] #택11.9 오늘과일 설향딸기외 30\n보냄: 12,400원 결제 (공지 가격을 못 찾음, 옵션 콜라비) → 확인 필요\n' + tail, '보냄']]);
let err = ''; try { G('payChkRecheck1_(readRuns_())'); } catch (e) { err = String(e.stack || e); }
ok(!err, '오류 ' + err);
const ids = env.__ss.sheets['보낼메시지'].rows.slice(1).filter(x => x[0]).map(x => x[0]);
ok(JSON.stringify(ids.sort()) === '["c","d","e"]', '맞는 것만 지움(콜라비 12,400·딸기 25,600), 틀린 가격·모르는 상품·보낸 것은 그대로 ' + JSON.stringify(ids));
console.log(fails.length ? 'XX 공지 상품 나누기 시험 실패:\n- ' + fails.join('\n- ') : '✓ 공지 상품 나누기(긴 줄표)·결제금액 확인 시험 통과');
process.exit(fails.length ? 1 : 0);
