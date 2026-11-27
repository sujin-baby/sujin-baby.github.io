// (11/27 한 번) AI가 못 읽음 폴더 사진 → 리뷰이미지 텍스트 폴더, 개수 다시, 보고 글 다시 표시  node jinitxt_test.js <Main.js>
const H = require('./harness'); const vm = require('vm');
const env = H.makeEnv({ main: process.argv[2] }); const G = k => vm.runInContext(k, env);
const fails = [], ok = (c, m) => { if (!c) fails.push(m); };
const LH = G('LIST_HEADER'), mk = o => LH.map(h => o[h] !== undefined ? o[h] : '');
env.__ss.sheets['진행목록'] = new H.Sheet('진행목록', [LH.slice(), mk({ '진행일': new Date(2026, 10, 17), '명단 제목': '업)택11.17지니네농수산 돌게외20 (뽀짝오리)', '시트ID': 'J1', '진행 상태': '진행중' })]);
env.__props.set('RVIMG_J1', 'IMG');
const iter = a => { let i = 0; return { hasNext: () => i < a.length, next: () => a[i++] }; };
const mkFolder = (name, files, sub) => ({ name, files: files || [], sub: sub || [], getName() { return this.name; }, setName(n) { this.name = n; }, getFiles() { return iter(this.files.slice()); }, getFolders() { return iter(this.sub.slice()); }, getFoldersByName(n) { return iter(this.sub.filter(f => f.name === n)); }, createFolder(n) { const f = mkFolder(n); this.sub.push(f); return f; }, setTrashed() {} });
const txt = mkFolder('텍스트만 (9명)', Array.from({ length: 9 }, () => ({ getMimeType: () => 'image/png' })));
const img = mkFolder('리뷰이미지', [], [txt]);
const shot = { getName: () => '스크린샷.png', getMimeType: () => 'image/png', moveTo(f) { fail.files = fail.files.filter(x => x !== shot); f.files.push(shot); }, setDescription() {} };
const fail = mkFolder('AI가 못 읽음 (압축 제외)', [shot]);
const parent = mkFolder('업)택 지니네농수산 돌게외', [], [fail, img]);
img.getParents = () => iter([parent]);
env.__img = img;
G("DriveApp = { getFolderById: function () { return __img; } }; rvCartOf_ = function () { return 1; };");
let e = ''; try { G('jiniTxt1_()'); } catch (x) { e = String(x.stack || x); }
ok(!e, '오류 ' + e);
ok(txt.files.length === 10 && fail.files.length === 0, '텍스트 폴더로 옮김 ' + txt.files.length);
ok(txt.name === '텍스트 (10개)', '개수 다시 ' + txt.name);
ok(!!env.__props.get('RVZIPSOON_J1'), '리뷰 보고 글 다시 표시');
ok(/^✓/.test(env.__props.get('JINITXT1')), '기록 ' + env.__props.get('JINITXT1'));
console.log(fails.length ? 'XX 못 읽음 → 텍스트 시험 실패:\n- ' + fails.join('\n- ') : '✓ AI가 못 읽음 사진 텍스트로 옮김 시험 통과');
process.exit(fails.length ? 1 : 0);
