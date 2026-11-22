// (11/22) 의뢰서에 별점리뷰가 없는데 AI가 '별점'이라고 본 사진 → 글 다시 묻기, 글 있으면 텍스트  node starfix_test.js <Main.js>
const H = require('./harness'); const vm = require('vm');
const env = H.makeEnv({ main: process.argv[2], props: { OUTBOX_SORTED: '1', OUTBOX_FMT2: '1', GEMINI_KEY: 'x' } }); const G = k => vm.runInContext(k, env);
const fails = [], ok = (c, m) => { if (!c) fails.push(m); };
const LH = G('LIST_HEADER'), mk = o => LH.map(h => o[h] !== undefined ? o[h] : '');
const t0 = new Date(); t0.setHours(0, 0, 0, 0); const day = n => new Date(t0.getTime() + n * 86400000);
env.__ss.sheets['진행목록'] = new H.Sheet('진행목록', [LH.slice(),
  mk({ '진행일': day(-6), '명단 제목': '#택1.1 가짜농장 포기김치 5 (뽀짝오리)', '시트ID': 'SK', '진행 상태': '진행중', '인원': 5, '총건수': 20 }),
  mk({ '진행일': day(-6), '명단 제목': '#1.1 가짜 별점상품 5 (뽀짝오리)', '시트ID': 'SB', '진행 상태': '진행중', '인원': 5, '총건수': 10 })]);
env.__props.set('RV_SK', JSON.stringify({ kind: 'mix', mix: '텍스트리뷰 17, 포토리뷰 3', guide: '' }));
env.__props.set('RV_SB', JSON.stringify({ kind: 'mix', mix: '별점리뷰 5, 텍스트리뷰 5', guide: '' }));
const runsOf = sid => 'readRuns_().filter(function (r) { return r["시트ID"] === "' + sid + '"; })';
ok(G('rvNoStar_("SK", ' + runsOf('SK') + ')') === true, '텍스트·포토만인 의뢰는 별점 없음');
ok(G('rvNoStar_("SB", ' + runsOf('SB') + ')') === false, '별점 있는 의뢰');
ok(G('rvNoStar_("SX", [])') === false, '모르면 false');
// 폴더 흉내
const it = a => { let i = 0; return { hasNext: () => i < a.length, next: () => a[i++] }; };
const moved = [];
const pic = (name, o, written) => { let desc = o ? 'AI ' + JSON.stringify(o) : ''; return { name, written, getName: () => name, getMimeType: () => 'image/jpeg', getDescription: () => desc, setDescription(v) { desc = v; }, desc: () => desc, getBlob: () => ({ w: written, getContentType: () => 'image/jpeg', getBytes: () => [1] }), moveTo(d) { moved.push(name + '→' + d.getName()); d.files.push(this); } }; };
const dir = (name, files) => { const f = { name, files: files || [], kids: [], getName: () => name, getFiles: () => it(f.files.slice()), getFolders: () => it(f.kids), createFolder(n) { const c = dir(n); f.kids.push(c); return c; }, getParents: () => it([]) }; return f; };
const base = { kind: 'review', stars: 5, text: false, photo: false, product: '[가짜농장] 포기김치', site: '쿠팡' };
const a = pic('a.jpeg', base, true), b = pic('b.jpeg', base, false), c = pic('c.jpeg', Object.assign({}, base, { recheck: 1 }), true);
const star = dir('별점 (3개)', [a, b, c]), img = dir('리뷰이미지'); img.kids.push(star);
G('geminiTextAgain_ = function (blob) { return blob.w; }; Utilities.sleep = function () {};');
env.__img = img;
const r = G('rvStarRecheck_(__img, 60000)');
ok(r.moved === 1 && moved.join(',') === 'a.jpeg→텍스트 (0개)', '글 있는 것만 텍스트 ' + JSON.stringify(r) + ' ' + moved.join(','));
ok(/"recheck":1/.test(a.desc()) && /"text":true/.test(a.desc()) && /"recheck":1/.test(b.desc()) && /"text":false/.test(b.desc()), '설명에 recheck 표시');
ok(!moved.some(m => /^c\.jpeg/.test(m)), '이미 다시 물은 건 안 물음');
// starFix1_: 별점 없는 의뢰(SK)만, 업체 안 보낸 것만
moved.length = 0;
const a2 = pic('a2.jpeg', base, true), star2 = dir('별점 (1개)', [a2]), img2 = dir('리뷰이미지'); img2.kids.push(star2);
const a3 = pic('a3.jpeg', base, true), star3 = dir('별점 (1개)', [a3]), img3 = dir('리뷰이미지'); img3.kids.push(star3);
env.__imgs = { IK: img2, IB: img3 };
env.__props.set('RVIMG_SK', 'IK'); env.__props.set('RVIMG_SB', 'IB');
G('DriveApp.getFolderById = function (id) { return __imgs[id]; }; rvCountDirs_ = function () {};');
let e = ''; try { G('starFix1_()'); } catch (x) { e = String(x.stack || x); }
ok(!e, '오류 ' + e);
ok(moved.join(',') === 'a2.jpeg→텍스트 (0개)', '별점 없는 의뢰만 ' + moved.join(','));
ok(/^✓ .*가짜농장 포기김치 1장/.test(String(env.__props.get('STARFIX1'))), '기록 ' + env.__props.get('STARFIX1'));
// 받는 곳·폴더 나누기에도 들어감
const src = require('fs').readFileSync(process.argv[2], 'utf8');
ok(/if \(o\.kind === 'review' && !o\.photo && !o\.text && noStar\)/.test(src) && /if \(c\.noStar\) \{ o\.recheck = 1;/.test(src), '폴더 나누기·받는 곳에 글 다시 묻기');
console.log(fails.length ? 'XX 별점 글 다시 확인 시험 실패:\n- ' + fails.join('\n- ') : '✓ 별점리뷰 없는 의뢰의 별점 사진 → 글 다시 묻기 시험 통과');
process.exit(fails.length ? 1 : 0);
