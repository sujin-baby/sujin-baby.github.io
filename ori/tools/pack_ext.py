"""ori/tools/pack_ext.py — 크롬 확장 묶음(ori/product-locator.zip)과 생성기(guide/index.html)의
EXT_ZIP·EXT_VER 을 한 세트로 맞춥니다 (zip 명령이 없는 환경용).

쓰는 법:  python3 ori/tools/pack_ext.py
  - ext/ 안 파일 11개를 deflate로 압축해 ori/product-locator.zip 을 다시 만듭니다.
  - guide/index.html 의 `const EXT_ZIP = "..."` 를 그 zip의 base64로 바꿉니다 (EXT_VER 은 manifest.json 버전).
  ori/test/naverprod_test.js 가 zip 안 파일 수·내용·EXT_VER·EXT_ZIP 이 한 세트인지 확인합니다.
"""
import base64
import json
import os
import re
import zipfile

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")
EXT = os.path.join(ROOT, "ori", "ext")
ZIP = os.path.join(ROOT, "ori", "product-locator.zip")
GUIDE = os.path.join(ROOT, "guide", "index.html")


def main():
    names = sorted(os.listdir(EXT))
    files = [n for n in names if os.path.isfile(os.path.join(EXT, n))]
    with zipfile.ZipFile(ZIP, "w", zipfile.ZIP_DEFLATED) as z:
        for n in files:
            p = os.path.join(EXT, n)
            z.write(p, "ext/" + n, compress_type=zipfile.ZIP_DEFLATED)
    with open(ZIP, "rb") as f:
        data = f.read()
    ver = json.load(open(os.path.join(EXT, "manifest.json"), encoding="utf-8"))["version"]

    html = open(GUIDE, encoding="utf-8").read()
    n1 = len(re.findall(r'const EXT_VER = "[\d.]+";', html))
    n2 = len(re.findall(r'const EXT_ZIP = "[A-Za-z0-9+/=]+";', html))
    if n1 != 1 or n2 != 1:
        raise SystemExit("guide/index.html 에서 EXT_VER %d곳 / EXT_ZIP %d곳 — 한 곳씩이어야 합니다" % (n1, n2))
    html = re.sub(r'const EXT_VER = "[\d.]+";', 'const EXT_VER = "%s";' % ver, html)
    html = re.sub(r'const EXT_ZIP = "[A-Za-z0-9+/=]+";',
                  'const EXT_ZIP = "%s";' % base64.b64encode(data).decode("ascii"), html)
    open(GUIDE, "w", encoding="utf-8").write(html)
    print("✓ ori/product-locator.zip (%d개 파일, %d바이트) · EXT_VER %s" % (len(files), len(data), ver))


if __name__ == "__main__":
    main()
