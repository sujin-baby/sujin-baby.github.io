// (11/21) 받는 곳 사진 → 의뢰: 한 의뢰에만 있는 상표(판매처·상품명 첫 낱말)가 먼저, 공지에서 사라진 상품명도 기억  node rvmatch_test.js <Main.js>
const H = require('./harness'); const vm = require('vm');
const env = H.makeEnv({ main: process.argv[2], props: { OUTBOX_SORTED: '1', OUTBOX_FMT2: '1' } }); const G = k => vm.runInContext(k, env);
const fails = [], ok = (c, m) => { if (!c) fails.push(m); };
const match = (prod, camps) => { env.__c = camps; const r = G('rvMatchCamp_(' + JSON.stringify(prod) + ', __c)'); return r ? r.name : null; };
// 1) 11/21 콜라비: 설향딸기외(토스 콜라비, 상품명 첫 낱말 한담원) vs 이름에 콜라비가 든 두 의뢰
const seol = { name: '택 가짜과일 설향딸기외', nameWords: ['가짜과일', '설향딸기'], words: ['가짜과일', '설향딸기', '황금향', '토스', '콜라비', '한담원', '제주', '특상품'], brandWords: ['가짜과일'], headWords: ['한담원', '당도보장'] };
const kA = { name: '택 가짜쏙 콜라비', nameWords: ['가짜쏙', '콜라비'], words: ['가짜쏙', '콜라비', '하루50박스만', '자주곶담', '아삭달콤', '제주', '1박스', '2kg'], brandWords: ['가짜쏙'], headWords: ['하루50박스만'] };
const kB = { name: '택 가짜프레시 콜라비', nameWords: ['가짜프레시', '콜라비'], words: ['가짜프레시', '콜라비', '아삭달큰', '26년', '제주', '3kg'], brandWords: ['가짜프레시'], headWords: ['아삭달큰'] };
ok(match('한담원 제주 콜라비, 특상품, 3kg, 1박스', [seol, kA, kB]) === seol.name, '한담원 콜라비 → 설향딸기외 ' + match('한담원 제주 콜라비, 특상품, 3kg, 1박스', [seol, kA, kB]));
// 상표가 없으면 예전처럼: 이름 낱말 동점 → 모름
ok(match('제주 콜라비 3kg', [seol, kA, kB]) === null || match('제주 콜라비 3kg', [seol, kA, kB]) === kB.name, '상표 없으면 예전 규칙 ' + match('제주 콜라비 3kg', [seol, kA, kB]));
ok(match('아삭달큰 26년 햇 제주 콜라비', [seol, kA, kB]) === kB.name, '가짜프레시 상품 ' + match('아삭달큰 26년 햇 제주 콜라비', [seol, kA, kB]));
// 상품명 첫 낱말은 캡처가 그 말로 시작할 때만 (중간에 있으면 안 셈)
const x1 = { name: '가짜 감귤', nameWords: ['감귤'], words: ['감귤', '한라봉농원'], brandWords: [], headWords: ['한라봉농원'] }, x2 = { name: '가짜 황금향', nameWords: ['황금향'], words: ['황금향'], brandWords: [], headWords: [] };
ok(match('제주 황금향 한라봉농원 선물', [x1, x2]) === x2.name, '첫 낱말 아니면 상표로 안 셈 ' + match('제주 황금향 한라봉농원 선물', [x1, x2]));
// 다른 의뢰 낱말에도 있는 상표는 안 셈 (같은 상품이 두 의뢰에 → 의뢰 이름 낱말, 11/8 시온스)
const s1 = { name: '실 시온스 양모볼외', nameWords: ['시온스', '양모볼'], words: ['시온스', '양모볼', '투온스', '데일리케어', '저주파', '발마사지기', 'EMS'], brandWords: ['시온스'], headWords: ['투온스'] };
const s2 = { name: '시온스 발마사지기', nameWords: ['시온스', '발마사지기'], words: ['시온스', '발마사지기', '투온스', '데일리케어', '저주파', 'EMS'], brandWords: ['시온스'], headWords: ['투온스'] };
ok(match('투온스 데일리케어 저주파 발마사지기 EMS 발매트', [s1, s2]) === s2.name, '11/8 시온스 그대로 ' + match('투온스 데일리케어 저주파 발마사지기 EMS 발매트', [s1, s2]));
// 산지·플랫폼 말은 상표 아님
ok(G("RV_HEAD_STOP.test('제주')") && G("RV_HEAD_STOP.test('국내산')") && !G("RV_HEAD_STOP.test('한담원')"), '상표 아닌 말');
// 2) rvPendingCamps_: 공지가 바뀌어 사라진 상품명도 기억 (RVPRODW_)
const LH = G('LIST_HEADER'), mk = o => LH.map(h => o[h] !== undefined ? o[h] : '');
const t0 = new Date(); t0.setHours(0, 0, 0, 0); const day = n => new Date(t0.getTime() + n * 86400000);
env.__ss.sheets['진행목록'] = new H.Sheet('진행목록', [LH.slice(), mk({ '진행일': day(-3), '명단 제목': '#택1.1 가짜과일 설향딸기외20 (뽀짝오리)', '시트ID': 'SX', '폼ID': 'FX', '진행 상태': '진행중', '인원': 20, '마감 시각': day(-3) })]);
env.__props.set('RVIMG_SX', 'IMGX'); env.__props.set('RVOPTW_SX', JSON.stringify({ d: G("Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyyMMdd')"), w: ['토스', '콜라비'] }));
env.__desc = '🐥판매처 : 가짜과일\n🐥상품명 : 한담원 제주 콜라비 특상품 3kg';
G('rvSentAny_ = function () { return false; }; formDescRead_ = function () { return globalThis.__desc; };');
let c1 = null; try { c1 = G('rvPendingCamps_(readRuns_(), PropertiesService.getScriptProperties())')[0]; } catch (e) { fails.push('오류 ' + (e.stack || e)); }
ok(c1 && c1.headWords.indexOf('한담원') >= 0 && c1.brandWords.indexOf('가짜과일') >= 0, '상표 ' + JSON.stringify(c1 && [c1.brandWords, c1.headWords]));
env.__desc = '🐥판매처 : 가짜과일\n🐥상품명 : [당일수확] 고당도 논산 설향딸기';
let c2 = null; try { c2 = G('rvPendingCamps_(readRuns_(), PropertiesService.getScriptProperties())')[0]; } catch (e) { fails.push('오류2 ' + (e.stack || e)); }
ok(c2 && c2.headWords.indexOf('한담원') >= 0 && c2.words.indexOf('한담원') >= 0 && c2.words.indexOf('설향딸기') >= 0, '공지가 바뀌어도 기억 ' + JSON.stringify(c2 && [c2.words, c2.headWords]));
ok(c2 && c2.headWords.indexOf('고당도') < 0, '수식어(고당도)는 상표 아님 ' + JSON.stringify(c2 && c2.headWords));
// 3) seolKol1_: 모름 폴더의 '한담원 … 콜라비' 사진만 설향딸기외 리뷰이미지 종류 폴더로
{
  const it = a => { let i = 0; return { hasNext: () => i < a.length, next: () => a[i++] }; };
  const moved = [];
  const file = (name, o) => ({ name, getName: () => name, getDescription: () => o ? 'AI ' + JSON.stringify(o) : '', moveTo(d) { moved.push(name + '→' + d.getName()); } });
  const dir = (name, kids) => { const f = { name, kids: kids || [], getName: () => name, getFolders: () => it(f.kids), getParents: () => it([]), createFolder(n) { const c = dir(n); f.kids.push(c); return c; } }; return f; };
  const unk = { getFiles: () => it([file('k1.jpeg', { kind: 'review', photo: true, text: true, product: '한담원 제주 콜라비, 특상품, 3kg' }), file('k2.jpeg', { kind: 'review', photo: false, text: true, product: '한담원 제주 콜라비, 특상품, 3kg' }), file('x.jpeg', { kind: 'review', photo: true, text: true, product: '가짜 귤 3kg' }), file('y.jpeg', null)]) };
  const img = dir('리뷰이미지', [dir('포토 (3개)')]);
  env.__img = img; env.__unk = unk;
  env.__ss.sheets['진행목록'] = new H.Sheet('진행목록', [LH.slice(), mk({ '진행일': day(-3), '명단 제목': '#택1.1 오늘과일 설향딸기외20 (뽀짝오리)', '시트ID': 'SY', '진행 상태': '진행중', '인원': 20 })]);
  env.__props.set('RVIMG_SY', 'IMGY');
  G("rvInbox_ = function () { return { getFoldersByName: function () { var d = [__unk], i = 0; return { hasNext: function () { return i < d.length; }, next: function () { return d[i++]; } }; } }; }; rvCountDirs_ = function () {}; DriveApp.getFolderById = function () { return __img; };");
  let e3 = ''; try { G('seolKol1_()'); } catch (e) { e3 = String(e.stack || e); }
  ok(!e3, '오류3 ' + e3);
  ok(moved.join(',') === 'k1.jpeg→포토 (3개),k2.jpeg→텍스트 (0개)', '옮긴 것 ' + moved.join(','));
  ok(/^✓ .* 2장 → #택1.1 오늘과일 설향딸기외20/.test(String(env.__props.get('SEOLKOL1'))), '기록 ' + env.__props.get('SEOLKOL1'));
}
// 4) 진행 만들 때 그날 공지 상품을 기억: 토스 날(콜라비) → 쿠팡 날(설향딸기·황금향)로 바뀌어도 한담원이 남음
{
  const src = require('fs').readFileSync(process.argv[2], 'utf8');
  ok(/try \{ rvProdRemember_\(ss\.getId\(\), d\.desc\); \}/.test(src), '진행 만들 때 기억');
  G("rvProdRemember_('SZ', '🐥판매처 : 가짜과일\\n🐥상품명 : 한담원 제주 콜라비 특상품 3kg\\n🐥★키워드 : 콜라비')");
  const m = G("rvProdRemember_('SZ', '🐥판매처 : 가짜과일\\n🐥상품명 : [당도보장] 최상brick 고당도 제주 황금향')");
  ok(m.h.indexOf('한담원') >= 0 && m.h.indexOf('최상brick') >= 0 && m.w.indexOf('콜라비') >= 0 && m.w.indexOf('황금향') >= 0 && m.b.indexOf('가짜과일') >= 0, '쌓임 ' + JSON.stringify(m));
  ok(JSON.parse(env.__props.get('RVPRODW_SZ')).h.indexOf('한담원') >= 0, '속성에 저장');
}
console.log(fails.length ? 'XX 받는 곳 사진 의뢰 찾기 시험 실패:\n- ' + fails.join('\n- ') : '✓ 받는 곳 사진: 한 의뢰에만 있는 상표 먼저·사라진 상품명 기억 시험 통과');
process.exit(fails.length ? 1 : 0);
