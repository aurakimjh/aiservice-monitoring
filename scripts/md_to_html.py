#!/usr/bin/env python3
"""
Markdown → HTML 변환 스크립트
wiki 붙여넣기용 완전한 HTML 파일 생성

사용법:
    python scripts/md_to_html.py
"""

import markdown2
import os
import re
from pathlib import Path

# ── 변환 대상 파일 목록 ───────────────────────────────────────
ROOT = Path(__file__).parent.parent
FILES = [
    ROOT / "README.md",
    ROOT / "DOCS" / "ARCHITECTURE.md",
    ROOT / "DOCS" / "LOCAL_SETUP.md",
    ROOT / "DOCS" / "METRICS_DESIGN.md",
]
OUTPUT_DIR = ROOT / "DOCS" / "html"

# ── HTML 템플릿 ───────────────────────────────────────────────
HTML_TEMPLATE = """\
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{title}</title>
  <style>
    /* ── 기본 레이아웃 ── */
    *, *::before, *::after {{ box-sizing: border-box; }}
    body {{
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans KR",
                   Helvetica, Arial, sans-serif;
      font-size: 16px;
      line-height: 1.75;
      color: #24292f;
      background: #ffffff;
      margin: 0;
      padding: 0;
    }}
    .page-wrap {{
      max-width: 960px;
      margin: 0 auto;
      padding: 40px 32px 80px;
    }}

    /* ── 제목 ── */
    h1, h2, h3, h4, h5, h6 {{
      font-weight: 600;
      line-height: 1.3;
      margin-top: 2em;
      margin-bottom: 0.6em;
      color: #1f2328;
    }}
    h1 {{ font-size: 2em;   border-bottom: 2px solid #d0d7de; padding-bottom: 0.3em; }}
    h2 {{ font-size: 1.5em; border-bottom: 1px solid #d0d7de; padding-bottom: 0.25em; }}
    h3 {{ font-size: 1.25em; }}
    h4 {{ font-size: 1em; }}

    /* ── 단락·링크 ── */
    p {{ margin: 0.8em 0; }}
    a {{ color: #0969da; text-decoration: none; }}
    a:hover {{ text-decoration: underline; }}

    /* ── 코드 ── */
    code {{
      font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
      font-size: 0.875em;
      background: #f6f8fa;
      border: 1px solid #d0d7de;
      border-radius: 4px;
      padding: 0.15em 0.4em;
      color: #e85d04;
    }}
    pre {{
      background: #161b22;
      border-radius: 8px;
      padding: 20px 24px;
      overflow-x: auto;
      margin: 1.2em 0;
      border: 1px solid #30363d;
    }}
    pre code {{
      background: transparent;
      border: none;
      padding: 0;
      color: #e6edf3;
      font-size: 0.85em;
      line-height: 1.6;
    }}

    /* ── 표 ── */
    table {{
      width: 100%;
      border-collapse: collapse;
      margin: 1.2em 0;
      font-size: 0.9em;
    }}
    thead tr {{
      background: #f6f8fa;
    }}
    th, td {{
      border: 1px solid #d0d7de;
      padding: 8px 14px;
      text-align: left;
      vertical-align: top;
    }}
    th {{
      font-weight: 600;
      color: #1f2328;
    }}
    tbody tr:nth-child(even) {{
      background: #f6f8fa;
    }}
    tbody tr:hover {{
      background: #eaf3fb;
    }}

    /* ── 인용 블록 ── */
    blockquote {{
      border-left: 4px solid #0969da;
      margin: 1em 0;
      padding: 8px 16px;
      background: #f0f7ff;
      border-radius: 0 6px 6px 0;
      color: #444d56;
    }}
    blockquote p {{ margin: 0.3em 0; }}

    /* ── 목록 ── */
    ul, ol {{
      padding-left: 1.8em;
      margin: 0.6em 0;
    }}
    li {{ margin: 0.3em 0; }}
    li > ul, li > ol {{ margin: 0.2em 0; }}

    /* ── 구분선 ── */
    hr {{
      border: none;
      border-top: 2px solid #d0d7de;
      margin: 2em 0;
    }}

    /* ── 배지 스타일 (체크박스) ── */
    input[type="checkbox"] {{ margin-right: 6px; }}

    /* ── 헤더 앵커 ── */
    h1 .anchor, h2 .anchor, h3 .anchor {{
      opacity: 0;
      font-size: 0.75em;
      margin-left: 8px;
      color: #57606a;
    }}
    h1:hover .anchor, h2:hover .anchor, h3:hover .anchor {{ opacity: 1; }}

    /* ── 상단 메타 배너 ── */
    .doc-banner {{
      background: linear-gradient(135deg, #0969da 0%, #1a7f64 100%);
      color: white;
      border-radius: 10px;
      padding: 20px 28px;
      margin-bottom: 2em;
    }}
    .doc-banner h1 {{
      color: white;
      border: none;
      margin: 0 0 4px;
      font-size: 1.6em;
    }}
    .doc-banner p {{ margin: 0; opacity: 0.85; font-size: 0.9em; }}

    /* ── 푸터 ── */
    .doc-footer {{
      margin-top: 4em;
      padding-top: 1.5em;
      border-top: 1px solid #d0d7de;
      font-size: 0.82em;
      color: #57606a;
      text-align: center;
    }}
  </style>
</head>
<body>
  <div class="page-wrap">
    <div class="doc-banner">
      <h1>{title}</h1>
      <p>aiservice-monitoring · OpenTelemetry 기반 AI 서비스 성능 모니터링 솔루션</p>
    </div>

{body}

    <div class="doc-footer">
      Generated from <code>{source}</code> &nbsp;|&nbsp;
      aiservice-monitoring project &nbsp;|&nbsp;
      Aura Kim &lt;aura.kimjh@gmail.com&gt;
    </div>
  </div>
</body>
</html>
"""


def extract_title(md_text: str, fallback: str) -> str:
    """마크다운 첫 번째 H1을 제목으로 추출"""
    for line in md_text.splitlines():
        line = line.strip()
        if line.startswith("# "):
            return line[2:].strip()
    return fallback


def convert(md_path: Path, out_dir: Path) -> Path:
    md_text = md_path.read_text(encoding="utf-8")

    # markdown2 변환 (확장 기능 활성화)
    body_html = markdown2.markdown(
        md_text,
        extras=[
            "tables",
            "fenced-code-blocks",
            "header-ids",
            "strike",
            "task_list",
            "footnotes",
            "break-on-newline",
            "cuddled-lists",
            "spoiler",
        ],
    )

    # 체크박스 GFM 스타일 후처리
    body_html = body_html.replace(
        '<li>[ ] ', '<li><input type="checkbox" disabled> '
    ).replace(
        '<li>[x] ', '<li><input type="checkbox" checked disabled> '
    ).replace(
        '<li>[X] ', '<li><input type="checkbox" checked disabled> '
    )

    title = extract_title(md_text, md_path.stem)

    html = HTML_TEMPLATE.format(
        title=title,
        body=body_html,
        source=md_path.name,
    )

    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / (md_path.stem + ".html")
    out_path.write_text(html, encoding="utf-8")
    return out_path


def main():
    print(f"출력 디렉토리: {OUTPUT_DIR}\n")
    for md_path in FILES:
        if not md_path.exists():
            print(f"  [SKIP] {md_path.name} — 파일 없음")
            continue
        out = convert(md_path, OUTPUT_DIR)
        size_kb = out.stat().st_size / 1024
        print(f"  [OK]  {md_path.name:30s}  →  {out.name}  ({size_kb:.1f} KB)")
    print("\n완료.")


if __name__ == "__main__":
    main()
