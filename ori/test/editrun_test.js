// 폼수정 B1 진행 찾기: 날짜 자릿수(11.05 ↔ 11.5)·띄어쓰기만 달라도 같은 진행 (11/5 피클 인계)  node editrun_test.js <Main.js>
const H = require('./harness'); const vm = require('vm');
const env = H.makeEnv({ main: process.argv[2] }); const G = k => vm.runInContext(k, env); const LH = G('LIST_HEADER');
const mk = o => LH.map(h => o[h] !== undefined ? o[h] : '');
const d = new Date(2026, 10, 5);
env.__ss.sheets['진행목록'] = new H.Sheet('진행목록', [LH.slice(),
  mk({ '진행일': d, '명단 제목': '#택11.5 과일쏙못난이사과외10 (뽀짝오리)', '시트ID': 'S1', '진행 상태': '진행중' }),
  mk({ '진행일': d, '명단 제목': '#택11.5 과일쏙못난이사과외 3 (뽀짝오리)', '시트ID': 'S1', '진행 상태': '진행중' }),
  mk({ '진행일': d, '명단 제목': '#11.12 실 밴드 10 (뽀짝오리)', '시트ID': 'S2', '진행 상태': '진행중' })]);
const tab = new H.Sheet('폼수정', [['진행', '']]);
const find = t => { tab.rows[0][1] = t; const r = G('editRun_')(tab); return r ? r['명단 제목'] : null; };
const fails = [], ok = (c, m) => { if (!c) fails.push(m); };
ok(find('#택11.5 과일쏙못난이사과외10 (뽀짝오리)') === '#택11.5 과일쏙못난이사과외10 (뽀짝오리)', '그대로');
ok(find('#택11.05 과일쏙못난이사과외10 (뽀짝오리)') === '#택11.5 과일쏙못난이사과외10 (뽀짝오리)', '11.05 → 11.5');
ok(find('#택11.05 과일쏙못난이사과외 10 (뽀짝오리)') === '#택11.5 과일쏙못난이사과외10 (뽀짝오리)', '띄어쓰기');
ok(find('#11.12 실 밴드 10 (뽀짝오리)') === '#11.12 실 밴드 10 (뽀짝오리)', '12일');
ok(find('#택11.05 과일쏙못난이사과외 5 (뽀짝오리)') === null, '인원 다르면 다른 진행');
ok(find('') === null || find('') === undefined, '빈칸');
console.log(fails.length ? 'XX 폼수정 진행 찾기 시험 실패: ' + fails.join(', ') : '✓ 폼수정 진행 찾기 시험 통과');
process.exit(fails.length ? 1 : 0);
