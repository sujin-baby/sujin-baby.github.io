// (11/10 한 번) 설향딸기외 11.11 지움 (토스도 11.10에 끝, 0명일 때만), 총건수 = 11.9 실제 29 + 11.10 목표 10 = 39  node seoldel_test.js <Main.js>
const H = require('./harness'); const vm = require('vm');
const env = H.makeEnv({ main: process.argv[2], props: { OUTBOX_SORTED: '1', OUTBOX_FMT2: '1' } }); const G = k => vm.runInContext(k, env);
const fails = [], ok = (c, m) => { if (!c) fails.push(m); };
const LH = G('LIST_HEADER'), mk = o => LH.map(h => o[h] !== undefined ? o[h] : '');
const t0 = new Date(); t0.setHours(0, 0, 0, 0); const day = n => new Date(t0.getTime() + n * 86400000);
env.__ss.sheets['진행목록'] = new H.Sheet('진행목록', [LH.slice(),
  mk({ '진행일': day(1), '명단 제목': '#택11.11 오늘과일설향딸기외10 (뽀짝오리)', '카톡방': '#택11.11 오늘과일설향딸기외10', '시트ID': 'S1', '목표인원': 10, '인원': 0, '총건수': 49, '진행 상태': '진행예정', '요청ID': '38b3hmrt-3' }),
  mk({ '진행일': day(0), '명단 제목': '#택11.10 오늘과일 설향딸기외 10 (뽀짝오리)', '카톡방': '#택11.10 오늘과일 설향딸기외 10', '시트ID': 'S1', '목표인원': 10, '인원': 0, '총건수': 49, '진행 상태': '진행중' }),
  mk({ '진행일': day(-1), '명단 제목': '#택11.9 오늘과일 설향딸기외 29 (뽀짝오리)', '시트ID': 'S1', '목표인원': 29, '인원': 29, '총건수': 49, '진행 상태': '진행중' })]);
env.__ss.sheets['보낼메시지'] = new H.Sheet('보낼메시지', [['ID', '보낼 날짜', '종류', '카톡방', '메시지', '보냄 체크'], ['n11', day(1), '방 공지', '#택11.11 오늘과일설향딸기외10', '공지', '대기'], ['n10', day(0), '방 공지', '#택11.10 오늘과일 설향딸기외 10', '공지', '대기']]);
G("updatePay_ = function () { globalThis.__UP = 1; }; CONFIG.PAY_SHEET_ID = '';");
let err = ''; try { G('seol1111Del1_()'); } catch (e) { err = String(e.stack || e); }
ok(!err, '오류 ' + err);
const rr = G('readRuns_()');
ok(rr.length === 2 && !rr.some(r => /11\.11/.test(r['명단 제목'])), '11.11 지움 ' + rr.map(r => r['명단 제목']).join(' / ') + ' ' + env.__props.get('SEOLDEL1'));
ok(rr.every(r => Number(r['총건수']) === 39), '총건수 39 ' + rr.map(r => r['총건수']).join(','));
const ob = env.__ss.sheets['보낼메시지'].rows.slice(1).map(r => r[0]);
ok(ob.indexOf('n11') < 0 && ob.indexOf('n10') >= 0, '11.11 공지만 지움 ' + JSON.stringify(ob));
ok(/^✓/.test(env.__props.get('SEOLDEL1')) && G('__UP') === 1, '결과 ' + env.__props.get('SEOLDEL1'));
// 응답 있으면 안 지움
env.__props.delete('SEOLDEL1');
env.__ss.sheets['진행목록'].rows.splice(1, 0, mk({ '진행일': day(1), '명단 제목': '#택11.11 오늘과일설향딸기외10 (뽀짝오리)', '시트ID': 'S1', '목표인원': 10, '인원': 2, '총건수': 39, '진행 상태': '진행예정' }));
G('seol1111Del1_()');
ok(G('readRuns_()').length === 3 && /응답 2명/.test(env.__props.get('SEOLDEL1')), '응답 있으면 안 지움 ' + env.__props.get('SEOLDEL1'));
console.log(fails.length ? 'XX 11.11 지우기 시험 실패:\n- ' + fails.join('\n- ') : '✓ 설향딸기외 11.11 지우기·총건수 39 시험 통과');
process.exit(fails.length ? 1 : 0);
