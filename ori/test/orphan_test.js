// 진행목록에 없는 폼(adoptOrphanForms_): 응답 없는 옛 폼만 있으면 진행 폼 공지를 안 읽음, 응답 있는 옛 폼은 같은 상품번호 진행 명단 시트로 연결  node orphan_test.js <Main.js>
const H = require('./harness'); const vm = require('vm');
const G = (env, k) => vm.runInContext(k, env);
function run(orphanResp) {
  const env = H.makeEnv({ main: process.argv[2] }); const LH = G(env, 'LIST_HEADER');
  const mk = (o) => LH.map(h => o[h] !== undefined ? o[h] : '');
  const t0 = new Date(); t0.setHours(0,0,0,0);
  env.__ss.sheets['진행목록'] = new H.Sheet('진행목록', [LH.slice(),
    mk({ '진행일': t0, '명단 제목': '#1.1 밴드 10 (뽀짝오리)', '시트ID': 'S1', '폼ID': 'F1', '진행 상태': '진행중', '목표인원': 10 })]);
  const log = { opened: [], dest: [], mail: 0 };
  env.__log = log; env.__orphResp = orphanResp;
  G(env, `
    FormApp.openById = function (id) { globalThis.__log.opened.push(id);
      const desc = id === 'F1' ? '🐥상품 번호: 12345678901' : '🐥상품 번호: 12345678901';
      return { getDescription: function () { return desc; }, getResponses: function () { return id === 'OLD' ? new Array(globalThis.__orphResp).fill({}) : []; },
        getTitle: function () { return '옛 폼'; }, getDestinationId: function () { return 'SX'; },
        setDestination: function (t, sid) { globalThis.__log.dest.push(sid); } }; };
    FormApp.DestinationType = { SPREADSHEET: 'S' };
    MailApp.sendEmail = function () { globalThis.__log.mail++; };
    const file = function (id) { return { getId: function () { return id; }, isTrashed: function () { return false; }, getDateCreated: function () { return new Date(); }, getUrl: function () { return 'u'; } }; };
    const iter = function (a) { let i = 0; return { hasNext: function () { return i < a.length; }, next: function () { return a[i++]; } }; };
    rootFolder_ = function () { return { getFolders: function () { return iter([{ getLastUpdated: function () { return new Date(); }, getFilesByType: function () { return iter([file('F1'), file('OLD')]); } }]); } }; };
    MimeType = { GOOGLE_FORMS: 'f' };
  `);
  G(env, 'adoptOrphanForms_(readRuns_())');
  return log;
}
const a = run(0), b = run(3);
console.log('응답 없음: 연 폼 ' + a.opened.join(',') + ' / 응답 있음: 연 폼 ' + b.opened.join(',') + ', 연결 ' + b.dest.join(','));
const ok = a.opened.join() === 'OLD' && a.dest.length === 0 && b.opened.indexOf('F1') !== -1 && b.dest.join() === 'S1' && b.mail === 1;
console.log(ok ? '✓ 없는 폼 시험 통과' : 'XX 없는 폼 시험 실패');
process.exit(ok ? 0 : 1);
