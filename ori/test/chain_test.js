const { makeEnv, Sheet } = require('./harness'); const vm = require('vm');
const data = require(require('path').resolve(process.argv[4] || 'all.json'));
for (const main of [process.argv[2], process.argv[3]]) {
  const env = makeEnv({ main }); const G = k => vm.runInContext(k, env); const LH = G('LIST_HEADER');
  const D = s => { const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : s; };
  const list = [LH.slice()];
  // 기대평 진행들은 같은 명단 시트를 다시 썼다고 보고(최악의 경우) 시트ID를 같게
  data.runs.forEach(r => { const o = { '진행일': D(r.day), '명단 제목': r.title, '목표인원': r.target, '인원': r.got, '진행 상태': r.st, '캠페인': r.camp, '일차': r.k, '총건수': r.total, '카톡방': r.room, '요청ID': r.req, '시트ID': /기대평/.test(r.title) ? 'S_EXP' : 'S_' + r.camp + r.req.split('-')[0] }; list.push(LH.map(h => o[h] === undefined ? '' : o[h])); });
  env.__ss.sheets['진행목록'] = new Sheet('진행목록', list);
  const runs = G('readRuns_()'); env.__runs = runs;
  const base = runs.filter(r => r['요청ID'] === 'exp-100-4')[0];
  const ch = vm.runInContext('chainsOf_(__runs)', env).filter(c => c.runs.indexOf(base) >= 0)[0];
  console.log(main.split('/').pop(), '기대평 묶음: total', ch.total, 'done', ch.done, 'runs', ch.runs.map(r => r['요청ID'] + ':' + r['목표인원'] + '/' + r['진행 상태']).join(', '), '→', ch.done >= ch.total ? '건너뜀' : '만듦');
}
