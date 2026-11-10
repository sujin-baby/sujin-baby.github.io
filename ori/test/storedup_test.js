// 스중불가 (11/10): 더호컴퍼니 = 앨비나프레시. 같은 업체 다른 진행·앞 날 명단에 같은 계정주(전화·주소·아이디)가 있으면 할 일. 다른 업체는 안 봄  node storedup_test.js <Main.js>
const H = require('./harness'); const vm = require('vm');
const env = H.makeEnv({ main: process.argv[2], props: { OUTBOX_SORTED: '1', OUTBOX_FMT2: '1' } }); const G = k => vm.runInContext(k, env);
const fails = [], ok = (c, m) => { if (!c) fails.push(m); };
const LH = G('LIST_HEADER'), mk = o => LH.map(h => o[h] !== undefined ? o[h] : '');
const t0 = new Date(); t0.setHours(0, 0, 0, 0); const at = (d, h) => new Date(t0.getTime() + d * 86400000 + h * 3600000);
env.__ss.sheets['진행목록'] = new H.Sheet('진행목록', [LH.slice(),
  mk({ '진행일': at(0, 0), '명단 제목': '#택11.10 앨비나프레시 설향딸기20 (뽀짝오리)', '시트ID': 'S2', '업체': '앨비나프레시', '인원': 2 }),
  mk({ '진행일': at(-4, 0), '명단 제목': '#택11.6 차량용 거치대 3 (뽀짝오리)', '시트ID': 'S1', '업체': '더호컴퍼니', '인원': 3 }),
  mk({ '진행일': at(-3, 0), '명단 제목': '#택11.7 오늘과일 귤 5 (뽀짝오리)', '시트ID': 'S3', '업체': '오늘과일', '인원': 1 })]);
const HD = ['타임스탬프', '계정명(수령인)', '아이디', '전화번호', '주소'];
const sheet = rows => { const s = new H.Sheet('명단', [['x'], HD].concat(rows)); Object.getPrototypeOf(s.getRange(1, 1)).getNotes = function () { return this.getValues().map(r => r.map(() => '')); }; return s; };
const S1 = sheet([[at(-4, 1), '김가나', 'kim1', '010-1111-2222', '서울시 강남구 1'], [at(-4, 2), '박다라', 'park', '010-3333-4444', '부산시 해운대구 2']]);
const S2 = sheet([[at(0, 1), '김가나B', 'kim2', '01011112222', '경기도 수원시 9'], [at(0, 2), '최마바', 'choi', '010-5555-6666', '대구시 중구 3']]);
const S3 = sheet([[at(-3, 1), '최마바', 'choi', '010-5555-6666', '대구시 중구 3']]);
env.__SH = { S1, S2, S3 };
G("(function () { const o = SpreadsheetApp.openById; SpreadsheetApp.openById = function (id) { const s = globalThis.__SH[id]; return s ? { getId: function () { return id; }, getSheetByName: function (n) { return n === LIST_TAB ? s : null; } } : o(id); }; })()");
env.__ss.sheets['보낼메시지'] = new H.Sheet('보낼메시지', [['ID', '보낼 날짜', '종류', '카톡방', '메시지', '보냄 체크']]);
const msgs = () => env.__ss.sheets['보낼메시지'].rows.slice(1).filter(r => r[0]).map(r => r[4]);
// 1) 새 응답 2명 (S2): 김가나B는 다른 계정이지만 전화가 S1 김가나와 같음 → 할 일. 최마바는 오늘과일(다른 업체)에만 있음 → 아님
const add = S2.rows.slice(2).map(r => ({ t: r[0].getTime(), o: { '타임스탬프': r[0], '계정명(수령인)': r[1], '아이디': r[2], '전화번호': r[3], '주소': r[4] } }));
env.__ADD = add; env.__SS2 = { getId: () => 'S2' };
let err = ''; try { G('storeDupCheck_(__SS2, __ADD)'); } catch (e) { err = String(e.stack || e); }
ok(!err, '오류 ' + err);
ok(msgs().length === 1 && /\[스중불가 중복\] 더호컴퍼니·앨비나프레시/.test(msgs()[0]) && /김가나B .*↔ 차량용 거치대 .* 김가나 · 전화 같음/.test(msgs()[0]) && !/최마바/.test(msgs()[0]), '할 일 ' + JSON.stringify(msgs()));
// 2) 다른 업체 진행 응답은 안 봄
env.__SS3 = { getId: () => 'S3' };
G('storeDupCheck_(__SS3, [{ t: 1, o: { "전화번호": "010-1111-2222" } }])');
ok(msgs().length === 1, '다른 업체는 안 봄');
// 3) 한 번 훑기: 최근 14일 묶음 명단에서 중복
env.__ss.sheets['보낼메시지'] = new H.Sheet('보낼메시지', [['ID', '보낼 날짜', '종류', '카톡방', '메시지', '보냄 체크']]);
G('storeDupScan1_()');
ok(msgs().length === 1 && /김가나B/.test(msgs()[0]) && /✓/.test(env.__props.get('SDUPSCAN1')), '훑기 ' + JSON.stringify(msgs()) + ' ' + env.__props.get('SDUPSCAN1'));
ok(/중복 1/.test(env.__props.get('SDUPSCAN1')), '결과 ' + env.__props.get('SDUPSCAN1'));
console.log(fails.length ? 'XX 스중불가 중복 시험 실패:\n- ' + fails.join('\n- ') : '✓ 스중불가(같은 업체 다른 진행·계정주 같음) 중복 시험 통과');
process.exit(fails.length ? 1 : 0);
