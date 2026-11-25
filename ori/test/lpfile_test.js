// (11/25 한 번) 동대문청년 명단 시트·폼·폴더 이름 → '#택 동대문청년 롱패딩후리스' (사용자 예외)  node lpfile_test.js <Main.js>
const H = require('./harness'); const vm = require('vm');
const env = H.makeEnv({ main: process.argv[2] }); const G = k => vm.runInContext(k, env);
const fails = [], ok = (c, m) => { if (!c) fails.push(m); };
const LH = G('LIST_HEADER'), mk = o => LH.map(h => o[h] !== undefined ? o[h] : '');
env.__ss.sheets['진행목록'] = new H.Sheet('진행목록', [LH.slice(), mk({ '진행일': new Date(2026, 10, 23), '명단 제목': '#택11.23동대문청년 롱패딩후리스4 (뽀짝오리)', '시트ID': 'S'.repeat(30), '폼ID': 'F'.repeat(30), '폴더 링크': 'https://drive.google.com/drive/folders/' + 'D'.repeat(30), '요청ID': '9ynp4el7' })]);
const mkf = n => ({ n, getName() { return this.n; }, setName(x) { this.n = x; }, getTitle() { return this.n; }, setTitle(x) { this.n = x; } });
const sheet = mkf('택 동대문청년 롱패딩 후리스'), formF = mkf('택 동대문청년 롱패딩 후리스'), form = mkf('택 동대문청년 롱패딩 후리스'), folder = mkf('택 동대문청년 롱패딩 후리스');
env.__f = { sheet, formF, form, folder };
G("DriveApp = { getFileById: function (id) { return /^S/.test(id) ? __f.sheet : __f.formF; }, getFolderById: function () { return __f.folder; } }; FormApp = { openById: function () { return __f.form; } };");
let e = ''; try { G('lpFile1_()'); } catch (x) { e = String(x.stack || x); }
ok(!e, '오류 ' + e);
ok(sheet.n === '#택 동대문청년 롱패딩후리스' && form.n === '#택 동대문청년 롱패딩후리스' && formF.n === '#택 동대문청년 롱패딩후리스' && folder.n === '#택 동대문청년 롱패딩후리스', '이름 ' + JSON.stringify([sheet.n, form.n, formF.n, folder.n]));
ok(/^✓/.test(env.__props.get('LPFILE1')), '기록 ' + env.__props.get('LPFILE1'));
console.log(fails.length ? 'XX 동대문청년 파일 이름 시험 실패:\n- ' + fails.join('\n- ') : '✓ 동대문청년 명단 시트·폼·폴더 # 시험 통과');
process.exit(fails.length ? 1 : 0);
