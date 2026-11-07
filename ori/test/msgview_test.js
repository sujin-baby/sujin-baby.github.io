// 메시지 모아보기 (11/7): 보낼메시지 전부(2행부터) 종류별로, 체크 → 보낼메시지 '보냄', 다시 그린 직후 밀린 줄 체크는 되돌림  node msgview_test.js <Main.js>
const H = require('./harness'); const vm = require('vm');
const env = H.makeEnv({ main: process.argv[2] }); const G = k => vm.runInContext(k, env);
const t0 = new Date(); t0.setHours(0, 0, 0, 0);
const day = n => new Date(t0.getTime() + n * 86400000);
const ob = [['ID', '보낼 날짜', '종류', '카톡방', '메시지', '보냄 체크'],
  ['m1', day(0), '방 공지', '#택11.9 거치대 3', '★★★자정 구매★★★\n거치대 공지', '대기'],
  ['m2', day(1), '방 공지', '#택11.10 사과 5', '사과 공지', '대기'],
  ['m3', day(0), '방 공지', '#택11.6 귤 7', '오늘 보낸 공지', '보냄'],
  ['m3b', day(-1), '방 공지', '#택11.5 귤 7', '어제 날짜 보낸 공지', '보냄'],
  ['m4', day(-5), '방 공지', '#택11.2 감 5', '오래전 보낸 공지', '보냄'],
  ['m5', '포토전달대기', '포토 가이드', '#택11.5 감홍사과외 30', '포토 가이드 글', '대기'],
  ['m6', day(-1), '할 일', '사장님', '[결제금액 확인] 사장님께', '대기'],
  ['m7', day(-9), '페이백 요청', '오리명단방(뽀짝)', '페이백 요청 글', '대기'],
  ['m8', day(0), '새 종류', '어딘가', '처음 보는 종류 글', '대기'],
  ['m9', day(0), '방 공지', '#택11.9 취소된 방', '취소된 공지', '취소'],
  ['m10', day(0), '명단 전달', '오리명단방', '명단 전달 글', '대기'],
];
for (let i = 0; i < 30; i++) ob.push(['n' + i, day(-2), '할 일', '내 할 일', '할 일 ' + i, '대기']);   // 27행 넘게 (피클 수식 판은 27행부터만 읽었음)
env.__ss.sheets['보낼메시지'] = new H.Sheet('보낼메시지', ob);
const view = new H.Sheet('메시지 모아보기', [['피클 수식', '', '', ''], ['x']]);
env.__ss.sheets['메시지 모아보기'] = view;
const fails = [], ok = (c, m) => { if (!c) fails.push(m); };
let err = '';
try { G('msgViewBuild_(false)'); } catch (e) { err = String(e.stack || e); }
ok(!err, '그리기 오류 ' + err);
const ids = () => view.rows.map(r => String(r[0] || ''));
const rowOf = id => ids().indexOf(id) + 1;
const outSt = id => env.__ss.sheets['보낼메시지'].rows.find(r => r[0] === id)[5];
['m1', 'm2', 'm3', 'm5', 'm6', 'm7', 'm8', 'm10', 'n0', 'n29'].forEach(id => ok(rowOf(id) > 0, id + ' 안 보임'));
['m3b', 'm4', 'm9'].forEach(id => ok(rowOf(id) === 0, id + ' 보이면 안 됨'));
ok(rowOf('m1') < rowOf('m2') && rowOf('m2') < rowOf('m3'), '방 공지 순서 (오늘 → 내일 → 보낸 것)');
ok(view.rows[rowOf('m3') - 1][1] === true && view.rows[rowOf('m1') - 1][1] === false, '체크 값');
ok(String(view.rows[rowOf('m5') - 1][2]) === '사진 오면', '포토 날짜 ' + view.rows[rowOf('m5') - 1][2]);
ok(/〔페이백〕/.test(view.rows[rowOf('m7') - 1][3]), '페이백 표시 ' + view.rows[rowOf('m7') - 1][3]);
ok(/〔새 종류〕/.test(view.rows[rowOf('m8') - 1][3]) && rowOf('m8') > rowOf('m7'), '그 밖 종류');
ok(view.rows[rowOf('m1') - 1][4] === '★★★자정 구매★★★\n거치대 공지', '메시지 전체 글');
ok(!view.rows.some(r => r[0] === '피클 수식'), '예전 수식 판 지움');
ok(/안 보낸 것 3[0-9]개/.test(view.rows[0][1]), '제목 ' + view.rows[0][1]);
ok(env.__props.get('MSGV_HIDE1') === '1', '보낼메시지 숨김 표시');
// 바뀐 게 없으면 다시 안 그림
ok(G('msgViewBuild_(false)') === false, '바뀐 게 없는데 다시 그림');
// 체크 → 보냄 (그린 지 20초 지난 뒤)
env.__props.set('MSGV_AT', String(Date.now() - 60000));
const edit = (row, v, col) => { view.cell(row, col || 2)[(col || 2) - 1] = v; G('onAdminEdit')({ range: view.getRange(row, col || 2), source: { toast() {} }, value: String(v) }); };
let r1 = rowOf('m1');
edit(r1, true);
ok(outSt('m1') === '보냄', '체크했는데 보냄 아님: ' + outSt('m1'));
ok(rowOf('m1') === r1, '체크 직후 줄이 움직이면 안 됨');
edit(r1, false);
ok(outSt('m1') === '대기', '체크 풀었는데 대기 아님');
// 지난 날짜(어제) 할 일을 오늘 체크 → 다시 그려도 오늘 안에는 회색으로 남음
const r6 = rowOf('m6'); edit(r6, true);
ok(outSt('m6') === '보냄', '할 일 체크 저장');
G('msgViewBuild_(false)');
ok(rowOf('m6') > 0 && view.rows[rowOf('m6') - 1][1] === true, '오늘 체크한 지난 할 일이 사라짐');
// 다시 그린 직후(20초 안) 다른 메시지가 들어온 줄을 누르면 되돌림
G('PropertiesService.getScriptProperties().deleteProperty("MSGV_SIG")');
env.__ss.sheets['보낼메시지'].rows.splice(1, 0, ['m0', day(0), '방 공지', '#택11.9 새 방 5', '새 공지', '대기']);
G('msgViewBuild_(false)');
ok(rowOf('m0') > 0 && rowOf('m0') <= r1, '새 메시지 위에 들어옴');
const r2 = rowOf('m1');   // 한 줄 밀림. 옛 화면의 m1 자리(r1)는 이제 다른 메시지
const victim = ids()[r1 - 1];
edit(r1, true);
ok(outSt(victim) === '대기', '밀린 줄 체크가 저장됨 (' + victim + ')');
ok(view.rows[r1 - 1][1] === false, '밀린 줄 체크 안 되돌림');
ok(r2 !== r1, '시험 준비 (줄이 안 밀림)');
// 다른 칸을 고치면 원래대로
env.__props.set('MSGV_AT', String(Date.now() - 60000));
const rr = rowOf('m2'); view.cell(rr, 5)[4] = '아무 글';
G('onAdminEdit')({ range: view.getRange(rr, 5), source: { toast() {} }, value: '아무 글' });
ok(view.rows[rowOf('m2') - 1][4] === '사과 공지', '보기 칸 고친 걸 안 되돌림');
// 다른 탭을 고친 실행이 끝나면 새 메시지가 모아보기에 들어옴 (감싼 onAdminEdit)
env.__ss.sheets['블랙리스트'] = new H.Sheet('블랙리스트', [['이름'], ['가']]);
env.__ss.sheets['보낼메시지'].rows.splice(1, 0, ['mz', day(0), '취완', '실 밴드 (전체 3개 방)', '취완 글', '대기']);
G('onAdminEdit')({ range: env.__ss.sheets['블랙리스트'].getRange(2, 1), source: { toast() {} }, value: '가' });
ok(rowOf('mz') > 0, '다른 탭 고친 뒤 새 메시지 안 들어옴');
console.log(fails.length ? 'XX 메시지 모아보기 시험 실패:\n- ' + fails.join('\n- ') : '✓ 메시지 모아보기 시험 통과 (' + view.rows.length + '줄)');
process.exit(fails.length ? 1 : 0);
