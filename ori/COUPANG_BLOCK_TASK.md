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
