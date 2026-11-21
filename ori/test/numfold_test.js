// (11/21) 이미 만든 명단 시트·폼·폴더 이름에서 끝 인원 숫자 빼기 (numFold1_)  node numfold_test.js <Main.js>
const H = require('./harness'); const vm = require('vm');
const env = H.makeEnv({ main: process.argv[2], props: { OUTBOX_SORTED: '1', OUTBOX_FMT2: '1' } }); const G = k => vm.runInContext(k, env);
const fails = [], ok = (c, m) => { if (!c) fails.push(m); };
const forms = {};
const file = (id, name, mime) => ({ id, name, mime, getId: () => id, getName() { return this.name; }, setName(n) { this.name = n; return this; } });
const it = a => { let i = 0; return { hasNext: () => i < a.length, next: () => a[i++] }; };
const folder = (id, name, files, sub) => ({ id, name, files, sub: sub || [], getId: () => id, getName() { return this.name; }, setName(n) { this.name = n; return this; },
  getFolders() { return it(this.sub); }, getFoldersByName(n) { return it(this.sub.filter(x => x.name === n)); },
  getFilesByType(m) { return it(this.files.filter(x => x.mime === m)); } });
const SH = 'sheet', FM = 'form';
const kri = folder('aaaaaaaaaamqUvHL', '# 실 제이컴퍼니 크리노바5', [file('s1', '# 실 제이컴퍼니 크리노바5', SH), file('f1', '# 실 제이컴퍼니 크리노바5', FM)]);
const bil = folder('aaaaaaaaaaGAxg4R', '#11.11 실 빌랑 흡착장난감 4', [file('s2', '#실 빌랑 흡착장난감 4 (응답)', SH), file('f2', '#실 빌랑 흡착장난감 4', FM)]);
const hand = folder('aaaaaaaaaalj7IWn', '# 도레미 손으로 바꾼 이름', [file('s3', '# 도레미 손으로 바꾼 이름', SH)]);
const other = folder('aaaaaaaaaaZZZZZZ', '# 다른 진행 7', [file('s4', '# 다른 진행 7', SH)]);
const pk = folder('aaaaaaaaaapk0njn', '#택10.14 모두의농수산옥광밤외', [file('s5', '#택 모두의농수산옥광밤외 (응답)', SH), file('s6', '#택10.14 모두의농수산옥광밤외12 (응답)', SH)]);
const nov = folder('m11', '2026년 11월', [], [kri, bil, hand, other]), oct = folder('m10', '2026년 10월', [], [pk]);
const root = folder('root', '오리컴퍼니', [], [nov, oct]);
env.__root = root;
env.MimeType = Object.assign({}, env.MimeType || {}, { GOOGLE_SHEETS: SH, GOOGLE_FORMS: FM });
env.FormApp = Object.assign({}, env.FormApp || {}, { openById: id => forms[id] || (forms[id] = { t: [kri, bil].flatMap(f => f.files).find(x => x.id === id).name, getTitle() { return this.t; }, setTitle(n) { this.t = n; } }) });
G('rootFolder_ = function () { return __root; }');
let err = ''; try { G('numFold1_()'); } catch (e) { err = String(e.stack || e); }
ok(!err, '오류 ' + err);
const P = k => G('PropertiesService.getScriptProperties().getProperty(' + JSON.stringify(k) + ')');
ok(/^✓/.test(P('NUMFOLD1') || ''), '끝 표시 ' + P('NUMFOLD1') + ' | ' + P('NUMFOLD1_LOG'));
ok(kri.name === '# 실 제이컴퍼니 크리노바' && kri.files[0].name === '# 실 제이컴퍼니 크리노바' && kri.files[1].name === '# 실 제이컴퍼니 크리노바' && forms.f1.t === '# 실 제이컴퍼니 크리노바', '크리노바 ' + JSON.stringify([kri.name, kri.files.map(x => x.name), forms.f1 && forms.f1.t]));
ok(bil.name === '#실 빌랑 흡착장난감' && bil.files[0].name === '#실 빌랑 흡착장난감 (응답)' && bil.files[1].name === '#실 빌랑 흡착장난감', '빌랑 (응답) 남김 ' + JSON.stringify([bil.name, bil.files.map(x => x.name)]));
ok(hand.name === '# 도레미 손으로 바꾼 이름' && hand.files[0].name === '# 도레미 손으로 바꾼 이름', '손으로 바꾼 이름은 그대로');
ok(other.name === '# 다른 진행 7' && other.files[0].name === '# 다른 진행 7', '목록에 없는 폴더는 그대로');
ok(pk.name === '#택 모두의농수산옥광밤외' && pk.files[0].name === '#택 모두의농수산옥광밤외 (응답)' && pk.files[1].name === '#택 모두의농수산옥광밤외 (응답)', '옥광밤 ' + JSON.stringify([pk.name, pk.files.map(x => x.name)]));
// 다시 돌려도 아무 일 없음
const before = JSON.stringify([kri.name, bil.name]); G('numFold1_()'); ok(JSON.stringify([kri.name, bil.name]) === before, '두 번째 실행');
console.log(fails.length ? 'XX 이름 끝 숫자 빼기 시험 실패:\n- ' + fails.join('\n- ') : '✓ 이름 끝 숫자 빼기(numFold1_) 시험 통과');
process.exit(fails.length ? 1 : 0);
