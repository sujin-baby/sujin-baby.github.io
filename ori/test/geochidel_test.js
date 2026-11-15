// (11/15 한 번, 사용자 승인) 월급시트 11월 옛 이름 줄 '#택11.5·11.6·11.9 차량용 거치대 3' 지움 (같은 날 '더호' 줄이 있고 수량 같을 때만)  node geochidel_test.js <Main.js>
const H = require('./harness'); const vm = require('vm');
const env = H.makeEnv({ main: process.argv[2], props: { OUTBOX_SORTED: '1', OUTBOX_FMT2: '1' } }); const G = k => vm.runInContext(k, env);
const fails = [], ok = (c, m) => { if (!c) fails.push(m); };
const LH = G('LIST_HEADER'), mk = o => LH.map(h => o[h] !== undefined ? o[h] : '');
env.__ss.sheets['진행목록'] = new H.Sheet('진행목록', [LH.slice(),
  mk({ '진행일': new Date(2026, 10, 13), '명단 제목': '#택11.13 더호 차량용 거치대 3 (뽀짝오리)', '시트ID': 'S1', '목표인원': 3, '인원': 3, '총건수': 21, '진행 상태': '진행중' })]);
//            캠페인명                              11/5 11/6 11/9
const pay = new H.Sheet('11월', [['캠페인명', '11/5', '11/6', '11/9'],
  ['#11.5 실 샤워기거치대 5', 5, '', ''],
  ['#택11.5 차량용 거치대 3', 3, '', ''],
  ['#택11.5 더호 차량용 거치대 3', 3, '', ''],
  ['#택11.6 차량용 거치대 3', '', 3, ''],
  ['#택11.6 더호 차량용 거치대 3', '', 3, ''],
  ['#택11.9 차량용 거치대 3', '', '', 3],
  ['#택11.9 더호 차량용 거치대 3', '', '', 3],
  ['#택11.10 더호 차량용 거치대 3', '', '', '']]);
env.__PAY = pay;
G("payTab_ = function () { return globalThis.__PAY; }; payLayout_ = function () { return { head: 1, name: 1, days: { '11-5': 2, '11-6': 3, '11-9': 4 } }; };");
let err = ''; try { G('geochiDel1_()'); } catch (e) { err = String(e.stack || e); }
ok(!err, '오류 ' + err);
const names = pay.rows.map(r => r[0]);
ok(JSON.stringify(names) === JSON.stringify(['캠페인명', '#11.5 실 샤워기거치대 5', '#택11.5 더호 차량용 거치대 3', '#택11.6 더호 차량용 거치대 3', '#택11.9 더호 차량용 거치대 3', '#택11.10 더호 차량용 거치대 3']), '옛 줄 3개만 지움 ' + JSON.stringify(names));
ok(/^✓/.test(env.__props.get('GEOCHIDEL1')) && /지움 7행,5행,3행/.test(env.__props.get('GEOCHIDEL1')), '결과 ' + env.__props.get('GEOCHIDEL1'));
// 한 번만
pay.rows.push(['#택11.5 차량용 거치대 3', 3, '', '']);
G('geochiDel1_()');
ok(pay.rows.length === 7, '두 번 안 돎');
// 수량이 다르면 안 지움, 진행목록에 옛 이름 진행이 있으면 안 지움
env.__props.delete('GEOCHIDEL1');
pay.rows = [['캠페인명', '11/5', '11/6', '11/9'], ['#택11.5 차량용 거치대 3', 2, '', ''], ['#택11.5 더호 차량용 거치대 3', 3, '', '']];
G('geochiDel1_()');
ok(pay.rows.length === 3 && /실패/.test(env.__props.get('GEOCHIDEL1')) && /수량 다름/.test(env.__props.get('GEOCHIDEL1')), '수량 다르면 안 지움 ' + env.__props.get('GEOCHIDEL1'));
env.__props.delete('GEOCHIDEL1');
pay.rows[1][1] = 3;
env.__ss.sheets['진행목록'].rows.push(mk({ '진행일': new Date(2026, 10, 5), '명단 제목': '#택11.5 차량용 거치대 3 (뽀짝오리)', '시트ID': 'S1', '인원': 3, '진행 상태': '종료' }));
G('geochiDel1_()');
ok(pay.rows.length === 3 && /옛 이름 진행/.test(env.__props.get('GEOCHIDEL1')), '옛 이름 진행이 있으면 안 지움 ' + env.__props.get('GEOCHIDEL1'));
console.log(fails.length ? 'XX 차량용 거치대 옛 줄 지우기 시험 실패:\n- ' + fails.join('\n- ') : '✓ 월급시트 차량용 거치대 옛 이름 중복 줄 지우기 시험 통과');
process.exit(fails.length ? 1 : 0);
