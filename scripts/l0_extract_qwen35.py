#!/usr/bin/env python3
"""
Fresh L0 extractor (Qwen3.5 coding-plan endpoint).
Purpose:
1) Read book markdown by line ranges.
2) Chunk text into extraction units.
3) Call Qwen3.5 with strict L0 schema prompt.
4) Save extraction artifacts.
5) Optionally submit to local L0 draft API.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import sqlite3
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Tuple


SYSTEM_PROMPT = """你是食品科学知识工程师。只提取L0科学原理候选。
规则：
1) 必须是机理性陈述（why）。
2) 必须包含至少一个可测参数（温度/时间/pH/浓度/aw）。
3) 必须包含因果关系。
4) 必须有证据定位（书名+章节/页码+原文短引）。
5) 若信息不足，不要猜测，放入 non_l0_content 并说明原因。
输出必须是合法JSON，不要任何额外文字。"""

VERIFY_SYSTEM_PROMPT = """你是L0科学原理审核员（Verifier）。
任务：审核候选是否满足L0发布最小标准。
标准：
1) 机理性陈述（why）；
2) 至少一个可测参数；
3) 因果关系成立；
4) 有证据定位与短引；
5) 有边界条件。
输出仅JSON：{"decision":"pass|need_evidence|reject","reason":"..."}"""


def user_prompt(meta: Dict[str, str], section_text: str) -> str:
    return f"""任务：从以下书籍片段提取L0候选，并区分非L0内容。

元数据：
book_id={meta.get("book_id", "")}
book_title={meta.get("book_title", "")}
author={meta.get("author", "")}
chapter_id={meta.get("chapter_id", "")}
section_id={meta.get("section_id", "")}
page_range={meta.get("page_range", "")}

输入文本：
{section_text}

输出JSON：
{{
  "principles": [
    {{
      "statement": "...",
      "mechanism": "...",
      "parameters": {{
        "temperature_c": {{"min": null, "max": null}},
        "time_min": {{"min": null, "max": null}},
        "ph": {{"min": null, "max": null}},
        "water_activity": {{"min": null, "max": null}},
        "other": {{}}
      }},
      "cause_effect": "...",
      "boundary_conditions": ["..."],
      "evidence": {{
        "source_type": "book_quote|paper_quote|table|figure",
        "locator": "chapter/page/figure",
        "quote": "...<=120 chars..."
      }},
      "confidence": 0.0,
      "category": "protein|maillard|emulsion|fermentation|texture|other",
      "tags": ["..."]
    }}
  ],
  "non_l0_content": [
    {{
      "statement": "...",
      "reason": "经验总结|无参数|无机理|无证据|仅操作步骤"
    }}
  ]
}}"""


def verify_prompt(candidate: Dict[str, Any], meta: Dict[str, str]) -> str:
    return f"""请审核以下L0候选：

元数据：
book_title={meta.get("book_title", "")}
chapter_id={meta.get("chapter_id", "")}
section_id={meta.get("section_id", "")}
page_range={meta.get("page_range", "")}

候选JSON：
{json.dumps(candidate, ensure_ascii=False)}

输出JSON：
{{
  "decision":"pass|need_evidence|reject",
  "reason":"一句话说明原因"
}}"""

def _has_measurable_params(params: Dict[str, Any]) -> bool:
    if not isinstance(params, dict):
        return False
    keys = ["temperature_c", "time_min", "ph", "water_activity", "other"]
    for k in keys:
        v = params.get(k)
        if isinstance(v, dict):
            for vv in v.values():
                if vv is not None and str(vv).strip() != "":
                    return True
        elif v is not None and str(v).strip() != "":
            return True
    return False


def rule_verify_candidate(candidate: Dict[str, Any]) -> Dict[str, str]:
    statement = str(candidate.get("statement") or "").strip()
    mechanism = str(candidate.get("mechanism") or "").strip()
    cause_effect = str(candidate.get("cause_effect") or "").strip()
    params = candidate.get("parameters") or {}
    evidence = candidate.get("evidence") or {}
    locator = str((evidence or {}).get("locator") or "").strip()
    quote = str((evidence or {}).get("quote") or "").strip()
    boundaries = candidate.get("boundary_conditions") or []
    has_params = _has_measurable_params(params)
    has_evidence = bool(locator) and bool(quote)
    has_boundary = isinstance(boundaries, list) and len(boundaries) > 0
    has_mechanism = bool(mechanism) or bool(cause_effect)
    if not statement:
        return {"decision": "reject", "reason": "missing statement"}
    if not has_mechanism and not has_params and not has_evidence:
        return {"decision": "reject", "reason": "missing mechanism/params/evidence"}
    if has_mechanism and has_params and has_evidence and has_boundary:
        return {"decision": "pass", "reason": "rule check passed"}
    return {"decision": "need_evidence", "reason": "rule check incomplete fields"}


@dataclass
class Chunk:
    chunk_id: str
    chapter_id: str
    section_id: str
    text: str
    line_start: int
    line_end: int


def extract_json_block(text: str) -> Dict[str, Any]:
    s = text.strip()
    if s.startswith("```"):
        s = re.sub(r"^```[a-zA-Z]*\n?", "", s)
        if s.endswith("```"):
            s = s[:-3]
    start = s.find("{")
    end = s.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise ValueError("no_json_object")
    s = s[start : end + 1]
    return json.loads(s)


def to_snake_key(text: str) -> str:
    t = re.sub(r"[^a-zA-Z0-9\u4e00-\u9fff ]+", " ", text).strip().lower()
    t = re.sub(r"\s+", "_", t)
    return t[:90] if t else "l0_candidate"


def read_lines(path: Path) -> List[str]:
    return path.read_text(encoding="utf-8", errors="ignore").splitlines()


def chunk_lines(lines: List[str], chapter_ranges: List[Tuple[str, int, int]], target_chars: int = 5200) -> List[Chunk]:
    chunks: List[Chunk] = []
    for chapter_id, start, end in chapter_ranges:
        start_i = max(1, start)
        end_i = min(len(lines), end)
        if end_i < start_i:
            continue
        buffer: List[str] = []
        cur_start = start_i
        cur_len = 0
        section_idx = 1
        for i in range(start_i, end_i + 1):
            line = lines[i - 1]
            ln = len(line) + 1
            if cur_len > target_chars and line.strip() == "":
                text = "\n".join(buffer).strip()
                if text:
                    chunk_id = f"{chapter_id}_s{section_idx:03d}"
                    chunks.append(
                        Chunk(
                            chunk_id=chunk_id,
                            chapter_id=chapter_id,
                            section_id=f"{chapter_id}.sec{section_idx:03d}",
                            text=text,
                            line_start=cur_start,
                            line_end=i,
                        )
                    )
                    section_idx += 1
                buffer = []
                cur_start = i + 1
                cur_len = 0
                continue
            buffer.append(line)
            cur_len += ln
        tail = "\n".join(buffer).strip()
        if tail:
            chunk_id = f"{chapter_id}_s{section_idx:03d}"
            chunks.append(
                Chunk(
                    chunk_id=chunk_id,
                    chapter_id=chapter_id,
                    section_id=f"{chapter_id}.sec{section_idx:03d}",
                    text=tail,
                    line_start=cur_start,
                    line_end=end_i,
                )
            )
    return chunks


def chat_qwen(base_url: str, api_key: str, model: str, sys_prompt: str, usr_prompt: str, timeout_sec: int = 120) -> Dict[str, Any]:
    url = f"{base_url.rstrip('/')}/chat/completions"
    payload = {
        "model": model,
        "temperature": 0.1,
        "enable_thinking": False,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": sys_prompt},
            {"role": "user", "content": usr_prompt},
        ],
    }
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url=url,
        data=data,
        method="POST",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=timeout_sec) as resp:
        out = json.loads(resp.read().decode("utf-8", errors="ignore"))
    return out


def post_local_draft(submit_url: str, payload: Dict[str, Any]) -> Tuple[bool, str]:
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url=submit_url,
        data=data,
        method="POST",
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            body = resp.read().decode("utf-8", errors="ignore")
            return True, body[:200]
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="ignore")
        return False, f"HTTP {e.code}: {body[:200]}"
    except Exception as e:
        return False, str(e)


def submit_draft_sqlite(db_path: str, payload: Dict[str, Any], status: str = "DRAFT") -> Tuple[bool, str]:
    try:
        con = sqlite3.connect(db_path)
        cur = con.cursor()
        cur.execute(
            "SELECT COALESCE(MAX(version), 0) + 1 FROM l0_principles WHERE principle_key = ?",
            (payload["principle_key"],),
        )
        next_version = int(cur.fetchone()[0])
        cur.execute(
            """
            INSERT INTO l0_principles (
              principle_key, version, status, claim, mechanism,
              control_variables, expected_effects, boundary_conditions, counter_examples,
              evidence_level, confidence, change_reason, proposer
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                payload["principle_key"],
                next_version,
                status,
                payload["claim"],
                payload["mechanism"],
                json.dumps(payload.get("control_variables", {}), ensure_ascii=False),
                json.dumps(payload.get("expected_effects", []), ensure_ascii=False),
                json.dumps(payload.get("boundary_conditions", []), ensure_ascii=False),
                json.dumps(payload.get("counter_examples", []), ensure_ascii=False),
                payload.get("evidence_level", "medium"),
                float(payload.get("confidence", 0.7)),
                payload["change_reason"],
                payload["proposer"],
            ),
        )
        l0_id = cur.lastrowid
        for c in payload.get("citations", []):
            cur.execute(
                """
                INSERT INTO l0_citations (
                  l0_id, source_title, source_type, reliability_tier, source_uri, locator, evidence_snippet
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    l0_id,
                    c.get("source_title", ""),
                    c.get("source_type", "book"),
                    c.get("reliability_tier", "A"),
                    c.get("source_uri"),
                    c.get("locator"),
                    c.get("evidence_snippet", ""),
                ),
            )
        con.commit()
        con.close()
        return True, f"inserted l0_id={l0_id}"
    except Exception as e:
        return False, str(e)


def build_l0_draft(book_title: str, chunk: Chunk, p: Dict[str, Any], proposer: str) -> Dict[str, Any]:
    statement = str(p.get("statement") or "").strip()
    mechanism = str(p.get("mechanism") or "").strip()
    evidence = p.get("evidence") or {}
    quote = str((evidence or {}).get("quote") or "").strip()
    locator = str((evidence or {}).get("locator") or f"{chunk.chapter_id}:{chunk.line_start}-{chunk.line_end}").strip()
    confidence = p.get("confidence")
    try:
        conf = float(confidence)
    except Exception:
        conf = 0.6
    conf = max(0.0, min(1.0, conf))

    boundaries = p.get("boundary_conditions")
    if not isinstance(boundaries, list) or len(boundaries) == 0:
        boundaries = [f"source_locator={locator}"]

    params = p.get("parameters")
    if not isinstance(params, dict):
        params = {}

    key_seed = statement if statement else mechanism
    principle_key = to_snake_key(key_seed)
    if not principle_key:
        principle_key = f"{chunk.chunk_id}_candidate"

    return {
        "principle_key": principle_key,
        "claim": statement[:500] if statement else f"candidate from {chunk.chunk_id}",
        "mechanism": mechanism[:1200] if mechanism else "pending mechanism completion",
        "boundary_conditions": boundaries,
        "control_variables": params,
        "expected_effects": [],
        "counter_examples": [],
        "evidence_level": "medium",
        "confidence": conf,
        "change_reason": f"auto extraction from {book_title} {chunk.chapter_id} lines {chunk.line_start}-{chunk.line_end}",
        "proposer": proposer,
        "citations": [
            {
                "source_title": book_title,
                "source_type": "book",
                "reliability_tier": "S",
                "locator": locator,
                "evidence_snippet": quote[:240] if quote else chunk.text[:240],
            }
        ],
    }


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--input", required=True, help="book markdown path")
    p.add_argument("--book-id", default="mcgee_on_food_and_cooking")
    p.add_argument("--book-title", default="On Food and Cooking")
    p.add_argument("--author", default="Harold McGee")
    p.add_argument("--model", default="qwen3.5-plus")
    p.add_argument("--base-url", default="https://coding.dashscope.aliyuncs.com/v1")
    p.add_argument("--api-key", default=os.getenv("CODING_PLAN_KEY", ""))
    p.add_argument("--max-chunks", type=int, default=24)
    p.add_argument("--target-chars", type=int, default=1800)
    p.add_argument("--sleep-sec", type=float, default=0.25)
    p.add_argument("--timeout-sec", type=int, default=120)
    p.add_argument("--retry", type=int, default=2)
    p.add_argument("--verify-timeout-sec", type=int, default=35)
    p.add_argument("--verifier-mode", choices=["auto", "qwen", "rules"], default="auto")
    p.add_argument("--submit-mode", choices=["http", "sqlite"], default="sqlite")
    p.add_argument("--sqlite-db", default="/Users/jeff/Documents/New project/data/l0_engine.db")
    p.add_argument("--out-dir", default="/Users/jeff/Documents/New project/output/l0_extract_batch1")
    p.add_argument("--submit-url", default="http://localhost:3000/api/l0/changes")
    p.add_argument("--proposer", default="qwen_batch1")
    args = p.parse_args()

    if not args.api_key:
        print("fatal: missing --api-key or CODING_PLAN_KEY", file=sys.stderr)
        return 2

    src = Path(args.input)
    if not src.exists():
        print(f"fatal: input not found: {src}", file=sys.stderr)
        return 2

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    raw_out = out_dir / "raw_results.jsonl"
    cand_out = out_dir / "l0_candidates.jsonl"
    submit_out = out_dir / "submit_results.jsonl"

    lines = read_lines(src)
    ranges = [("ch01", 163, 1606), ("ch02", 1607, 2540), ("ch03", 2541, 3707)]
    chunks = chunk_lines(lines, ranges, target_chars=args.target_chars)
    if args.max_chunks > 0:
        chunks = chunks[: args.max_chunks]

    print(f"chunks_prepared={len(chunks)}")
    success_calls = 0
    submit_ok = 0

    with raw_out.open("w", encoding="utf-8") as fr, cand_out.open("w", encoding="utf-8") as fc, submit_out.open(
        "w", encoding="utf-8"
    ) as fs:
        for idx, c in enumerate(chunks, start=1):
            meta = {
                "book_id": args.book_id,
                "book_title": args.book_title,
                "author": args.author,
                "chapter_id": c.chapter_id,
                "section_id": c.section_id,
                "page_range": f"line:{c.line_start}-{c.line_end}",
            }
            up = user_prompt(meta, c.text)
            print(f"[{idx}/{len(chunks)}] {c.chunk_id}", flush=True)
            try:
                last_err = None
                res = None
                for _ in range(args.retry + 1):
                    try:
                        res = chat_qwen(
                            args.base_url,
                            args.api_key,
                            args.model,
                            SYSTEM_PROMPT,
                            up,
                            timeout_sec=args.timeout_sec,
                        )
                        break
                    except Exception as e:
                        last_err = e
                        time.sleep(1.0)
                if res is None:
                    raise RuntimeError(f"qwen_failed: {last_err}")
                msg = (((res.get("choices") or [{}])[0].get("message") or {}).get("content") or "").strip()
                parsed = extract_json_block(msg)
                success_calls += 1
                fr.write(
                    json.dumps(
                        {
                            "chunk_id": c.chunk_id,
                            "line_start": c.line_start,
                            "line_end": c.line_end,
                            "response": parsed,
                        },
                        ensure_ascii=False,
                    )
                    + "\n"
                )

                principles = parsed.get("principles") or []
                if not isinstance(principles, list):
                    principles = []
                for pi, pp in enumerate(principles, start=1):
                    if not isinstance(pp, dict):
                        continue
                    if args.verifier_mode == "rules":
                        vjson = rule_verify_candidate(pp)
                    else:
                        vmeta = {
                            "book_title": args.book_title,
                            "chapter_id": c.chapter_id,
                            "section_id": c.section_id,
                            "page_range": f"line:{c.line_start}-{c.line_end}",
                        }
                        vjson = {}
                        if args.verifier_mode == "qwen":
                            vres = chat_qwen(
                                args.base_url,
                                args.api_key,
                                args.model,
                                VERIFY_SYSTEM_PROMPT,
                                verify_prompt(pp, vmeta),
                                timeout_sec=args.verify_timeout_sec,
                            )
                            vmsg = (((vres.get("choices") or [{}])[0].get("message") or {}).get("content") or "").strip()
                            vjson = extract_json_block(vmsg)
                        else:
                            vjson = rule_verify_candidate(pp)
                            if vjson.get("decision") == "need_evidence":
                                try:
                                    vres = chat_qwen(
                                        args.base_url,
                                        args.api_key,
                                        args.model,
                                        VERIFY_SYSTEM_PROMPT,
                                        verify_prompt(pp, vmeta),
                                        timeout_sec=args.verify_timeout_sec,
                                    )
                                    vmsg = (((vres.get("choices") or [{}])[0].get("message") or {}).get("content") or "").strip()
                                    vjson = extract_json_block(vmsg)
                                except Exception:
                                    pass
                    decision = str(vjson.get("decision") or "").strip().lower()
                    vreason = str(vjson.get("reason") or "").strip()
                    if decision not in {"pass", "need_evidence", "reject"}:
                        decision = "need_evidence"
                        vreason = (vreason + " | invalid verifier decision").strip(" |")

                    draft = build_l0_draft(args.book_title, c, pp, args.proposer)
                    fc.write(
                        json.dumps(
                            {
                                "chunk_id": c.chunk_id,
                                "idx": pi,
                                "verifier": {"decision": decision, "reason": vreason},
                                "draft": draft,
                            },
                            ensure_ascii=False,
                        )
                        + "\n"
                    )
                    if decision == "reject":
                        fs.write(
                            json.dumps(
                                {
                                    "chunk_id": c.chunk_id,
                                    "idx": pi,
                                    "ok": False,
                                    "detail": f"verifier_reject: {vreason}",
                                    "principle_key": draft.get("principle_key"),
                                },
                                ensure_ascii=False,
                            )
                            + "\n"
                        )
                        continue
                    if args.submit_mode == "sqlite":
                        status = "DRAFT" if decision == "pass" else "NEED_EVIDENCE"
                        ok, detail = submit_draft_sqlite(args.sqlite_db, draft, status=status)
                    else:
                        ok, detail = post_local_draft(args.submit_url, draft)
                    if ok:
                        submit_ok += 1
                    fs.write(
                        json.dumps(
                            {
                                "chunk_id": c.chunk_id,
                                "idx": pi,
                                "ok": ok,
                                "detail": detail,
                                "principle_key": draft.get("principle_key"),
                            },
                            ensure_ascii=False,
                        )
                        + "\n"
                    )
            except Exception as e:
                fr.write(
                    json.dumps(
                        {"chunk_id": c.chunk_id, "line_start": c.line_start, "line_end": c.line_end, "error": str(e)},
                        ensure_ascii=False,
                    )
                    + "\n"
                )
            time.sleep(args.sleep_sec)

    print(
        json.dumps(
            {
                "chunks_total": len(chunks),
                "api_success_chunks": success_calls,
                "submitted_drafts_ok": submit_ok,
                "raw_out": str(raw_out),
                "candidates_out": str(cand_out),
                "submit_out": str(submit_out),
            },
            ensure_ascii=False,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
