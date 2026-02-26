#!/usr/bin/env python3
"""Search high-relevance YouTube videos and export transcripts to Markdown.

Pipeline:
1) Query YouTube feed entries (Atom feed)
2) Relevance scoring by keywords
3) Transcript extraction (yt-dlp first, then page parsing fallback)
4) Markdown export
"""

from __future__ import annotations

import argparse
import html
import json
import re
import shutil
import subprocess
import sys
import textwrap
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional, Tuple

DEFAULT_OUTPUT = "output/youtube_food_transcripts.md"
USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Safari/537.36"
)


@dataclass
class VideoEntry:
    video_id: str
    title: str
    link: str
    published: str
    channel: str
    description: str
    score: int


@dataclass
class TranscriptResult:
    language: str
    text: str
    method: str


def http_get(url: str, timeout: int = 20) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read().decode("utf-8", errors="replace")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="YouTube high-relevance video transcript collector")
    parser.add_argument("--query", required=True, help="YouTube search query")
    parser.add_argument(
        "--keywords",
        default="michelin,fine dining,restaurant,food review,食评,探店,美食,餐厅",
        help="Comma-separated relevance keywords",
    )
    parser.add_argument("--max-videos", type=int, default=8, help="Max videos to output")
    parser.add_argument("--feed-limit", type=int, default=30, help="Max feed candidates to score")
    parser.add_argument("--output", default=DEFAULT_OUTPUT, help="Output Markdown path")
    parser.add_argument("--min-score", type=int, default=2, help="Minimum keyword score")
    parser.add_argument(
        "--negative-keywords",
        default="trailer,game,music,lyrics,reaction,meme,shorts,compilation",
        help="Comma-separated negative keywords for down-ranking",
    )
    parser.add_argument(
        "--strict-relevance",
        action="store_true",
        help="Only keep videos that match at least 2 positive keywords and no strong negative hit.",
    )
    parser.add_argument("--prefer-lang", default="zh-Hans,zh,en", help="Preferred transcript languages")
    parser.add_argument(
        "--video-url",
        action="append",
        default=[],
        help="Direct YouTube video URL (repeatable). If set, skip search and transcribe these videos.",
    )
    parser.add_argument(
        "--playlist-url",
        action="append",
        default=[],
        help="YouTube playlist URL (repeatable). Script will expand all videos in playlist.",
    )
    return parser.parse_args()


def normalize_text(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip().lower()


def score_title(title: str, keywords: List[str]) -> int:
    t = normalize_text(title)
    score = 0
    for kw in keywords:
        k = normalize_text(kw)
        if not k:
            continue
        if k in t:
            score += max(1, len(k) // 4)
    return score


def split_keywords(raw: str) -> List[str]:
    return [x.strip().lower() for x in raw.split(",") if x.strip()]


def keyword_hits(text: str, keywords: List[str]) -> int:
    norm = normalize_text(text)
    hits = 0
    for kw in keywords:
        if kw and kw in norm:
            hits += 1
    return hits


def fetch_feed(query: str) -> List[VideoEntry]:
    q = urllib.parse.quote_plus(query)
    url = f"https://www.youtube.com/feeds/videos.xml?search_query={q}"
    xml_text = http_get(url)

    ns = {
        "atom": "http://www.w3.org/2005/Atom",
        "yt": "http://www.youtube.com/xml/schemas/2015",
    }
    root = ET.fromstring(xml_text)

    videos: List[VideoEntry] = []
    for entry in root.findall("atom:entry", ns):
        vid = entry.findtext("yt:videoId", default="", namespaces=ns)
        title = entry.findtext("atom:title", default="", namespaces=ns)
        published = entry.findtext("atom:published", default="", namespaces=ns)
        channel = entry.findtext("atom:author/atom:name", default="", namespaces=ns)
        description = entry.findtext("media:group/media:description", default="", namespaces={"media": "http://search.yahoo.com/mrss/"})
        link_node = entry.find("atom:link", ns)
        href = link_node.get("href") if link_node is not None else f"https://www.youtube.com/watch?v={vid}"
        if not vid or not title:
            continue
        videos.append(
            VideoEntry(
                video_id=vid,
                title=title,
                link=href,
                published=published,
                channel=channel or "",
                description=description or "",
                score=0,
            )
        )

    return videos


def video_id_from_url(url: str) -> str:
    try:
        parsed = urllib.parse.urlparse(url)
    except Exception:
        return ""

    if parsed.netloc.endswith("youtu.be"):
        return parsed.path.strip("/")

    if "youtube.com" in parsed.netloc:
        qs = urllib.parse.parse_qs(parsed.query)
        vid = qs.get("v", [""])[0]
        if vid:
            return vid

    return ""


def is_valid_youtube_video_url(url: str) -> bool:
    return bool(video_id_from_url(url))


def playlist_id_from_url(url: str) -> str:
    try:
        parsed = urllib.parse.urlparse(url)
    except Exception:
        return ""

    if "youtube.com" not in parsed.netloc and "youtu.be" not in parsed.netloc:
        return ""

    qs = urllib.parse.parse_qs(parsed.query)
    return qs.get("list", [""])[0].strip()


def fetch_playlist_feed(playlist_id: str) -> List[VideoEntry]:
    feed_url = f"https://www.youtube.com/feeds/videos.xml?playlist_id={urllib.parse.quote_plus(playlist_id)}"
    xml_text = http_get(feed_url)

    ns = {
        "atom": "http://www.w3.org/2005/Atom",
        "yt": "http://www.youtube.com/xml/schemas/2015",
        "media": "http://search.yahoo.com/mrss/",
    }
    root = ET.fromstring(xml_text)

    out: List[VideoEntry] = []
    for entry in root.findall("atom:entry", ns):
        vid = entry.findtext("yt:videoId", default="", namespaces=ns)
        title = entry.findtext("atom:title", default="", namespaces=ns)
        published = entry.findtext("atom:published", default="", namespaces=ns)
        channel = entry.findtext("atom:author/atom:name", default="", namespaces=ns)
        description = entry.findtext("media:group/media:description", default="", namespaces=ns)
        if not vid or not title:
            continue
        out.append(
            VideoEntry(
                video_id=vid,
                title=title,
                link=f"https://www.youtube.com/watch?v={vid}",
                published=published,
                channel=channel or "",
                description=description or "",
                score=0,
            )
        )
    return out


def fetch_bing_youtube_candidates(query: str, count: int = 30) -> List[VideoEntry]:
    q = urllib.parse.quote_plus(f"site:youtube.com/watch {query}")
    url = f"https://www.bing.com/search?format=rss&q={q}&count={count}&first=1"
    xml_text = http_get(url)

    root = ET.fromstring(xml_text)
    videos: List[VideoEntry] = []
    for item in root.findall("./channel/item"):
        title = (item.findtext("title") or "").strip()
        link = (item.findtext("link") or "").strip()
        published = (item.findtext("pubDate") or "").strip()
        if not is_valid_youtube_video_url(link):
            continue
        vid = video_id_from_url(link)
        if not vid:
            continue
        videos.append(
            VideoEntry(
                video_id=vid,
                title=title or vid,
                link=f"https://www.youtube.com/watch?v={vid}",
                published=published,
                channel="",
                description=(item.findtext("description") or "").strip(),
                score=0,
            )
        )
    return videos


def rank_videos(
    videos: List[VideoEntry],
    keywords: List[str],
    negative_keywords: List[str],
    feed_limit: int,
    max_videos: int,
    min_score: int,
    strict_relevance: bool,
) -> List[VideoEntry]:
    scored: List[VideoEntry] = []
    for v in videos[:feed_limit]:
        haystack = " ".join([v.title, v.channel, v.description]).strip()
        pos_hits = keyword_hits(haystack, keywords)
        neg_hits = keyword_hits(haystack, negative_keywords)
        v.score = score_title(v.title, keywords) + pos_hits * 2 - neg_hits * 3

        if strict_relevance and (pos_hits < 2 or neg_hits > 0):
            continue
        if v.score >= min_score:
            scored.append(v)

    dedup = {}
    for v in scored:
        dedup[v.video_id] = v
    scored = list(dedup.values())

    scored.sort(key=lambda x: (x.score, x.published), reverse=True)
    return scored[:max_videos]


def extract_transcript_with_ytdlp(video_url: str, preferred_langs: List[str]) -> Optional[TranscriptResult]:
    ytdlp = shutil.which("yt-dlp")
    if not ytdlp:
        return None

    # Try preferred languages first (manual/auto subtitles)
    lang_selector = ",".join(preferred_langs)
    cmd = [
        ytdlp,
        "--skip-download",
        "--write-auto-sub",
        "--write-sub",
        "--sub-langs",
        lang_selector,
        "--sub-format",
        "json3",
        "--print",
        "%(requested_subtitles)s",
        video_url,
    ]

    try:
        p = subprocess.run(cmd, capture_output=True, text=True, check=False, timeout=90)
    except Exception:
        return None

    if p.returncode != 0:
        return None

    # requested_subtitles prints JSON-ish dict where each lang has url/ext
    data = p.stdout.strip().splitlines()
    if not data:
        return None

    raw = data[-1].strip()
    try:
        subtitle_meta = json.loads(raw.replace("'", '"')) if raw.startswith("{") else None
    except Exception:
        subtitle_meta = None

    if isinstance(subtitle_meta, dict):
        for lang in preferred_langs:
            item = subtitle_meta.get(lang)
            if isinstance(item, dict) and item.get("url"):
                text = json3_url_to_text(item["url"])
                if text:
                    return TranscriptResult(language=lang, text=text, method="yt-dlp")

        for lang, item in subtitle_meta.items():
            if isinstance(item, dict) and item.get("url"):
                text = json3_url_to_text(item["url"])
                if text:
                    return TranscriptResult(language=str(lang), text=text, method="yt-dlp")

    return None


def json3_url_to_text(url: str) -> str:
    try:
        raw = http_get(url, timeout=30)
        data = json.loads(raw)
    except Exception:
        return ""

    events = data.get("events", [])
    parts: List[str] = []
    for ev in events:
        segs = ev.get("segs")
        if not isinstance(segs, list):
            continue
        chunk = "".join(seg.get("utf8", "") for seg in segs if isinstance(seg, dict))
        chunk = html.unescape(chunk).replace("\n", " ").strip()
        if chunk:
            parts.append(chunk)

    return re.sub(r"\s+", " ", " ".join(parts)).strip()


def clean_transcript_text(text: str) -> str:
    if not text:
        return ""

    cleaned = text
    cleaned = re.sub(r"\[(music|applause|laughter|noise)\]", " ", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\([^)]*(music|applause|laughter|noise)[^)]*\)", " ", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()

    # remove near-duplicate adjacent chunks
    sentences = re.split(r"(?<=[。！？.!?])\s+", cleaned)
    out: List[str] = []
    prev = ""
    for s in sentences:
        s = s.strip()
        if len(s) < 8:
            continue
        if s == prev:
            continue
        out.append(s)
        prev = s

    return " ".join(out).strip()


def draft_copy_from_transcript(text: str, keywords: List[str], max_sentences: int = 8) -> str:
    if not text:
        return ""

    sentences = re.split(r"(?<=[。！？.!?])\s+", text)
    scored: List[Tuple[int, str]] = []
    for s in sentences:
        t = s.strip()
        if len(t) < 12:
            continue
        score = keyword_hits(t, keywords)
        if re.search(r"(subscribe|like|follow|广告|赞助|链接在简介)", t, flags=re.IGNORECASE):
            score -= 2
        scored.append((score, t))

    scored.sort(key=lambda x: x[0], reverse=True)
    picked: List[str] = []
    seen = set()
    for _, s in scored:
        key = normalize_text(s)
        if key in seen:
            continue
        seen.add(key)
        picked.append(s)
        if len(picked) >= max_sentences:
            break

    if not picked:
        return ""

    return " ".join(picked)


def extract_caption_tracks_from_watch_html(watch_html: str) -> List[Tuple[str, str]]:
    # returns list[(lang_code, base_url)]
    m = re.search(r'"captionTracks":(\[.*?\])[,}]', watch_html)
    if not m:
        return []

    try:
        tracks = json.loads(m.group(1))
    except Exception:
        return []

    out: List[Tuple[str, str]] = []
    for t in tracks:
        if not isinstance(t, dict):
            continue
        lang = str(t.get("languageCode", ""))
        base_url = str(t.get("baseUrl", ""))
        if lang and base_url:
            out.append((lang, base_url))
    return out


def timedtext_xml_to_text(xml_text: str) -> str:
    try:
        root = ET.fromstring(xml_text)
    except Exception:
        return ""

    chunks: List[str] = []
    for node in root.findall(".//text"):
        txt = node.text or ""
        txt = html.unescape(txt).replace("\n", " ").strip()
        if txt:
            chunks.append(txt)
    return re.sub(r"\s+", " ", " ".join(chunks)).strip()


def extract_transcript_with_watch_page(video_id: str, preferred_langs: List[str]) -> Optional[TranscriptResult]:
    watch_url = f"https://www.youtube.com/watch?v={video_id}"

    try:
        watch_html = http_get(watch_url, timeout=25)
    except Exception:
        return None

    tracks = extract_caption_tracks_from_watch_html(watch_html)
    if not tracks:
        return None

    # language preference
    tracks_sorted = sorted(
        tracks,
        key=lambda x: preferred_langs.index(x[0]) if x[0] in preferred_langs else 999,
    )

    for lang, base_url in tracks_sorted:
        # request xml transcript for easier plain-text conversion
        url = base_url
        if "fmt=" not in url:
            url += "&fmt=srv3"
        try:
            xml_text = http_get(url, timeout=25)
        except Exception:
            continue
        text = timedtext_xml_to_text(xml_text)
        if text:
            return TranscriptResult(language=lang, text=text, method="watch-page")

    return None


def transcript_for_video(video_id: str, preferred_langs: List[str]) -> Optional[TranscriptResult]:
    url = f"https://www.youtube.com/watch?v={video_id}"

    first = extract_transcript_with_ytdlp(url, preferred_langs)
    if first and first.text:
        first.text = clean_transcript_text(first.text)
        return first

    second = extract_transcript_with_watch_page(video_id, preferred_langs)
    if second and second.text:
        second.text = clean_transcript_text(second.text)
        return second

    return None


def to_markdown(query: str, keywords: List[str], videos: List[VideoEntry], transcripts: List[Tuple[VideoEntry, Optional[TranscriptResult]]]) -> str:
    lines: List[str] = []
    lines.append("# YouTube High-Relevance Food Video Transcripts")
    lines.append("")
    lines.append(f"Query: {query}")
    lines.append(f"Keywords: {', '.join(keywords)}")
    lines.append(f"Selected videos: {len(videos)}")
    lines.append("")

    lines.append("## Ranked Videos")
    lines.append("")
    for idx, v in enumerate(videos, start=1):
        lines.append(f"{idx}. [{v.title}]({v.link}) (score={v.score})")
        if v.channel:
            lines.append(f"   - Channel: {v.channel}")

    lines.append("")
    lines.append("## Transcripts")
    lines.append("")

    for idx, (v, tr) in enumerate(transcripts, start=1):
        lines.append(f"### {idx}. {v.title}")
        lines.append(f"- URL: {v.link}")
        lines.append(f"- Relevance score: {v.score}")
        lines.append(f"- Published: {v.published or 'N/A'}")

        if tr is None:
            lines.append("- Transcript: unavailable")
            lines.append("")
            continue

        lines.append(f"- Transcript language: {tr.language}")
        lines.append(f"- Extract method: {tr.method}")
        draft = draft_copy_from_transcript(tr.text, keywords)
        if draft:
            lines.append("")
            lines.append("#### 文案草稿")
            lines.append("")
            lines.append("```text")
            lines.append(textwrap.fill(draft, width=120))
            lines.append("```")
        lines.append("")
        lines.append("```text")
        lines.append(textwrap.fill(tr.text, width=120))
        lines.append("```")
        lines.append("")

    return "\n".join(lines)


def main() -> int:
    args = parse_args()

    keywords = [k.strip() for k in args.keywords.split(",") if k.strip()]
    negative_keywords = split_keywords(args.negative_keywords)
    prefer_langs = [x.strip() for x in args.prefer_lang.split(",") if x.strip()]

    ranked: List[VideoEntry] = []
    source = ""
    if args.playlist_url:
        source = "playlist-feed"
        playlist_videos: List[VideoEntry] = []
        for u in args.playlist_url:
            pid = playlist_id_from_url(u.strip())
            if not pid:
                continue
            try:
                playlist_videos.extend(fetch_playlist_feed(pid))
            except Exception:
                continue
        dedup = {}
        for v in playlist_videos:
            dedup[v.video_id] = v
        ranked = list(dedup.values())
        ranked.sort(key=lambda x: x.published)
        ranked = ranked[: max(1, args.max_videos)] if args.max_videos > 0 else ranked
    elif args.video_url:
        source = "manual-video-urls"
        seen = set()
        for u in args.video_url:
            vid = video_id_from_url(u.strip())
            if not vid or vid in seen:
                continue
            seen.add(vid)
            ranked.append(
                VideoEntry(
                    video_id=vid,
                    title=f"youtube:{vid}",
                    link=f"https://www.youtube.com/watch?v={vid}",
                    published="",
                    channel="",
                    description="",
                    score=999,
                )
            )
        ranked = ranked[: max(1, args.max_videos)]
    else:
        feed_videos: List[VideoEntry] = []
        try:
            feed_videos = fetch_feed(args.query)
            source = "youtube-feed"
        except Exception:
            try:
                feed_videos = fetch_bing_youtube_candidates(args.query, count=max(10, args.feed_limit))
                source = "bing-rss-fallback"
            except Exception as e:
                print(f"Failed to fetch candidates from YouTube and Bing fallback: {e}", file=sys.stderr)
                return 1

        ranked = rank_videos(
            videos=feed_videos,
            keywords=keywords,
            negative_keywords=negative_keywords,
            feed_limit=max(1, args.feed_limit),
            max_videos=max(1, args.max_videos),
            min_score=max(0, args.min_score),
            strict_relevance=args.strict_relevance,
        )

    transcripts: List[Tuple[VideoEntry, Optional[TranscriptResult]]] = []
    for v in ranked:
        tr = transcript_for_video(v.video_id, prefer_langs)
        transcripts.append((v, tr))

    md = to_markdown(args.query, keywords, ranked, transcripts)

    out_path = Path(args.output)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(md, encoding="utf-8")

    ok_count = sum(1 for _, tr in transcripts if tr and tr.text)
    print(f"Saved report to {out_path} (source={source}, videos={len(ranked)}, transcripts={ok_count})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
