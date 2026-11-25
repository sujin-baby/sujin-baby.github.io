// (11/25) 포토 폴더에 직접 넣은 사진도 5분 확인(rvLooseCheck_)이 폴더 이름 개수를 다시 셈  node rvcnt_test.js <Main.js>
const H = require('./harness'); const vm = require('vm');
const env = H.makeEnv({ main: process.argv[2] }); const G = k => vm.runInContext(k, env);
const fails = [], ok = (c, m) => { if (!c) fails.push(m); };
// 가짜 드라이브: 리뷰이미지 안에 '포토 (4개)' 폴더, 사진 8장
const img = n => ({ getMimeType: () => 'image/jpeg', getDateCreated: () => new Date(Date.now() - 3600000), getLastUpdated: () => new Date(Date.now() - 3600000) });
const iter = a => { let i = 0; return { hasNext: () => i < a.length, next: () => a[i++] }; };
const photo = { name: '포토 (4개)', files: Array.from({ length: 8 }, img), getName() { return this.name; }, setName(n) { this.name = n; }, getFiles() { return iter(this.files); }, getFolders: () => iter([]), setTrashed() {} };
const root = { getFiles: () => iter([]), getFolders: () => iter([photo]), getId: () => 'IMG1' };
env.__root = root;
G("DriveApp = { getFolderById: function () { return __root; } }; geminiKey_ = function () { return 'k'; }; rvSentAny_ = function () { return false; }; rvCartOf_ = function () { return 1; };");
env.__props.set('RVIMG_S1', 'IMG1');
const LH = G('LIST_HEADER');
env.__runs = [{ '시트ID': 'S1', '진행일': new Date(), '마감 시각': new Date(), '명단 제목': '#11.25 가짜상회 면도기 2' }];
let e = ''; try { G('rvLooseCheck_(__runs)'); } catch (x) { e = String(x.stack || x); }
ok(!e, '오류 ' + e);
ok(photo.name === '포토 (8개)', '포토 폴더 이름 8개로 ' + photo.name);
const src = require('fs').readFileSync(process.argv[2], 'utf8');
ok(/try \{ rvCnt1_\(\); \} catch \(e\) \{\}/.test(src), '한 번 고치기(실버반석) 매번 단계에서');
console.log(fails.length ? 'XX 사진 폴더 개수 시험 실패:\n- ' + fails.join('\n- ') : '✓ 포토 폴더에 직접 넣은 사진도 개수 다시 셈 시험 통과');
process.exit(fails.length ? 1 : 0);
