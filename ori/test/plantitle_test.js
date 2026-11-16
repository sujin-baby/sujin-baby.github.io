// (11/16) '실 실' 두 번 / 다음 일차 방제가 1일차(생성기에서 고친 것)를 안 따름  node plantitle_test.js <Main.js>
const H = require('./harness'); const vm = require('vm');
const env = H.makeEnv({ main: process.argv[2], props: { OUTBOX_SORTED: '1', OUTBOX_FMT2: '1' } }); const G = k => vm.runInContext(k, env);
const fails = [], ok = (c, m) => { if (!c) fails.push(m); };
const ws = t => G('withSil_(' + JSON.stringify(t) + ')');
ok(ws('#11.17실 에스지엠컴퍼니문풍지외3') === '#11.17실 에스지엠컴퍼니문풍지외3', '날짜에 붙은 실은 그대로 ' + ws('#11.17실 에스지엠컴퍼니문풍지외3'));
ok(ws('#11.17 실 에스지엠 3') === '#11.17 실 에스지엠 3' && ws('#11.17 에스지엠 3') === '#11.17 실 에스지엠 3', '실 없으면 붙임');
ok(ws('#11.17실/빈 김상사 케이블타이5') === '#11.17실/빈 김상사 케이블타이5', '실/빈 그대로');
ok(ws('#11.17실버반석 3') === '#11.17 실 실버반석 3', '실버반석은 실이 아님');
const pdt = (b, d, t) => G('planDayTitle_(' + [b, d, t].map(x => JSON.stringify(x)).join(',') + ')');
ok(pdt('#11.16 앨비나프레시 황금향 10', '2026-11-17', '#11.17 앨비나프레시 제주황금10') === '#11.17 앨비나프레시 황금향 10', '1일차 방제 따라 ' + pdt('#11.16 앨비나프레시 황금향 10', '2026-11-17', '#11.17 앨비나프레시 제주황금10'));
ok(pdt('#택11.16 오늘과일 설향딸기외 10', '2026-11-18', '#택11.18 오늘과일 설향딸기외 5') === '#택11.18 오늘과일 설향딸기외 5', '끝 숫자는 그날');
// savePlan_: 일정 탭에 1일차 방제 기준으로
env.__ss.sheets['일정'] = new H.Sheet('일정', [G('PLAN_HEAD').slice()]);
const plan = [{ k: 2, date: '2026-11-17', room: '#11.17 앨비나프레시 제주황금10', title: '#11.17 앨비나프레시 제주황금10 (뽀짝오리)', n: 10, c: [] }];
env.__D = { n: 'RQ1', title: '#11.16 앨비나프레시 황금향 10 (뽀짝오리)', room: '#11.16 앨비나프레시 황금향 10', desc: '공지', plan: Buffer.from(JSON.stringify(plan)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_') };
env.Utilities.base64DecodeWebSafe = b => Array.from(Buffer.from(b.replace(/-/g, '+').replace(/_/g, '/'), 'base64')); env.Utilities.newBlob = a => ({ getDataAsString: () => Buffer.from(a).toString('utf8') });
let err = ''; try { G('savePlan_(__D)'); } catch (e) { err = String(e.stack || e); }
ok(!err, '오류 ' + err);
const pr = env.__ss.sheets['일정'].rows[1] || [];
ok(pr[4] === '#11.17 앨비나프레시 황금향 10' && pr[5] === '#11.17 앨비나프레시 황금향 10 (뽀짝오리)', '일정 계획 이름 ' + JSON.stringify([pr[4], pr[5]]));
console.log(fails.length ? 'XX 실 두 번·다음 일차 방제 시험 실패:\n- ' + fails.join('\n- ') : '✓ 실 두 번 안 붙음·다음 일차 방제는 1일차 따라 시험 통과');
process.exit(fails.length ? 1 : 0);
