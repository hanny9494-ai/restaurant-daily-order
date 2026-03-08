#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Iterable

from docx import Document
from docx.document import Document as DocumentObject
from docx.oxml.table import CT_Tbl
from docx.oxml.text.paragraph import CT_P
from docx.table import Table
from docx.text.paragraph import Paragraph


def iter_block_items(parent: DocumentObject) -> Iterable[Paragraph | Table]:
    parent_elm = parent.element.body
    for child in parent_elm.iterchildren():
        if isinstance(child, CT_P):
            yield Paragraph(child, parent)
        elif isinstance(child, CT_Tbl):
            yield Table(child, parent)


def table_to_rows(table: Table) -> list[list[str]]:
    rows: list[list[str]] = []
    for row in table.rows:
        rows.append([cell.text.strip() for cell in row.cells])
    return rows


def render_markdown(blocks: list[dict]) -> str:
    lines: list[str] = []
    for block in blocks:
      if block["type"] == "paragraph":
          text = block["text"].strip()
          if text:
              lines.append(text)
              lines.append("")
      elif block["type"] == "table":
          rows = block["rows"]
          if not rows:
              continue
          width = max(len(row) for row in rows)
          padded = [row + [""] * (width - len(row)) for row in rows]
          header = padded[0]
          lines.append(f"| {' | '.join(header)} |")
          lines.append(f"| {' | '.join(['---'] * width)} |")
          for row in padded[1:]:
              lines.append(f"| {' | '.join(row)} |")
          lines.append("")
    return "\n".join(lines).strip() + "\n"


def main() -> None:
    parser = argparse.ArgumentParser(description="Probe DOCX recipe structure.")
    parser.add_argument("input_docx", help="Path to DOCX file")
    parser.add_argument("--markdown-out", help="Write ordered markdown extraction")
    parser.add_argument("--json-out", help="Write JSON structure dump")
    args = parser.parse_args()

    input_path = Path(args.input_docx)
    doc = Document(str(input_path))

    blocks: list[dict] = []
    for block in iter_block_items(doc):
        if isinstance(block, Paragraph):
            text = block.text.strip()
            if text:
                blocks.append({
                    "type": "paragraph",
                    "style": block.style.name if block.style else "",
                    "text": text,
                })
        elif isinstance(block, Table):
            rows = table_to_rows(block)
            if any(any(cell for cell in row) for row in rows):
                blocks.append({
                    "type": "table",
                    "rows": rows,
                })

    summary = {
        "file": str(input_path),
        "paragraphs": sum(1 for b in blocks if b["type"] == "paragraph"),
        "tables": sum(1 for b in blocks if b["type"] == "table"),
        "blocks": blocks,
    }

    if args.json_out:
        Path(args.json_out).write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    else:
        print(json.dumps(summary, ensure_ascii=False, indent=2))

    if args.markdown_out:
        Path(args.markdown_out).write_text(render_markdown(blocks), encoding="utf-8")


if __name__ == "__main__":
    main()
