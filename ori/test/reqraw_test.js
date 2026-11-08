// 처음 붙여넣은 의뢰서 (11/8): 생성기가 조각으로 보냄 → 다 모이면 파일로 저장 → 메시지 탭 F칸(리뷰 부분)·메모(전체)  node reqraw_test.js <Main.js>
const H = require('./harness'); const vm = require('vm');
const env = H.makeEnv({ main: process.argv[2] }); const G = k => vm.runInContext(k, env); const LH = G('LIST_HEADER');
// 캐시 getAll·드라이브 폴더/파일 흉내
const store = new Map();
env.CacheService.getScriptCache = () => ({ get: k => store.has(k) ? store.get(k) : null, put: (k, v) => store.set(k, v), getAll: ks => Object.fromEntries(ks.filter(k => store.has(k)).map(k => [k, store.get(k)])), remove: k => store.delete(k) });
const files = {}; let fid = 0;
const folder = { getFilesByName: n => { const f = Object.values(files).find(x => x.name === n); return { hasNext: () => !!f, next: () => f }; }, createFile: (n, t) => { const id = 'F' + (++fid); files[id] = { name: n, t, getId: () => id, getBlob: () => ({ getDataAsString: () => t }) }; return files[id]; } };
env.__folder = folder; env.__files = files;
G("rootFolder_ = function () { return { getFoldersByName: function () { return { hasNext: function () { return true; }, next: function () { return globalThis.__folder; } }; } }; }; DriveApp.getFileById = function (id) { return globalThis.__files[id]; }; MimeType = { PLAIN_TEXT: 'text/plain' };");
const raw = '#입금대행 데이디 미니사과 30\n상품명: 미니사과 2kg\n리뷰: 포토리뷰 18명 / 텍스트리뷰 12명\n키워드: 미니사과\n주의: 광고 상품 구매 금지';
const parts = [raw.slice(0, 40), raw.slice(40)];
const fails = [], ok = (c, m) => { if (!c) fails.push(m); };
const r0 = G('reqRawSave_')({ n: 'abcd1234', i: 0, of: 2, t: parts[0] });
ok(r0 === 'ok', '첫 조각 ' + r0);
const r1 = G('reqRawSave_')({ n: 'abcd1234', i: 1, of: 2, t: parts[1] });
ok(r1 === 'saved', '다 모임 ' + r1);
ok(G('reqRawSave_')({ n: 'bad id!', i: 0, of: 1, t: 'x' }) === 'bad', '이상한 번호 막기');
store.clear();   // 캐시가 비어도 파일에서
ok(G('reqRawOf_')('abcd1234') === raw, '원문 다시 읽기');
const mk = o => LH.map(h => o[h] !== undefined ? o[h] : '');
env.__ss.sheets['진행목록'] = new H.Sheet('진행목록', [LH.slice(),
  mk({ '진행일': new Date(2026, 10, 2), '명단 제목': '#택11.2 데이디 미니사과 30 (뽀짝오리)', '카톡방': '#택11.2 데이디 미니사과 30', '시트ID': 'S7', '요청ID': 'abcd1234' }),
  mk({ '진행일': new Date(2026, 10, 3), '명단 제목': '#택11.3 데이디 미니사과 30 (뽀짝오리)', '카톡방': '#택11.3 데이디 미니사과 30', '시트ID': 'S7', '요청ID': 'next-S7-2026-11-03' })]);
env.__ctx = { runs: G('readRuns_()'), all: {} };
ok(G('runNonceOf_(__ctx.runs)') === 'abcd1234', '요청ID 찾기');
const info = G("msgvReqInfo_(['m1', '', '포토 가이드', '#택11.3 데이디 미니사과 30', '포토 가이드 글', '대기'], __ctx)");
ok(info && /포토리뷰 18명/.test(info.f) && /키워드/.test(info.f) && !/광고/.test(info.f), 'F칸 리뷰 부분 ' + (info && info.f));
ok(info && info.note === raw, '메모 전체');
const none = G("msgvReqInfo_(['m2', '', '리뷰 독촉', '#11.9 없는 방', '독촉', '대기'], __ctx)");
ok(none === null, '모르는 방은 비움');
console.log(fails.length ? 'XX 의뢰서 원문 시험 실패:\n- ' + fails.join('\n- ') : '✓ 의뢰서 원문 시험 통과 (조각 저장 → F칸·메모)');
process.exit(fails.length ? 1 : 0);
