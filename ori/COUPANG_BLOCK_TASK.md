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
