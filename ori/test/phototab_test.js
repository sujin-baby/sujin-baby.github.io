// (11/17) 📷포토전달 탭: 포토대기 진행마다 업체 포토 받음·리뷰어 전달 체크  node phototab_test.js <Main.js>
const H = require('./harness'); const vm = require('vm');
const env = H.makeEnv({ main: process.argv[2], props: { OUTBOX_SORTED: '1', OUTBOX_FMT2: '1', 'RV_S1': JSON.stringify({ kind: 'mixed', mix: '포토대기 5, 텍스트리뷰 5' }) } }); const G = k => vm.runInContext(k, env);
const fails = [], ok = (c, m) => { if (!c) fails.push(m); };
const LH = G('LIST_HEADER'), mk = o => LH.map(h => o[h] !== undefined ? o[h] : '');
const t0 = new Date(); t0.setHours(0, 0, 0, 0); const day = n => new Date(t0.getTime() + n * 86400000);
const md = d => (d.getMonth() + 1) + '.' + d.getDate();
env.__ss.sheets['진행목록'] = new H.Sheet('진행목록', [LH.slice(),
  mk({ '진행일': day(-3), '명단 제목': '#택' + md(day(-3)) + ' 의성마늘 10 (뽀짝오리)', '시트ID': 'S1', '인원': 10, '목표인원': 10, '포토': '유', '업체': '의성농장', '진행 상태': '진행중' }),
  mk({ '진행일': day(-1), '명단 제목': '#' + md(day(-1)) + ' 실 거치대 5 (뽀짝오리)', '시트ID': 'S2', '인원': 5, '포토': '유', '실배송': 'Y', '진행 상태': '진행중' }),
  mk({ '진행일': day(-1), '명단 제목': '#택' + md(day(-1)) + ' 데이디 대봉감 10 (뽀짝오리)', '시트ID': 'S3', '인원': 10, '포토': '유', '진행 상태': '진행중' }),
  mk({ '진행일': day(-1), '명단 제목': '#' + md(day(-1)) + ' 텍스트만 5 (뽀짝오리)', '시트ID': 'S4', '인원': 5, '포토': '무', '진행 상태': '진행중' })]);
const ob = G('outboxSheet_()');
ob.rows = [['ID', '보낼 날짜', '종류', '방', '메시지', '상태'], ['m1', new Date(), '방 공지', '#택' + md(day(-3)) + ' 의성마늘 10', '🐥리뷰내용 가이드🐥\n\n포토리뷰(5명) : 가 나 다 라 마\n\n텍스트리뷰(5명) : 바 사', '대기']];
let err = ''; try { G('photoTabBuild_(readRuns_(), true)'); } catch (e) { err = String(e.stack || e); }
ok(!err, '오류 ' + err);
const sh = env.__ss.sheets['📷포토전달'] || Object.values(env.__ss.sheets).find(s => /^📷포토전달/.test(s.name));
ok(!!sh, '탭 생김');
const data = sh ? sh.rows.slice(2).filter(r => r[9]) : [];
ok(data.length === 2, '줄 2개(실배송·포토 없음 뺌) ' + JSON.stringify(data.map(r => r[1])));
const garlic = data.find(r => /의성마늘/.test(r[1]));
ok(garlic && garlic[3] === '5건' && /3일째 안 옴/.test(garlic[8]), '의성마늘 포토 5건·3일째 ' + JSON.stringify(garlic));
ok(data[0] && /의성마늘/.test(data[0][1]), '오래된 것 먼저');
// 받음 체크
const row = 3 + data.indexOf(garlic);
const ev = (c, v) => ({ range: Object.assign(sh.getRange(row, c), {}), source: { toast: () => {} } });
sh.getRange(row, 5).setValue(true);
G('photoTabEdit_')(ev(5));
const k = garlic[9];
ok(!!env.__props.get('PHOTOGOT_' + k) && sh.rows[row - 1][5] && sh.rows[row - 1][8] === '받음 → 전달하기', '받음 기록 ' + JSON.stringify(sh.rows[row - 1]));
ok(G('photoLate_(readRuns_()[0], PropertiesService.getScriptProperties())') === false, '받았으면 업체 포토 아직 알림 끔');
sh.getRange(row, 7).setValue(true);
G('photoTabEdit_')(ev(7));
ok(!!env.__props.get('RVSENT_' + k) && sh.rows[row - 1][8] === '전달 끝', '전달 기록');
G('photoTabEdit_')((sh.getRange(row, 7).setValue(false), ev(7)));
ok(!env.__props.get('RVSENT_' + k), '전달 풀면 지움');
if (fails.length) { console.log('✗ ' + fails.join('\n✗ ')); process.exit(1); }
console.log('✓ 포토전달 탭 시험 통과');
