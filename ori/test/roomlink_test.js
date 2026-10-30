// 카톡방 링크·썸네일 (보낼 메시지함 [이 방 열기]) node roomlink_test.js <Main.js>
const H = require('./harness'); const vm = require('vm');
const env = H.makeEnv({ main: process.argv[2] }); const G = k => vm.runInContext(k, env); const LH = G('LIST_HEADER');
const mk = (o) => LH.map(h => o[h] !== undefined ? o[h] : '');
env.__ss.sheets['진행목록'] = new H.Sheet('진행목록', [LH.slice(), mk({ '진행일': new Date(2026, 9, 31), '명단 제목': '#10.31 실 거치대 온습도계 10 (뽀짝오리)', '시트ID': 'S9', '폼ID': 'F9', '진행 상태': '진행중' })]);
G("PropertiesService.getScriptProperties().setProperty('THUMB_S9', 'https://thumbnail.coupangcdn.com/x.jpg')");
let ok = true; const t = (name, cond) => { console.log((cond ? 'OK ' : 'XX ') + name); if (!cond) ok = false; };
const s1 = G("saveRoomLink_('#10.31 실 거치대 온습도계 10 (뽀짝오리)', '참여 https://open.kakao.com/o/gAbC123 코드')");
t('오픈채팅 링크 저장 (앞뒤 글자 빼고)', s1.ok && s1.link === 'https://open.kakao.com/o/gAbC123');
t('오픈채팅 링크가 아니면 안 받음', !G("saveRoomLink_('#10.31 실 거치대', 'https://naver.com')").ok);
const ob = G('outboxSheet_()');
ob.rows = [['ID', '보낼 날짜', '종류', '방', '메시지', '상태'], ['m1', new Date(), '방 공지', '#10.31 실 거치대 온습도계 8', '공지', '대기'], ['m2', new Date(), '명단 전달', '오리명단방', '명단', '대기']];
const it = G('outboxItems_()');
t('방제 숫자가 바뀌어도(10→8) 같은 방 링크', it[0].link === 'https://open.kakao.com/o/gAbC123');
t('방 공지 옆 썸네일', it[0].img === 'https://thumbnail.coupangcdn.com/x.jpg');
t('링크 안 넣은 방은 비어 있음', it[1].link === '' && !it[1].img);
console.log(ok ? '✓ 카톡방 링크 시험 통과' : 'XX 실패'); process.exit(ok ? 0 : 1);
