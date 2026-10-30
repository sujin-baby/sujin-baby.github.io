/* 생성기 화면과 확장 프로그램 잇기 (사용자 요청 10/20)
   생성기 화면(상품 정보 붙여넣기 칸 #cp + 확장 프로그램 받기 단추 #ext-dl 이 있는 화면)에서만 동작, 다른 사이트에서는 아무것도 안 함
   - 생성기 [자동 가져오기] → 확장 프로그램이 상품 페이지를 열어 읽음
   - 확장 프로그램 결과(복사하는 글)와 진행 상황 → 생성기로 바로 보내서 붙여넣기 없이 칸이 채워짐 */
(() => {
  if (window.__plGen) return;
  window.__plGen = 1;
  const boot = () => {
    if (!document.getElementById("cp") || !document.getElementById("ext-dl")) return false;
    document.documentElement.setAttribute("data-pl-ext", chrome.runtime.getManifest().version);
    document.addEventListener("pl-auto", e => { let j = {}; try { j = JSON.parse(e.detail); } catch (x) {} chrome.runtime.sendMessage({ type: "plAuto", url: j.url }).catch(() => {}); });
    chrome.runtime.onMessage.addListener(m => { if (m && m.type === "plPush") document.dispatchEvent(new CustomEvent("pl-push", { detail: JSON.stringify(m) })); });
    /* 이 화면을 결과 받을 곳으로 등록 (생성기를 새로 열 때마다 마지막 것) */
    chrome.runtime.sendMessage({ type: "plGenHere" }).catch(() => {});
    window.addEventListener("focus", () => chrome.runtime.sendMessage({ type: "plGenHere" }).catch(() => {}));
    return true;
  };
  if (!boot()) { let n = 0; const t = setInterval(() => { if (boot() || ++n > 40) clearInterval(t); }, 500); }
})();
