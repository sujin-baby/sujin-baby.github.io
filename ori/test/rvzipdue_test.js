// (11/25) 다 끝난 의뢰 사진 폴더 다시 훑기는 한 시간에 한 번 (받는 곳에서 사진이 들어오면 바로)  node rvzipdue_test.js <Main.js>
const H = require('./harness'); const vm = require('vm');
const env = H.makeEnv({ main: process.argv[2] }); const G = k => vm.runInContext(k, env);
const fails = [], ok = (c, m) => { if (!c) fails.push(m); };
const now = Date.now();
env.__at = { S1: now - 10 * 60000, S2: now - 61 * 60000 };
const due = sid => G('rvZipDue_(' + JSON.stringify(sid) + ', PropertiesService.getScriptProperties(), __at, ' + now + ')');
ok(due('S1') === false, '10분 전에 훑었으면 안 함');
ok(due('S2') === true, '한 시간 지났으면 함');
ok(due('S3') === true, '처음이면 함');
env.__props.set('RVZIPSOON_S1', String(now));
ok(due('S1') === true, '받는 곳에서 사진이 들어왔으면 바로');
const src = require('fs').readFileSync(process.argv[2], 'utf8');
ok(/if \(!rvZipDue_\(sid, props, zipAt, Date\.now\(\)\)\) return;/.test(src) && /zipAt\[sid\] = Date\.now\(\); saveZipAt\(\);/.test(src), '리뷰 확인 빠른 길에 연결');
ok(G('rvGoneErr_("입력한 ID에 해당하는 항목이 없습니다. 이 항목을 수정하지 않았거나 액세스 권한이 없기 때문일 수 있습니다.")') === true && G('rvGoneErr_("Service error: Drive")') === false, '못 여는 명단 시트 오류 알아봄 (일시 오류는 아님)');
ok(/if \(Date\.now\(\) - Number\(rvGone\[sid\] \|\| 0\) < 86400000\) return;/.test(src), '못 여는 시트는 하루 한 번만 다시 봄');
console.log(fails.length ? 'XX 사진 폴더 다시 훑기 시험 실패:\n- ' + fails.join('\n- ') : '✓ 다 끝난 의뢰 사진 폴더 다시 훑기 한 시간에 한 번 시험 통과');
process.exit(fails.length ? 1 : 0);
