# NotebookLM 自动提问并导出 Markdown

## 1) 安装依赖

```bash
cd "/Users/jeff/Documents/New project"
python3 -m pip install -r requirements.txt
python3 -m playwright install chromium
```

## 2) 运行脚本

```bash
python3 notebooklm_capture.py \
  --video "/绝对路径/你的视频.mp4" \
  --notebook-url "https://notebooklm.google.com/" \
  --out "/Users/jeff/Documents/New project/notebooklm_result.md"
```

## 3) 运行时行为

- 脚本会打开 Chromium，首次需要你手动登录 Google / NotebookLM。
- 脚本会尝试自动上传视频、自动发送问题。
- 如果页面结构变化导致自动定位失败，脚本会提示你手动完成该步，然后回车继续。
- 最终输出 Markdown 到 `--out` 指定路径。

## 4) 默认问题模板

脚本内置了你提供的问题模板，可通过 `--question` 覆盖。
