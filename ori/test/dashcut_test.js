// (11/19) 15분 확인 '한눈에' 단계가 170초를 넘겼으면 다시 그리기(130~230초)를 시작하지 않고 다음 확인에서 — 22:35 확인이 6분 제한에 끊긴 것  node dashcut_test.js <Main.js>
const H = require('./harness'); const vm = require('vm');
const env = H.makeEnv({ main: process.argv[2], props: { OUTBOX_SORTED: '1', OUTBOX_FMT2: '1' } }); const G = k => vm.runInContext(k, env); const LH = G('LIST_HEADER');
const fails = [], ok = (c, m) => { if (!c) fails.push(m); };
const mk = o => LH.map(h => o[h] !== undefined ? o[h] : '');
const t0 = new Date(); t0.setHours(0, 0, 0, 0);
env.__ss.sheets['진행목록'] = new H.Sheet('진행목록', [LH.slice(), mk({ '진행일': t0, '명단 제목': '#11.20 귤 5 (뽀짝오리)', '시트ID': 'S1', '진행 상태': '진행중', '인원': 1, '목표인원': 5 })]);
G('globalThis.__ORI_T0 = Date.now() - 200000; globalThis.__DASH_CUT_OK = true;');
let e1 = null; try { G('buildDashboard_(false)'); } catch (e) { e1 = e; }
ok(e1 && e1.cfCut, '늦었으면 다시 그리기 안 하고 cfCut ' + (e1 && (e1.stack || JSON.stringify(e1))));
G('globalThis.__DASH_CUT_OK = false;');
let e2 = null; try { G('buildDashboard_(false)'); } catch (e) { e2 = e; }
ok(!(e2 && e2.cfCut), '한눈에 단계가 아니면(다른 곳에서 부름) 미루지 않음');
console.log(fails.length ? 'XX 한눈에 미루기 시험 실패:\n- ' + fails.join('\n- ') : '✓ 늦은 한눈에 다시 그리기 미루기 시험 통과');
process.exit(fails.length ? 1 : 0);
