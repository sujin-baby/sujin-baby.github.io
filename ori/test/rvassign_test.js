// 리뷰 배정(rvAssign_): 여러 계정으로 산 사람은 별점·텍스트로 몰고, 한 계정인 사람은 포토 먼저 (11/2 사용자 요청)  node rvassign_test.js <Main.js>
const { makeEnv } = require('./harness'); const vm = require('vm');
const env = makeEnv({ main: process.argv[2] }); const G = k => vm.runInContext(k, env);
let t = 0; const it = nick => ({ nick, name: nick + (++t), day: 0, t, opt: '' });
const items = [it('A'), it('A'), it('A'), it('B'), it('B'), it('c'), it('d'), it('e'), it('f'), it('g'), it('h')];
env.__items = items;
G("rvAssign_(__items, [{ label: '포토대기', n: 4 }, { label: '텍스트리뷰', n: 5 }, { label: '별점', n: 2 }], 1)");
const by = {}; items.forEach(x => { (by[x.nick] = by[x.nick] || []).push(x.rv); });
console.log(JSON.stringify(by));
const multiOk = ['A', 'B'].every(n => by[n].every(r => r !== '포토대기') && new Set(by[n]).size === 1);
const singles = ['c', 'd', 'e', 'f', 'g', 'h'].map(n => by[n][0]);
const ok = multiOk && singles.filter(r => r === '포토대기').length === 4 && items.filter(x => x.rv === '텍스트리뷰').length === 5 && items.filter(x => x.rv === '별점').length === 2;
console.log(ok ? '✓ 리뷰 배정(다계정 별점·텍스트, 1계정 포토) 시험 통과' : 'XX 리뷰 배정 시험 실패');
process.exit(ok ? 0 : 1);
