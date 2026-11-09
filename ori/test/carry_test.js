// (11/9 한 번) 설향딸기외 1명 하루 미룸: 11.9 목표 29, 11.10 목표 31, 다른 진행은 그대로  node carry_test.js <Main.js>
const H = require('./harness'); const vm = require('vm');
const env = H.makeEnv({ main: process.argv[2], props: { OUTBOX_SORTED: '1', OUTBOX_FMT2: '1' } }); const G = k => vm.runInContext(k, env);
const fails = [], ok = (c, m) => { if (!c) fails.push(m); };
const LH = G('LIST_HEADER'), mk = o => LH.map(h => o[h] !== undefined ? o[h] : '');
env.__ss.sheets['진행목록'] = new H.Sheet('진행목록', [LH.slice(),
  mk({ '진행일': new Date(2026, 10, 10), '명단 제목': '#택11.10 오늘과일 설향딸기외 30 (뽀짝오리)', '시트ID': 'S1', '목표인원': 30, '총건수': 120 }),
  mk({ '진행일': new Date(2026, 10, 11), '명단 제목': '#택11.11 오늘과일설향딸기외20 (뽀짝오리)', '시트ID': 'S1', '목표인원': 20, '총건수': 120 }),
  mk({ '진행일': new Date(2026, 10, 9), '명단 제목': '#택11.9 오늘과일 설향딸기외 30 (뽀짝오리)', '시트ID': 'S1', '목표인원': 30, '인원': 29, '총건수': 120 }),
  mk({ '진행일': new Date(2026, 10, 10), '명단 제목': '#택11.10 다른것 30 (뽀짝오리)', '시트ID': 'S2', '목표인원': 30, '총건수': 30 })]);
let err = ''; try { G('carrySeol1_()'); } catch (e) { err = String(e.stack || e); }
ok(!err, '오류 ' + err);
const t = () => G('readRuns_()').map(r => String(r['명단 제목']).slice(0, 12) + ':' + r['목표인원']).join(' / ');
const by = n => G('readRuns_()').filter(r => String(r['명단 제목']).indexOf(n) === 0)[0];
ok(Number(by('#택11.9 ')['목표인원']) === 29 && Number(by('#택11.10 오늘')['목표인원']) === 31, '11.9→29, 11.10→31 ' + t());
ok(Number(by('#택11.11')['목표인원']) === 20 && Number(by('#택11.10 다른')['목표인원']) === 30, '다른 진행은 그대로 ' + t());
ok(/^✓/.test(env.__props.get('CARRYSEOL1')), '결과 기록 ' + env.__props.get('CARRYSEOL1'));
G("PropertiesService.getScriptProperties().deleteProperty('CARRYSEOL1')"); G('carrySeol1_()');
ok(/이미 29·31/.test(env.__props.get('CARRYSEOL1')), '두 번째는 이미 바뀜 ' + env.__props.get('CARRYSEOL1'));
ok(Number(by('#택11.9 ')['목표인원']) === 29 && Number(by('#택11.10 오늘')['목표인원']) === 31, '두 번 돌아도 그대로 ' + t());
console.log(fails.length ? 'XX 하루 미룸 시험 실패:\n- ' + fails.join('\n- ') : '✓ 설향딸기외 1명 하루 미룸 시험 통과');
process.exit(fails.length ? 1 : 0);
