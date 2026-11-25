// (11/25 한 번) 동대문청년 롱패딩 후리스: # 없는 11.23·11.25 방제 → '#택11.2X동대문청년 롱패딩후리스N', 파일 이름은 안 바꿈, 11.24는 그대로  node lphash_test.js <Main.js>
const H = require('./harness'); const vm = require('vm');
const env = H.makeEnv({ main: process.argv[2], props: { OUTBOX_SORTED: '1', OUTBOX_FMT2: '1' } }); const G = k => vm.runInContext(k, env);
const fails = [], ok = (c, m) => { if (!c) fails.push(m); };
const LH = G('LIST_HEADER'), mk = o => LH.map(h => o[h] !== undefined ? o[h] : '');
const D = d => new Date(2026, 10, d);
const run = (d, t, id, n) => mk({ '진행일': D(d), '명단 제목': t + ' (뽀짝오리)', '카톡방': t, '시트ID': 'L1', '진행 상태': '진행중', '요청ID': id, '목표인원': n, '인원': n, '총건수': 10, '캠페인': '롱패딩 후리스', '택대': 'Y' });
env.__ss.sheets['진행목록'] = new H.Sheet('진행목록', [LH.slice(),
  run(25, '택11.25동대문청년 롱패딩 후리스2', '9ynp4el7-3', 2), run(24, '#택11.24 동대문청년 롱패딩 후리스 4', '9ynp4el7-2', 4), run(23, '택11.23동대문청년 롱패딩 후리스4', '9ynp4el7', 4)]);
G("globalThis.__FILES = 0; renameRunFiles_ = function () { __FILES++; return []; }; updatePay_ = function () {}; payRename_ = function () {};");
let e = ''; try { G('lpHash1_()'); } catch (x) { e = String(x.stack || x); }
ok(!e, '오류 ' + e);
const t = id => G('bareTitle_')(G('readRuns_()').filter(x => x['요청ID'] === id)[0]['명단 제목']);
ok(t('9ynp4el7-3') === '#택11.25동대문청년 롱패딩후리스2', '11.25 ' + t('9ynp4el7-3'));
ok(t('9ynp4el7') === '#택11.23동대문청년 롱패딩후리스4', '11.23 ' + t('9ynp4el7'));
ok(t('9ynp4el7-2') === '#택11.24 동대문청년 롱패딩 후리스 4', '11.24 그대로 ' + t('9ynp4el7-2'));
ok(G('__FILES') === 0 && G('globalThis.__NO_FILE_RENAME') === false, '명단 시트·폼 이름은 안 바꿈');
ok(/^✓/.test(env.__props.get('LPHASH1')), '기록 ' + env.__props.get('LPHASH1'));
ok(Number(G('readRuns_()').filter(x => x['요청ID'] === '9ynp4el7-3')[0]['목표인원']) === 2, '목표 2 그대로');

// lpSpace1_: 11.24도 같은 모양
{
  let e2 = ''; try { G('lpSpace1_()'); } catch (x) { e2 = String(x.stack || x); }
  ok(!e2, '오류2 ' + e2);
  ok(t('9ynp4el7-2') === '#택11.24동대문청년 롱패딩후리스4', '11.24 같은 모양 ' + t('9ynp4el7-2'));
  ok(Number(G('readRuns_()').filter(x => x['요청ID'] === '9ynp4el7-2')[0]['목표인원']) === 4, '11.24 목표 4 그대로');
  ok(G('__FILES') === 0, '11.24도 파일 이름 안 바꿈');
  ok(/^✓/.test(env.__props.get('LPSPACE1')), '기록 ' + env.__props.get('LPSPACE1'));
}
console.log(fails.length ? 'XX 롱패딩 # 시험 실패:\n- ' + fails.join('\n- ') : '✓ 롱패딩후리스 방제 # 붙임 시험 통과');
process.exit(fails.length ? 1 : 0);
