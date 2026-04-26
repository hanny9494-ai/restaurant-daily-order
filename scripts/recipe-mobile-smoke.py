from pathlib import Path
from datetime import datetime

from playwright.sync_api import sync_playwright


BASE_URL = "https://restaurant-daily-order.vercel.app"
OUTPUT_DIR = Path("/Users/jeff/Documents/New project/output/mobile-smoke")
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
CHROMIUM_FALLBACK = Path.home() / "Library/Caches/ms-playwright/chromium-1161/chrome-mac/Chromium.app/Contents/MacOS/Chromium"


CASES = [
    {
        "name": "录入工作台",
        "path": "/recipes",
        "expect": "录入工作台",
        "screenshot": "recipes-mobile.png",
    },
    {
        "name": "查看菜谱",
        "path": "/recipes/view",
        "expect": "查看菜谱",
        "screenshot": "recipes-view-mobile.png",
    },
    {
        "name": "审批中心",
        "path": "/recipes/approvals",
        "expect": "审批中心",
        "screenshot": "recipes-approvals-mobile.png",
    },
]


def main():
    report_lines = [
        "# 食谱系统移动端 Smoke 测试",
        "",
        f"- 时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
        f"- 环境: {BASE_URL}",
        "- 设备: iPhone 12",
        "",
    ]

    with sync_playwright() as p:
        launch_args = {"headless": True}
        if CHROMIUM_FALLBACK.exists():
          launch_args["executable_path"] = str(CHROMIUM_FALLBACK)
        browser = p.chromium.launch(**launch_args)
        context = browser.new_context(
            viewport={"width": 390, "height": 844},
            user_agent=(
                "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) "
                "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 "
                "Mobile/15E148 Safari/604.1"
            ),
            is_mobile=True,
            has_touch=True,
            device_scale_factor=3,
        )
        page = context.new_page()

        for case in CASES:
            url = f"{BASE_URL}{case['path']}"
            item_lines = [f"## {case['name']}", "", f"- URL: {url}"]
            try:
                page.goto(url, wait_until="networkidle", timeout=60000)
                page.wait_for_timeout(800)
                body_text = page.locator("body").inner_text(timeout=5000)
                expect_ok = case["expect"] in body_text
                overflow = page.evaluate(
                    "() => Math.max(0, document.documentElement.scrollWidth - window.innerWidth)"
                )
                screenshot_path = OUTPUT_DIR / case["screenshot"]
                page.screenshot(path=str(screenshot_path), full_page=True)
                item_lines.extend(
                    [
                        f"- 标题命中: {'PASS' if expect_ok else 'FAIL'} ({case['expect']})",
                        f"- 横向溢出: {'PASS' if overflow <= 4 else 'FAIL'} (overflow={overflow}px)",
                        f"- 截图: {screenshot_path}",
                    ]
                )
            except Exception as exc:
                item_lines.append(f"- 结果: FAIL ({exc})")
            report_lines.extend(item_lines)
            report_lines.append("")

        browser.close()

    report_path = Path("/Users/jeff/Documents/New project/output/recipe-mobile-smoke-report.md")
    report_path.write_text("\n".join(report_lines), encoding="utf-8")
    print(report_path)


if __name__ == "__main__":
    main()
