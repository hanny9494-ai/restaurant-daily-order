#!/usr/bin/env python3
import argparse
import datetime as dt
import re
import sys
from pathlib import Path

from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import sync_playwright

DEFAULT_QUESTION = """请总结这位主厨的核心料理哲学，重点关注：
- 他/她如何定义“好吃”
- 食材选择背后的逻辑
- 风味组合的思考方式
- 对某种食材或技术的独特见解
- 印象最深的原话（直接引用）

输出格式：哲学要点 + 原话引用 + 对应菜肴举例。
另外，请列出刚才对话中所有描述食物味道、香气、质感的具体表达，保留原句，不要总结。"""


def click_first(page, selectors, timeout=2500):
    for sel in selectors:
        try:
            locator = page.locator(sel).first
            if locator.is_visible(timeout=timeout):
                locator.click(timeout=timeout)
                return True
        except Exception:
            continue
    return False


def fill_question_and_send(page, question):
    # Try textarea first.
    textareas = [
        "textarea[placeholder*='Ask']",
        "textarea[placeholder*='问']",
        "textarea",
    ]
    for sel in textareas:
        try:
            locator = page.locator(sel).first
            if locator.is_visible(timeout=1500):
                locator.fill(question)
                locator.press("Enter")
                return True
        except Exception:
            continue

    # Fallback to contenteditable input.
    editables = [
        "[contenteditable='true'][aria-label*='Ask']",
        "[contenteditable='true'][role='textbox']",
        "[contenteditable='true']",
    ]
    for sel in editables:
        try:
            locator = page.locator(sel).first
            if locator.is_visible(timeout=1500):
                locator.click()
                locator.fill(question)
                locator.press("Enter")
                return True
        except Exception:
            continue
    return False


def extract_answer(page, question):
    # Strong selectors first.
    answer_selectors = [
        "[data-message-author-role='assistant']",
        "[data-testid*='response']",
        ".response",
        "article",
    ]
    for sel in answer_selectors:
        try:
            items = page.locator(sel)
            count = items.count()
            if count > 0:
                txt = items.nth(count - 1).inner_text().strip()
                if txt and question not in txt:
                    return txt
        except Exception:
            pass

    # Last fallback: parse body around question marker.
    body = page.locator("body").inner_text(timeout=5000)
    if question[:20] in body:
        idx = body.rfind(question[:20])
        chunk = body[idx + 20 :].strip()
        chunk = re.sub(r"\n{3,}", "\n\n", chunk)
        if chunk:
            return chunk[:12000]
    return ""


def write_markdown(out_path, notebook_url, video_path, question, answer):
    now = dt.datetime.now().isoformat(timespec="seconds")
    md = []
    md.append("# NotebookLM 提问结果")
    md.append("")
    md.append(f"- 时间: {now}")
    md.append(f"- NotebookLM: {notebook_url}")
    md.append(f"- 视频文件: {video_path}")
    md.append("")
    md.append("## 提问")
    md.append("")
    md.append(question)
    md.append("")
    md.append("## 回答")
    md.append("")
    md.append(answer if answer else "（未成功自动抓取回答，请在 NotebookLM 页面复制后手动补充）")
    md.append("")
    out_path.write_text("\n".join(md), encoding="utf-8")


def main():
    parser = argparse.ArgumentParser(description="Upload video to NotebookLM, ask question, and save answer to Markdown.")
    parser.add_argument("--video", required=True, help="Absolute path to local video file.")
    parser.add_argument("--out", default="notebooklm_result.md", help="Output markdown path.")
    parser.add_argument("--notebook-url", default="https://notebooklm.google.com/", help="NotebookLM URL (home or specific notebook).")
    parser.add_argument("--question", default=DEFAULT_QUESTION, help="Question to ask.")
    parser.add_argument("--profile-dir", default=str(Path.home() / ".notebooklm_profile"), help="Browser profile dir for persistent login.")
    args = parser.parse_args()

    video_path = Path(args.video).expanduser().resolve()
    if not video_path.exists():
        print(f"[ERROR] Video not found: {video_path}", file=sys.stderr)
        sys.exit(1)

    out_path = Path(args.out).expanduser().resolve()
    profile_dir = Path(args.profile_dir).expanduser().resolve()
    profile_dir.mkdir(parents=True, exist_ok=True)

    with sync_playwright() as p:
        context = p.chromium.launch_persistent_context(
            user_data_dir=str(profile_dir),
            headless=False,
            viewport={"width": 1440, "height": 960},
        )
        page = context.new_page()
        page.goto(args.notebook_url, wait_until="domcontentloaded")

        print("[INFO] Browser opened. If asked, log in to Google/NotebookLM in this window.")
        input("[ACTION] 登录并进入目标 Notebook 后，按 Enter 继续...")

        # Open upload/source panel if needed.
        click_first(
            page,
            [
                "button:has-text('Add source')",
                "button:has-text('Add')",
                "button:has-text('Source')",
                "button:has-text('上传')",
                "button:has-text('添加来源')",
            ],
        )

        # Try direct upload via file input.
        upload_ok = False
        for sel in ["input[type='file']", "input[accept*='video']", "input[accept*='audio']"]:
            try:
                loc = page.locator(sel).first
                if loc.count() > 0:
                    loc.set_input_files(str(video_path))
                    upload_ok = True
                    break
            except Exception:
                continue

        if not upload_ok:
            print("[WARN] 未自动定位到文件上传控件。")
            input("[ACTION] 请在页面中手动点击上传并选择文件，完成后按 Enter 继续...")

        print("[INFO] 等待文件上传/索引（约 20 秒）...")
        page.wait_for_timeout(20000)

        if not fill_question_and_send(page, args.question):
            print("[WARN] 未自动定位提问输入框。")
            input("[ACTION] 请手动粘贴问题并发送，发送后按 Enter 继续...")

        print("[INFO] 等待生成回答（最长 120 秒）...")
        answer = ""
        try:
            page.wait_for_timeout(15000)
            start = dt.datetime.now()
            while (dt.datetime.now() - start).seconds < 120:
                answer = extract_answer(page, args.question)
                if answer and len(answer) > 80:
                    break
                page.wait_for_timeout(3000)
        except PlaywrightTimeoutError:
            pass

        write_markdown(out_path, args.notebook_url, str(video_path), args.question, answer.strip())
        context.close()

    print(f"[DONE] Markdown saved: {out_path}")


if __name__ == "__main__":
    main()
