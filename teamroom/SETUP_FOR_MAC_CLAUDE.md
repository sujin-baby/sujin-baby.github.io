# 맥에서 도는 Claude에게: 오리 팀룸 · 슬랙 설치 마무리 (11/1)

사용자(수진)가 직접 하기 어려워해서 맥 Claude가 사용자 크롬(jinleeda1 계정)에서 대신 눌러 주는 작업. 클라우드 Claude는 사용자 컴퓨터에 못 들어감.
**열쇠·토큰은 채팅·깃허브·팀룸 글에 절대 쓰지 말 것.**

## A. 앱스크립트 팀룸 (이미 배포됨, 동작 확인함)
- 웹 앱: https://script.google.com/macros/s/AKfycby9QFtSENA7f3HHpScnZYNZ9InP0EAI0cDFtlLpIf907W8HPxbMWNMzPsiu0Hn22FBOvg/exec (열쇠 없이 열면 '열쇠가 있는 링크로'가 정상)
- 처음 열었을 때 열쇠가 이미 만들어짐. 열쇠는 **jinleeda1 내 드라이브 → '오리 팀룸' 구글 시트 → 아래쪽 '열쇠' 탭** (A 참가자 / B 열쇠 / C 화면 링크).
1. drive.google.com 검색창에 `오리 팀룸` → 시트 열기 → 아래 탭 `열쇠`
2. `수진 (owner)` 줄 C칸 링크를 크롬 즐겨찾기에 추가 (이름: 오리 팀룸) → 열어서 화면 확인
3. `Claude (claude)` 줄 C칸 링크: 사용자에게 "클라우드 Claude 환경 설정 → 비밀값(Network secrets / 환경 변수)에 `ORI_ROOM_URL` 이름으로 넣기"를 안내 (채팅에 붙여넣지 않게)
4. 피클·GPT 줄 링크는 사용자에게 알려서 각자에게 전달하게 함. API 설명: 저장소 `teamroom/README.md`
5. 팀룸 화면 왼쪽 '✨ Gemini 받아 적기'에 Gemini 키 넣기 (사용자가 원하면. 체험단에 넣은 키와 같은 것 써도 됨)

## B. 슬랙 (워크스페이스는 사용자가 만듦)
1. 슬랙에서 채널 `#업무`, `#잡담` 만들기 (없으면)
2. https://api.slack.com/apps → **Create New App → From scratch** → 이름 `Claude`, 워크스페이스 선택
3. 왼쪽 **OAuth & Permissions → Scopes → Bot Token Scopes**에 추가: `channels:history`, `channels:read`, `chat:write`, `users:read`, `files:read`
4. 같은 화면 위 **Install to Workspace → 허용** → `Bot User OAuth Token`(xoxb-…) 생김
5. 토큰은 채팅에 쓰지 말고, 사용자에게 "클라우드 Claude 환경 설정 → 비밀값에 `SLACK_BOT_TOKEN` 이름으로 넣기" 안내
6. 슬랙 `#업무`, `#잡담`에서 `/invite @Claude`
7. 피클도 슬랙에 붙을 거면 같은 방법으로 앱 `피클` 하나 더 (토큰은 피클 쪽에)
8. 끝나면 `ori/CLAUDE_HANDOVER.md` 8번에 "팀룸·슬랙 설치 끝, 비밀값 이름 ORI_ROOM_URL / SLACK_BOT_TOKEN" 한 줄 (토큰 값은 쓰지 않음)
