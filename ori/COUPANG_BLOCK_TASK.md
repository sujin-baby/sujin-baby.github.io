# 쿠팡 '요청하신 페이지의 사용권한이 없습니다' 차단 — 맥에서 도는 Claude에게 (10/31)

클라우드 Claude는 규칙상 쿠팡에 접속 못 해서 직접 못 봄. 사용자 맥(크롬)에서 직접 확인·수정 부탁.

## 증상
- 10/30까지 생성기 [자동 가져오기]가 잘 됨. 10/31부터 쿠팡 상품 탭이 열리자마자 '요청하신 페이지의 사용권한이 없습니다. Ref: …' (Akamai 차단 화면).
- 사용자: 오늘 여러 번 시도하지 않았음. 서드파티 쿠키 허용함. 확장 1.5.7 설치함, 생성기 v136에서도 막힘.
- 예: 의뢰서 URL `https://link.coupang.com/a/ifs285AXwO` (홍시용 대봉감, 상품번호 9796919905).

## 10/31에 바뀐 것 (의심 순서)
1. 확장 `ori/ext/bg.js` 1.5.1~1.5.7: 탭을 `active: true`로 열기, 차단 시 새로고침 재시도, 검색 페이지 자동 넘기기 등. (10/30까지는 1.5.0, `active: false`)
2. 생성기 v129~v131: `rel="noreferrer"`, link.coupang → m.coupang 직통 변환(아이폰만), v130 `?kw=&pr=&fn=` 주소 붙이기 → v136에서 PC는 되돌림(#kw=만).
3. 확장 `page.js`/`oy.js` 읽기 코드 변경.

## ✅ 10/31 밤 확인 결과 (사용자)
- **확장 끄고 주소 직접 입력해도 막힘** → 코드 문제 아님.
- **jinleeda1 크롬 프로필에서만 막히고, sujinlee9704 프로필에서는 열림** → jinleeda1 프로필의 쿠팡 쿠키·사이트 데이터(Akamai가 찍어 둔 값)나 그 프로필의 다른 확장이 원인.
- 조치: jinleeda1 프로필에서 `chrome://settings/content/all` → coupang 검색 → 데이터 전부 삭제, 그 프로필의 다른 확장 끄고 다시.

## ✅ 10/31 밤 추가 확인
- **jinleeda1 크롬 프로필**: 쿠팡에서 생수 검색만 해도 '사용권한 없음'. 쿠팡 사이트 데이터 지워도, 와이파이·핫스팟 둘 다 막힘.
- **sujinlee9704 프로필**: 같은 맥·같은 인터넷에서 상품 9796919905 포함 다 열림.
- → 인터넷·코드 문제 아님. **jinleeda1 프로필 자체**(그 프로필에만 깔린 확장, 설정, 실험 기능, 자동화 흔적 등)가 원인.
- **디버깅은 꼭 jinleeda1 프로필에서** (sujinlee9704는 정상이라 비교 대상일 뿐). 볼 것: 두 프로필 `chrome://extensions` 비교(특히 debugger·tabs·모든 사이트 권한 확장, 자동화 확장), `chrome://settings/privacy`(쿠키·추적 방지·보안 수준), `chrome://flags` 바뀐 것, `chrome://version` 명령줄. 못 찾으면 jinleeda1로 **새 크롬 프로필**을 만들어 확장만 깔고 쿠팡 열어 보기.

## ❌ (정정) 10/31 20:30 Claude 디버깅 — 실제로는 sujinlee9704 프로필이었음
- **정정(사용자 확인)**: 아이템스카우트는 sujinlee9704에만 있음 → Claude in Chrome이 연결된 크롬은 jinleeda1이 아니라 sujinlee9704. 아래 "아이템스카우트가 원인" 결론은 **틀림**. jinleeda1 조사는 아직 안 됨.
- 참고: sujinlee9704에서도 Claude in Chrome(자동 조작)으로 연 쿠팡 탭은 막힘 → 자동화 도구로 쿠팡을 여는 시험은 결과를 믿을 수 없음.
- Claude in Chrome은 chrome:// 페이지(extensions·flags·settings·version)에 접근 불가 → 일반 페이지에서 브라우저 상태를 읽어 비교.
- 정상: navigator.webdriver=false, UA Chrome 156 macOS, 자동화 흔적(cdc_/selenium/puppeteer) 없음, 언어 ko-KR, 시간대 Asia/Seoul.
- **발견: 모든 사이트에 다른 확장이 content script를 넣고 있음** — ID `ecmeogcbcoalojmkfkmancobmiahaigg`, `content_script/content_script.js`, 코드 안에 `itemscoutWebExtension`, `CRAWLING_PAGE_TIMES:5`, `COUPANG`, `MONTHLY_USAGE_LIMIT` → **아이템스카우트(키워드 분석) 확장 v5.4.6**. 쿠팡 검색 결과를 크롤링하는 확장이라 Akamai가 이 프로필을 봇으로 찍은 1순위 원인으로 봄.
- 할 일(사용자): jinleeda1에서 이 확장 **삭제**(끄기만 하면 다시 켜질 수 있음) → 쿠팡 사이트 데이터 삭제 → 크롬 재시작 → 몇 시간 뒤 확인. sujinlee9704에 같은 확장이 없는지도 확인.
- 체험단 확장(ori/ext) 코드는 원인 아님 → 수정 안 함, 자동 가져오기 유지.

## 🔎 10/31 20:35 두 프로필 비교 (Claude in Chrome, 일반 페이지 guide/에서 읽음)
| 항목 | jinleeda1 (막힘) | sujinlee9704 (열림) |
|---|---|---|
| 공인 IP·통신사 | 122.40.x.x LG U+ 수원 | 같음 |
| UA·Chrome 버전·webdriver | Chrome 156 macOS, webdriver=false | 같음 |
| 언어·시간대·화면·WebGL | 같음 | 같음 |
| **devicePixelRatio / 창 안쪽 크기** | **1 / inner 2880 > outer 1440 (화면 배율 50%)** | 2 / inner=outer |
| 체험단 확장(data-pl-ext) | 1.5.8 켜져 있음 | 없음 |
| 다른 확장 content script | 안 보임 | 아이템스카우트 |
- 프록시·VPN 없음(IP 같음), 자동화 흔적 없음.
- 남은 차이: 화면 배율 50%(쿠팡에도 기본 배율로 걸려 있으면 창 크기 값이 이상하게 보임), 체험단 확장이 이 프로필에만 설치, chrome:// 설정(Claude in Chrome으로 못 봄).

## ✅ 10/31 20:33 해결 (사용자)
- jinleeda1: 화면 배율 100%로 바꿔도 막힘 → 체험단 확장 끈 상태 확인 + `chrome://settings/content/all`에서 coupang 데이터 삭제 + 크롬 완전 종료 후 → **열림**.
- 원인: jinleeda1 프로필에 쌓인 쿠팡 쿠키(Akamai 표시). 앞서 지웠을 때 안 풀린 건 확장이 켜진 채 다시 쿠팡을 열었거나 크롬을 재시작하지 않았기 때문으로 봄.
- 다음: 확장 켜고 [자동 가져오기] 한 번 → 다시 막히면 확장 1.5.1~1.5.7의 차단 시 새로고침 재시도·검색 페이지 자동 넘기기가 재발 원인 → 위 5번대로 되돌림(자동 가져오기·차단 화면 감지는 유지).
- 주의: Claude in Chrome(자동 조작)으로 쿠팡을 열면 정상 프로필도 막힘 → 쿠팡 동작 확인은 사람이 직접.

## 🛠 10/31 20:40 확장 1.5.9 (사용자: 쿠키 지운 뒤 확장 켜고 자동 가져오기 → 다시 막힘)
- bg.js `autoRun`을 1.5.0 방식으로: 받은 주소 그대로(link.coupang → www 직통 변환 제거), `active: false`(뒤 탭).
- **차단 화면 새로고침 재시도 제거** → 차단 감지하면 바로 멈추고 안내(쿠팡 데이터 삭제·크롬 재시작).
- 유지: 자동 가져오기, 차단 화면 감지(page.js), 이미 열린 같은 상품 탭 재사용, pidOf의 pageKey 인식.
- manifest 1.5.9, product-locator.zip·EXT_ZIP 갱신, 생성기 v138. run_ci 통과.
- 참고: bg.js `VER_URL`(업데이트 알림)은 다른 브랜치(claude/tasting-group-notice-automation-1x1kur) manifest를 봄 → 그 브랜치가 1.5.9가 아니면 새 버전 알림이 안 뜰 수 있음.
- 다음 시험: jinleeda1 쿠팡 데이터 삭제·크롬 재시작 → 1.5.9 설치 → 상품 페이지 직접 열기 → [자동 가져오기] 한 번. 또 막히면 검색 순위 찾기(여러 페이지 넘기기) 자체가 원인 → 사용자와 상의.

## 🔎 10/31 20:44 어디서 막히는지 확인 (사용자 화면 캡처)
- 사용자가 직접 연 상품 페이지(9796919905)는 **정상으로 열림**. 막힌 건 확장이 순위 찾으려고 띄운 **팝업 창(검색 화면)**.
- 즉 원인은 bg.js `openWork`/`nav`/`mobile` = 쿠팡 검색 결과를 여러 페이지 자동으로 넘기는 순위 찾기(PC + 디버거로 기기 흉내·UA 바꾸기). 1.5.0부터 있던 기능인데 쿠팡이 10/31부터 막기 시작함.
- 이걸 쿠팡 차단을 피해 가게 고치는 건 하지 않음(차단 우회). 사용자와 방향 상의 필요: 상품 정보 자동 가져오기는 유지 + 쿠팡 순위는 자동 검색 대신 다른 방법.
- 덤: 생성기가 보내는 주소가 `link.coupang.com/a/…` 단축 링크라 상품번호가 없어 '열린 탭 재사용'이 안 됨 → 같은 상품 탭이 하나 더 열림.

## ✅ 10/31 20:55~20:58 원격 재현 (Claude in Chrome으로 두 프로필 생성기에서 같은 자동 가져오기, link.coupang.com/a/ifs285AXwO)
- **jinleeda1 (1.5.9)**: 20:55 정상 — 상품명·옵션·가격·옵션별 가격·배송 다 가져옴, 모바일 위치 1p, PC 위치 '못 찾음'(차단인지 진짜 없는지 미확인), 판매처가 '가입'으로 잘못 읽힘(별개 버그).
- **sujinlee9704 (1.5.9)**: 20:57 상품 페이지에서 바로 '사용권한 없음' → 1.5.9가 재시도 없이 멈춤.
- 쿠키 비교(이름만): jinleeda1 `_abck` 검증됨(~0~), 쿠키·저장소 정상 허용. sujinlee9704도 정상.
- **결론: 특정 프로필 문제가 아님.** 쿠팡 차단은 크롬 프로필마다(쿠키별로) 따로 걸렸다 풀림. 짧은 시간에 쿠팡 페이지를 많이 열면(자동 가져오기 반복, 차단 화면 새로고침 재시도, Claude in Chrome으로 연 쿠팡 탭) 그 프로필이 막히고, 쉬면 풀림(jinleeda1은 마지막 차단 20:44 → 20:55 정상).
  - jinleeda1이 하루 종일 막혔던 건 1.5.1~1.5.8의 차단 화면 새로고침 재시도·반복 시도로 계속 다시 찍혔기 때문으로 봄. 1.5.9는 차단 감지 시 바로 멈춤.
  - sujinlee9704가 막힌 데는 Claude가 그 프로필로 쿠팡을 연 것(20:09, 20:11, 20:5x)도 보탬.
- 남은 것: PC 위치 '못 찾음' 원인 확인, 판매처 '가입' 버그.

## 확인 순서 (사용자 크롬에서)
1. **확장 끄고** 크롬 새 탭 주소창에 `https://www.coupang.com/vp/products/9796919905` 직접 입력 → 열리나?
   - 막히면: 코드 문제 아님. 이 IP/브라우저가 쿠팡에 찍힘 → 시크릿 창, 휴대폰 핫스팟으로 다시. 쿠팡 쿠키 삭제(설정 → 개인정보 → 쿠키 → coupang.com).
2. 열리면 **확장 켜고** 같은 주소 직접 입력 → 막히면 확장 content script(page.js) 또는 bg.js가 페이지 열 때 하는 일이 원인(예: 바로 새로고침, 스크롤·클릭 흉내, 빠른 반복 요청).
3. 생성기(https://sujin-baby.github.io/guide/) [상품 페이지 열기] 버튼 → 막히나? (`link.coupang.com/a/...#kw=` 주소)
4. [자동 가져오기] → 막히나? 막히면 bg.js `autoRun`(40~90행)이 여는 URL·열고 나서 하는 동작을 1.5.0(`git show 4d089fb:ori/ext/bg.js`)과 비교.
5. 원인이 확장이면: 1.5.0 방식으로 되돌리되 1.5.7의 차단 화면 감지(차단 글자를 상품 정보로 안 씀)는 유지. 자동 가져오기는 **없애지 말 것**(사용자 결정).

## 고친 뒤
- `ori/ext/manifest.json` 버전 올리고, `ori/product-locator.zip`과 `guide/index.html` 안 `EXT_ZIP`도 같이 갱신 (CLAUDE_HANDOVER 1번 표 참고).
- 시험: `bash ori/test/run_ci.sh`. ori-dev에 push → 생성기는 main에 합쳐야 Pages 반영.
- 결과는 `ori/CLAUDE_HANDOVER.md` 8번에 한 줄.
