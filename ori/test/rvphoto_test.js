// 포토리뷰 없는 의뢰(전체 텍스트)는 AI가 포토라고 해도 포토 폴더에 안 넣음 + (한 번) 이미 들어간 것 옮김 (11/16 더호 차량용 거치대)  node rvphoto_test.js <Main.js>
const H = require('./harness'); const vm = require('vm');
const env = H.makeEnv({ main: process.argv[2], props: { OUTBOX_SORTED: '1', OUTBOX_FMT2: '1' } }); const G = k => vm.runInContext(k, env);
const fails = [], ok = (c, m) => { if (!c) fails.push(m); };
const iter = a => { let i = 0; const b = a.slice(); return { hasNext: () => i < b.length, next: () => b[i++] }; };
function folder(name) {
  const f = { name, files: [], dirs: [], trashed: false,
    getName: () => f.name, setName: n => { f.name = n; }, getId: () => 'id_' + f.name, setTrashed: () => { f.trashed = true; },
    getFiles: () => iter(f.files), getFolders: () => iter(f.dirs.filter(d => !d.trashed)),
    createFolder: n => { const d = folder(n); d.parent = f; f.dirs.push(d); return d; } };
  return f;
}
function file(name, desc, parent) {
  const x = { name, desc, parent, getName: () => name, getDescription: () => desc, getMimeType: () => 'image/png',
    moveTo: d => { x.parent.files.splice(x.parent.files.indexOf(x), 1); x.parent = d; d.files.push(x); } };
  parent.files.push(x); return x;
}
const img = folder('리뷰이미지'), ph = img.createFolder('포토 (1개)'), tx = img.createFolder('텍스트 (8개)');
file('a.png', 'AI {"kind":"review","stars":5,"text":true,"photo":true}', ph);
for (let i = 0; i < 8; i++) file('t' + i + '.png', 'AI {"kind":"review","stars":5,"text":true,"photo":false}', tx);
const img2 = folder('리뷰이미지2'), ph2 = img2.createFolder('포토 (2개)');
file('p1.png', 'AI {"kind":"review","photo":true}', ph2); file('p2.png', 'AI {"kind":"review","photo":true}', ph2);
env.DriveApp = { getFolderById: id => ({ IMG1: img, IMG2: img2 })[id] };
const LH = G('LIST_HEADER'), mk = o => LH.map(h => o[h] !== undefined ? o[h] : '');
env.__ss.sheets['진행목록'] = new H.Sheet('진행목록', [LH.slice(),
  mk({ '진행일': new Date(), '명단 제목': '#택11.13 더호 차량용 거치대 3 (뽀짝오리)', '시트ID': 'S1', '진행 상태': '진행중' }),
  mk({ '진행일': new Date(), '명단 제목': '#11.13 포토 의뢰 5 (뽀짝오리)', '시트ID': 'S2', '진행 상태': '진행중' })]);
[['RVIMG_S1', 'IMG1'], ['RV_S1', '{"kind":"text","mix":"","guide":"별점5개 + 자율작성"}'], ['RVIMG_S2', 'IMG2'], ['RV_S2', '{"kind":"photo","mix":"","guide":"사진 첨부"}']].forEach(([k, v]) => env.__props.set(k, v));
ok(G("rvNoPhoto_('S1')") === true && G("rvNoPhoto_('S2')") === false, '포토 없는 의뢰 판단');
let err = ''; try { G('rvPhotoFix1_()'); } catch (e) { err = String(e.stack || e); }
ok(!err, '오류 ' + err);
const live = f => f.dirs.filter(d => !d.trashed);
ok(live(img).map(d => d.name).join('|') === '텍스트 (9개)' && live(img)[0].files.length === 9, '포토 → 텍스트 ' + live(img).map(d => d.name + ':' + d.files.length).join('|'));
ok(ph2.files.length === 2 && !ph2.trashed, '포토 의뢰는 그대로');
ok(/^✓/.test(env.__props.get('RVPHOTOFIX1')) && /거치대 1장/.test(env.__props.get('RVPHOTOFIX1')), '결과 ' + env.__props.get('RVPHOTOFIX1'));
// 실배송 의뢰는 빼고, 한 번 옮긴 것 되돌림 (11/16 하루비 백팩)
const img3 = folder('리뷰이미지3'), tx3 = img3.createFolder('텍스트 (2개)');
file('h1.png', 'AI {"kind":"review","text":true,"photo":true}', tx3); file('h2.png', 'AI {"kind":"review","text":true,"photo":false}', tx3);
const DA = env.DriveApp.getFolderById; env.DriveApp = { getFolderById: id => id === 'IMG3' ? img3 : DA(id) };
env.__ss.sheets['진행목록'].rows.push(mk({ '진행일': new Date(), '명단 제목': '#11.5 실 하루비 가방 백팩 6 (뽀짝오리)', '시트ID': 'S3', '진행 상태': '진행중', '실배송': 'Y' }));
[['RVIMG_S3', 'IMG3'], ['RV_S3', '{"kind":"text","mix":"","guide":"보부상 가방 참고"}']].forEach(([k, v]) => env.__props.set(k, v));
ok(G("rvNoPhoto_('S3')") === false, '실배송은 포토 없는 의뢰로 안 봄');
G('rvPhotoFix2_()');
ok(live(img3).map(d => d.name).sort().join('|') === '텍스트 (1개)|포토 (1개)', '실배송 포토 되돌림 ' + live(img3).map(d => d.name).join('|') + ' ' + env.__props.get('RVPHOTOFIX2'));
ok(live(img).map(d => d.name).join('|') === '텍스트 (9개)', '거치대는 그대로');
const src = require('fs').readFileSync(process.argv[2], 'utf8');
ok(/noPhoto && o\.kind === 'review' && o\.photo\) \{ try \{ if \(geminiPhotoAgain_\(x\.getBlob\(\)\) === false\) o\.photo = false/.test(src), 'AI가 포토라 하면 한 번 더 묻기 (무조건 텍스트 아님)');
// (11/16) 과일쏙 포토리뷰가 텍스트로 감 → 거치대만 빼고 되돌림
const img4 = folder('리뷰이미지4'), tx4 = img4.createFolder('텍스트 (3개)');
file('g1.png', 'AI {"kind":"review","text":true,"photo":true}', tx4); file('g2.png', 'AI {"kind":"review","text":true,"photo":true}', tx4); file('g3.png', 'AI {"kind":"review","text":true,"photo":false}', tx4);
const DB = env.DriveApp.getFolderById; env.DriveApp = { getFolderById: id => id === 'IMG4' ? img4 : DB(id) };
env.__ss.sheets['진행목록'].rows.push(mk({ '진행일': new Date(), '명단 제목': '#택11.4 과일쏙 못난이사과외 10 (뽀짝오리)', '시트ID': 'S4', '진행 상태': '진행중' }));
[['RVIMG_S4', 'IMG4'], ['RV_S4', '{"kind":"text","mix":"","guide":"대표님을 믿습니다."}']].forEach(([k, v]) => env.__props.set(k, v));
G('rvPhotoFix3_()');
ok(live(img4).map(d => d.name).sort().join('|') === '텍스트 (1개)|포토 (2개)', '과일쏙 포토 되돌림 ' + live(img4).map(d => d.name).join('|') + ' ' + env.__props.get('RVPHOTOFIX3'));
ok(live(img).map(d => d.name).join('|') === '텍스트 (9개)', '거치대는 그대로 (사용자 확인)');
console.log(fails.length ? 'XX 포토 없는 의뢰 포토 폴더 시험 실패:\n- ' + fails.join('\n- ') : '✓ 포토 없는 의뢰는 포토 폴더에 안 넣음 시험 통과');
process.exit(fails.length ? 1 : 0);
