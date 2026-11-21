// 진행 중 의뢰 리뷰이미지에 바로 올린 사진도 AI 대기열로 (11/15: 리뷰가 다 확인돼야 나눠서 #택 더호 차량용 거치대 9장이 그대로)  node rvloose_test.js <Main.js>
const H = require('./harness'); const vm = require('vm');
const env = H.makeEnv({ main: process.argv[2], props: { OUTBOX_SORTED: '1', OUTBOX_FMT2: '1' } }); const G = k => vm.runInContext(k, env);
const fails = [], ok = (c, m) => { if (!c) fails.push(m); };
const old = Date.now() - 3600000, fresh = Date.now() - 60000;
const file = t => ({ getMimeType: () => 'image/png', getDateCreated: () => new Date(t), getLastUpdated: () => new Date(t) });
const folder = files => ({ getFiles: () => { let i = 0; return { hasNext: () => i < files.length, next: () => files[i++] }; } });
const folders = { IMG_A: folder([file(old), file(old)]), IMG_B: folder([file(old)]), IMG_C: folder([file(fresh)]), IMG_D: folder([]), IMG_E: folder([file(old)]) };
env.DriveApp = { getFolderById: id => folders[id] };
G('ensureAiQueueTrigger_ = function () { globalThis.__TRIG = (globalThis.__TRIG || 0) + 1; }; late_ = function () { return false; };');
[['GEMINI_KEY', 'AQ.testkey_zzzzzzzzzzzzzzzzzzzzzzzzzz'], ['RVIMG_SA', 'IMG_A'], ['RVIMG_SB', 'IMG_B'], ['RVRPT_SB', '1'], ['RVIMG_SC', 'IMG_C'], ['RVIMG_SD', 'IMG_D'], ['RVIMG_SE', 'IMG_E'], ['RV_SE', '{"kind":"confirm"}']].forEach(([k, v]) => env.__props.set(k, v));
const d = new Date(); d.setHours(0, 0, 0, 0);
const run = (sid, o) => Object.assign({ '시트ID': sid, '진행일': d, '마감 시각': new Date(), '명단 제목': '#' + sid + ' 3', '진행 상태': '진행중', '업체 전송': '' }, o || {});
const runs = [run('SA'), run('SB'), run('SC'), run('SD'), run('SE'), run('SF', { '마감 시각': '' })];
env.__RUNS = runs;
let err = '', added = 0; try { added = G('rvLooseCheck_(__RUNS)'); } catch (e) { err = String(e.stack || e); }
ok(!err, '오류 ' + err);
const q = String(env.__props.get('RVAI_Q') || '').split(',').filter(Boolean);
ok(q.length === 2 && q[0] === 'SA' && q[1] === 'SB', '대기열 = 10분 넘은 사진이 있는 의뢰 (리뷰 끝난 의뢰도, 11/16) ' + JSON.stringify(q));
ok(added === 2 && G('__TRIG') === 1, '1분 연쇄 트리거 ' + added + ' ' + G('typeof __TRIG !== "undefined" ? __TRIG : 0'));
// 1시간 안에는 같은 의뢰를 다시 안 봄, 아직 올리는 중(10분 안)인 의뢰는 다음 확인에서 다시 봄
const at = JSON.parse(env.__props.get('RVLOOSE_AT') || '{}');
ok(at.SA && at.SB && !at.SC && !at.SE, '본 시각 ' + JSON.stringify(Object.keys(at)));
env.__props.set('RVAI_Q', '');
G('rvLooseCheck_(__RUNS)');
ok(!String(env.__props.get('RVAI_Q') || ''), '1시간 안에 다시 안 봄 ' + env.__props.get('RVAI_Q'));
// 업체에 보낸 의뢰는 안 건드림 (11/16 사용자)
env.__props.set('RVLOOSE_AT', '{}');
runs[0]['업체 전송'] = new Date();
G('rvLooseCheck_(__RUNS)');
ok(String(env.__props.get('RVAI_Q') || '').split(',').indexOf('SA') < 0, '업체에 보낸 의뢰는 안 건드림 (11/16 사용자)');
console.log(fails.length ? 'XX 진행 중 리뷰 사진 대기열 시험 실패:\n- ' + fails.join('\n- ') : '✓ 진행 중 리뷰 사진 AI 대기열 시험 통과');
process.exit(fails.length ? 1 : 0);
