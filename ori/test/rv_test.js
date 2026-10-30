// 한눈에 '리뷰 취합할 것': 체크 저장(편집 트리거), 다시 그릴 때 체크 살리기, 리뷰 다 된 방 목록
//  node rv_test.js <Main.js> <diag all.json>
const { makeEnv, Sheet } = require('./harness'); const vm = require('vm');
const data = require(require('path').resolve(process.argv[3] || 'all.json'));
const D = s => { const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : s; };
function setup() {
  const props = {}; (data.props.rvKeys || []).forEach(k => { props[k] = '1'; });
  props.DASH_RV = JSON.stringify({ 36: { type: 'day', title: '# 10.15 고구마말랭이 10' } });
  const env = makeEnv({ main: process.argv[2], props }); const G = k => vm.runInContext(k, env); const LH = G('LIST_HEADER');
  const list = [LH.slice()];
  data.runs.forEach(r => { const o = { '진행일': D(r.day), '명단 제목': r.title, '목표인원': r.target, '인원': r.got, '진행 상태': r.st, '캠페인': r.camp, '일차': r.k, '총건수': r.total, '카톡방': r.room, '요청ID': r.req, '시트ID': /고구마/.test(r.title) ? 'SWEET' : (r.k ? 'S' + r.row : '') }; list.push(LH.map(h => o[h] === undefined ? '' : o[h])); });
  env.__ss.sheets['진행목록'] = new Sheet('진행목록', list);
  const dash = []; for (let i = 0; i < 40; i++) dash.push(['', '']); dash[35] = [true, '# 10.15 고구마말랭이 10'];   // 사용자가 체크한 상태
  env.__ss.sheets['한눈에'] = new Sheet('한눈에', dash);
  return { env, G };
}
const rvOf = (env, G, t) => { const LH = G('LIST_HEADER'), c = LH.indexOf('리뷰 취합'); const row = env.__ss.sheets['진행목록'].rows.find(r => String(r[LH.indexOf('명단 제목')]).indexOf(t) === 0); return row && row[c]; };
// 1) 편집 트리거로 체크
{ const { env, G } = setup(); const dash = env.__ss.sheets['한눈에'];
  env.__ev = { range: dash.getRange(36, 1), value: 'TRUE', source: { toast: () => {} } };
  G('onAdminEdit(__ev)');
  const v = rvOf(env, G, '# 10.15 고구마말랭이'); console.log('1) 편집 트리거 체크 → 리뷰 취합 =', v instanceof Date ? v.toDateString() : JSON.stringify(v), '| C열 =', JSON.stringify(dash.rows[35][2])); }
// 2) 다시 그리기 전에 체크 살리기
{ const { env, G } = setup();
  try { G('syncRvChecks_(adminSs_(), readRuns_(), PropertiesService.getScriptProperties())'); } catch (e) { console.log('2) syncRvChecks_ 없음:', e.message); }
  const v = rvOf(env, G, '# 10.15 고구마말랭이'); console.log('2) 다시 그릴 때 → 리뷰 취합 =', v instanceof Date ? v.toDateString() : JSON.stringify(v)); }
// 3) 리뷰가 다 확인된 방 목록
{ const { env, G } = setup();
  const items = G('rvItems_(readRuns_(), PropertiesService.getScriptProperties())'); console.log('3) 리뷰 취합할 것:', items.map(i => i.label + (i.at ? ' (' + i.at + ')' : '')).join(' / ')); }
