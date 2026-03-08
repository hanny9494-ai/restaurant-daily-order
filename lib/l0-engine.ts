import Database from "better-sqlite3";
import { resolveDataFile } from "@/lib/data-paths";

type JsonValue = Record<string, unknown> | Array<unknown>;

export type L0CitationInput = {
  source_title: string;
  source_type?: string;
  reliability_tier?: "S" | "A" | "B";
  source_uri?: string;
  locator?: string;
  evidence_snippet: string;
};

export type SubmitL0DraftInput = {
  principle_key: string;
  claim: string;
  mechanism: string;
  boundary_conditions: Array<unknown>;
  control_variables?: JsonValue;
  expected_effects?: Array<unknown>;
  counter_examples?: Array<unknown>;
  evidence_level?: "low" | "medium" | "high";
  confidence?: number;
  change_reason: string;
  proposer: string;
  citations: L0CitationInput[];
};

type L0Row = {
  id: number;
  principle_key: string;
  version: number;
  status: "DRAFT" | "READY" | "PUBLISHED" | "REJECTED" | "NEED_EVIDENCE";
  claim: string;
  mechanism: string;
  control_variables: string;
  expected_effects: string;
  boundary_conditions: string;
  counter_examples: string;
  evidence_level: "low" | "medium" | "high";
  confidence: number;
  change_reason: string;
  proposer: string;
  reviewer: string | null;
  publisher: string | null;
  review_note: string | null;
  publish_note: string | null;
  created_at: string;
  reviewed_at: string | null;
  published_at: string | null;
};

const db = new Database(resolveDataFile(process.env.L0_DB_FILE || "l0_engine.db"));
db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS l0_principles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  principle_key TEXT NOT NULL,
  version INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('DRAFT', 'READY', 'PUBLISHED', 'REJECTED', 'NEED_EVIDENCE')),
  claim TEXT NOT NULL,
  mechanism TEXT NOT NULL,
  control_variables TEXT NOT NULL DEFAULT '{}',
  expected_effects TEXT NOT NULL DEFAULT '[]',
  boundary_conditions TEXT NOT NULL DEFAULT '[]',
  counter_examples TEXT NOT NULL DEFAULT '[]',
  evidence_level TEXT NOT NULL DEFAULT 'medium',
  confidence REAL NOT NULL DEFAULT 0.7,
  change_reason TEXT NOT NULL,
  proposer TEXT NOT NULL,
  reviewer TEXT,
  publisher TEXT,
  review_note TEXT,
  publish_note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  reviewed_at TEXT,
  published_at TEXT,
  UNIQUE(principle_key, version)
);

CREATE TABLE IF NOT EXISTS l0_citations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  l0_id INTEGER NOT NULL,
  source_title TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'book',
  reliability_tier TEXT NOT NULL DEFAULT 'A',
  source_uri TEXT,
  locator TEXT,
  evidence_snippet TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (l0_id) REFERENCES l0_principles(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_l0_principles_status ON l0_principles(status);
CREATE INDEX IF NOT EXISTS idx_l0_principles_key ON l0_principles(principle_key);
CREATE INDEX IF NOT EXISTS idx_l0_citations_l0_id ON l0_citations(l0_id);
`);

const statusCheckRow = db
  .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='l0_principles'")
  .get() as { sql?: string } | undefined;
if (statusCheckRow?.sql && !statusCheckRow.sql.includes("NEED_EVIDENCE")) {
  db.exec(`
    CREATE TABLE l0_principles_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      principle_key TEXT NOT NULL,
      version INTEGER NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('DRAFT', 'READY', 'PUBLISHED', 'REJECTED', 'NEED_EVIDENCE')),
      claim TEXT NOT NULL,
      mechanism TEXT NOT NULL,
      control_variables TEXT NOT NULL DEFAULT '{}',
      expected_effects TEXT NOT NULL DEFAULT '[]',
      boundary_conditions TEXT NOT NULL DEFAULT '[]',
      counter_examples TEXT NOT NULL DEFAULT '[]',
      evidence_level TEXT NOT NULL DEFAULT 'medium',
      confidence REAL NOT NULL DEFAULT 0.7,
      change_reason TEXT NOT NULL,
      proposer TEXT NOT NULL,
      reviewer TEXT,
      publisher TEXT,
      review_note TEXT,
      publish_note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      reviewed_at TEXT,
      published_at TEXT,
      UNIQUE(principle_key, version)
    );

    INSERT INTO l0_principles_new (
      id, principle_key, version, status, claim, mechanism, control_variables, expected_effects,
      boundary_conditions, counter_examples, evidence_level, confidence, change_reason, proposer,
      reviewer, publisher, review_note, publish_note, created_at, reviewed_at, published_at
    )
    SELECT
      id, principle_key, version, status, claim, mechanism, control_variables, expected_effects,
      boundary_conditions, counter_examples, evidence_level, confidence, change_reason, proposer,
      reviewer, publisher, review_note, publish_note, created_at, reviewed_at, published_at
    FROM l0_principles;

    DROP TABLE l0_principles;
    ALTER TABLE l0_principles_new RENAME TO l0_principles;
    CREATE INDEX IF NOT EXISTS idx_l0_principles_status ON l0_principles(status);
    CREATE INDEX IF NOT EXISTS idx_l0_principles_key ON l0_principles(principle_key);
  `);
}

function stringifyJson(value: unknown, fallback: string) {
  if (value === undefined) return fallback;
  return JSON.stringify(value);
}

function clampConfidence(value: number | undefined) {
  if (typeof value !== "number" || Number.isNaN(value)) return 0.7;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function getL0ById(id: number) {
  return db.prepare("SELECT * FROM l0_principles WHERE id = ?").get(id) as L0Row | undefined;
}

export function submitL0Draft(input: SubmitL0DraftInput) {
  const principleKey = input.principle_key.trim();
  const claim = input.claim.trim();
  const mechanism = input.mechanism.trim();
  const changeReason = input.change_reason.trim();
  const proposer = input.proposer.trim();

  if (!principleKey || !claim || !mechanism || !changeReason || !proposer) {
    throw new Error("INVALID_REQUIRED_FIELDS");
  }
  if (!Array.isArray(input.boundary_conditions) || input.boundary_conditions.length < 1) {
    throw new Error("BOUNDARY_CONDITIONS_REQUIRED");
  }
  if (!Array.isArray(input.citations) || input.citations.length < 1) {
    throw new Error("CITATIONS_REQUIRED");
  }

  const nextVersionRow = db
    .prepare("SELECT COALESCE(MAX(version), 0) + 1 AS next_version FROM l0_principles WHERE principle_key = ?")
    .get(principleKey) as { next_version: number };

  const insertDraft = db.prepare(`
    INSERT INTO l0_principles (
      principle_key, version, status, claim, mechanism,
      control_variables, expected_effects, boundary_conditions, counter_examples,
      evidence_level, confidence, change_reason, proposer
    ) VALUES (?, ?, 'DRAFT', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertCitation = db.prepare(`
    INSERT INTO l0_citations (
      l0_id, source_title, source_type, reliability_tier, source_uri, locator, evidence_snippet
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const tx = db.transaction(() => {
    const result = insertDraft.run(
      principleKey,
      nextVersionRow.next_version,
      claim,
      mechanism,
      stringifyJson(input.control_variables ?? {}, "{}"),
      stringifyJson(input.expected_effects ?? [], "[]"),
      stringifyJson(input.boundary_conditions, "[]"),
      stringifyJson(input.counter_examples ?? [], "[]"),
      input.evidence_level ?? "medium",
      clampConfidence(input.confidence),
      changeReason,
      proposer
    );

    const l0Id = Number(result.lastInsertRowid);
    for (const c of input.citations) {
      const sourceTitle = String(c.source_title || "").trim();
      const evidenceSnippet = String(c.evidence_snippet || "").trim();
      if (!sourceTitle || !evidenceSnippet) {
        throw new Error("INVALID_CITATION_FIELDS");
      }
      insertCitation.run(
        l0Id,
        sourceTitle,
        c.source_type ?? "book",
        c.reliability_tier ?? "A",
        c.source_uri ?? null,
        c.locator ?? null,
        evidenceSnippet
      );
    }
    return l0Id;
  });

  const l0Id = tx();
  return getL0ById(l0Id);
}

export function reviewL0Draft(
  id: number,
  reviewer: string,
  decision: "approve" | "reject" | "need_evidence",
  reviewNote?: string
) {
  const cleanReviewer = reviewer.trim();
  if (!cleanReviewer) {
    throw new Error("REVIEWER_REQUIRED");
  }

  const row = getL0ById(id);
  if (!row) throw new Error("NOT_FOUND");
  if (row.status !== "DRAFT") throw new Error("INVALID_STAGE");

  const nextStatus =
    decision === "approve"
      ? "READY"
      : decision === "need_evidence"
        ? "NEED_EVIDENCE"
        : "REJECTED";
  db.prepare(`
    UPDATE l0_principles
    SET status = ?, reviewer = ?, review_note = ?, reviewed_at = datetime('now')
    WHERE id = ?
  `).run(nextStatus, cleanReviewer, reviewNote?.trim() || null, id);

  return getL0ById(id);
}

export function publishL0Draft(id: number, publisher: string, publishNote?: string) {
  const cleanPublisher = publisher.trim();
  if (!cleanPublisher) throw new Error("PUBLISHER_REQUIRED");

  const row = getL0ById(id);
  if (!row) throw new Error("NOT_FOUND");
  if (row.status !== "READY") throw new Error("INVALID_STAGE");

  const citationRow = db
    .prepare("SELECT COUNT(*) AS c FROM l0_citations WHERE l0_id = ?")
    .get(id) as { c: number };
  if (citationRow.c < 1) {
    throw new Error("NO_CITATION");
  }

  db.prepare(`
    UPDATE l0_principles
    SET status = 'PUBLISHED', publisher = ?, publish_note = ?, published_at = datetime('now')
    WHERE id = ?
  `).run(cleanPublisher, publishNote?.trim() || null, id);

  return getL0ById(id);
}

export function listL0Changes(limit = 50) {
  const safeLimit = Math.min(Math.max(limit, 1), 200);
  return db
    .prepare(`
      SELECT
        p.id,
        p.principle_key,
        p.version,
        p.status,
        p.claim,
        p.change_reason,
        p.proposer,
        p.reviewer,
        p.publisher,
        p.created_at,
        p.reviewed_at,
        p.published_at,
        (SELECT COUNT(*) FROM l0_citations c WHERE c.l0_id = p.id) AS citations_count
      FROM l0_principles p
      ORDER BY p.id DESC
      LIMIT ?
    `)
    .all(safeLimit);
}

export function getL0ChangeDetail(id: number) {
  const row = db
    .prepare(`
      SELECT *
      FROM l0_principles
      WHERE id = ?
      LIMIT 1
    `)
    .get(id) as L0Row | undefined;

  if (!row) return null;

  const citations = db
    .prepare(`
      SELECT id, source_title, source_type, reliability_tier, source_uri, locator, evidence_snippet, created_at
      FROM l0_citations
      WHERE l0_id = ?
      ORDER BY id ASC
    `)
    .all(id);

  return {
    ...row,
    citations
  };
}
