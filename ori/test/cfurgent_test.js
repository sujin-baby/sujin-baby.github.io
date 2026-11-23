// (11/24) 15분 확인: 밀린 단계가 여럿이면 폼 인원·명단 시트·명단 전달 먼저 (리뷰 확인이 가장 오래 밀렸어도)  node cfurgent_test.js <Main.js>
const H = require('./harness'); const vm = require('vm');
const env = H.makeEnv({ main: process.argv[2], props: { OUTBOX_SORTED: '1', OUTBOX_FMT2: '1' } }); const G = k => vm.runInContext(k, env);
const fails = [], ok = (c, m) => { if (!c) fails.push(m); };
G("globalThis.__ORDER = []; cfDo_ = function (S, name) { __ORDER.push(name); return true; }; cfFresh_ = function () { return false; }; soonCheck_ = function () {}; globalThis.__ORI_T0 = Date.now();");
const now = Date.now();
env.__S = { '리뷰 확인': { d: now - 300 * 60000 }, '폼 인원': { d: now - 60 * 60000 }, '명단 시트': { d: now - 50 * 60000 }, '알림': { d: now - 200 * 60000 }, '한눈에': { d: now - 5 * 60000 } };
const list = ['폼 인원', '명단 시트', '알림', '리뷰 확인', '한눈에'].map(n => '{ n: ' + JSON.stringify(n) + ', need: 1, run: function () {} }').join(',');
let e = ''; try { G('cfRun_(__S, [' + list + '])'); } catch (x) { e = String(x.stack || x); }
const o = G('__ORDER');
ok(!e, '오류 ' + e);
ok(o.slice(0, 2).join() === '폼 인원,명단 시트', '사람이 기다리는 단계 먼저 ' + o.join());
ok(o.indexOf('리뷰 확인') < o.indexOf('한눈에') && o.indexOf('알림') < o.indexOf('한눈에'), '그다음은 오래 밀린 순, 안 밀린 건 뒤 ' + o.join());
console.log(fails.length ? 'XX 15분 확인 단계 순서 시험 실패:\n- ' + fails.join('\n- ') : '✓ 15분 확인: 밀렸을 때 폼 인원·명단 시트 먼저 시험 통과');
process.exit(fails.length ? 1 : 0);
