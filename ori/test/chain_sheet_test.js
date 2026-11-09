// 같은 명단 시트인데 캠페인 이름이 중간에 바뀐 진행들 = 한 의뢰 (11/9 '(업체명)황금향외' → '오늘과일 황금향외'로 나뉘어 120건 다 한 뒤 11.10이 또 생김)
const { makeEnv, Sheet } = require('./harness'); const vm = require('vm'), path = require('path');
const env = makeEnv({ main: path.join(__dirname, '..', 'Main.js') }); const G = k => vm.runInContext(k, env); const LH = G('LIST_HEADER');
const rows = [
  ['2026-11-03', '(업체명)황금향외', 40, 40, 1, 'ytyiwjb3'], ['2026-11-04', '(업체명)황금향외', 20, 20, 2, 'ytyiwjb3-2'],
  ['2026-11-05', '오늘과일 황금향외', 20, 20, 1, 'ytyiwjb3-3'], ['2026-11-06', '오늘과일 황금향외', 20, 20, 2, 'ytyiwjb3-4'],
  ['2026-11-09', '오늘과일 황금향외', 20, 20, 3, 'ytyiwjb3-5'],
  ['2026-11-09', '오늘과일 설향딸기외', 30, 29, 1, '38b3hmrt'],
];
const list = [LH.slice()];
rows.forEach(([d, camp, tg, got, k, req]) => { const m = d.split('-'); const o = { '진행일': new Date(+m[0], +m[1] - 1, +m[2]), '명단 제목': '#' + (+m[1]) + '.' + (+m[2]) + ' ' + camp + ' ' + tg, '목표인원': tg, '인원': got, '진행 상태': '진행중', '캠페인': camp, '일차': k, '총건수': 120, '요청ID': req, '시트ID': req.split('-')[0] === 'ytyiwjb3' ? 'S_GOLD' : 'S_BERRY' }; list.push(LH.map(h => o[h] === undefined ? '' : o[h])); });
env.__ss.sheets['진행목록'] = new Sheet('진행목록', list);
env.__runs = G('readRuns_()');
const chains = G('chainsOf_(__runs)');
const gold = chains.filter(c => c.runs.some(r => r['요청ID'] === 'ytyiwjb3'));
let fail = 0; const ok = (c, m) => { console.log((c ? '✓ ' : '✗ ') + m); if (!c) fail++; };
ok(gold.length === 1, '황금향외 진행 5개가 한 묶음 (' + gold.length + '묶음)');
ok(gold[0].runs.length === 5 && gold[0].done === 120 && gold[0].total === 120, '다 한 건수 120/120 → 다음 일차 안 만듦 (' + gold[0].done + '/' + gold[0].total + ')');
const berry = chains.filter(c => c.runs.some(r => r['요청ID'] === '38b3hmrt'))[0];
ok(berry && berry.runs.length === 1 && berry.done === 30, '다른 의뢰(설향딸기외)는 따로');
if (fail) { console.error(fail + '개 실패'); process.exit(1); }
console.log('✓ 명단 시트 묶음 시험 통과');
