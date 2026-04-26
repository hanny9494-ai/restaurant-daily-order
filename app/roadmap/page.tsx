"use client";

import { useState } from "react";

type StatusKey = "done" | "wip" | "todo" | "new" | "partial";

type TreeNode = {
  id: string;
  name: string;
  status: StatusKey;
  note?: string;
  children?: TreeNode[];
};

type PhaseNode = TreeNode & {
  phase: string;
};

const STATUS = {
  done: { bg: "#c6f6d5", border: "#1d6b45", text: "#1d6b45", dot: "#1d6b45", label: "✓ 完成" },
  wip: { bg: "#bee3f8", border: "#2e6b9e", text: "#2e6b9e", dot: "#2e6b9e", label: "⟳ 进行中" },
  todo: { bg: "#f7fafc", border: "#cbd5e0", text: "#718096", dot: "#cbd5e0", label: "○ 待做" },
  new: { bg: "#fef3cd", border: "#c8883a", text: "#c8883a", dot: "#c8883a", label: "★ 新增" },
  partial: { bg: "#e9d8fd", border: "#6b46c1", text: "#6b46c1", dot: "#6b46c1", label: "◑ 部分" },
} as const;

const TREE: PhaseNode[] = [
  {
    id: "phase0",
    phase: "Phase 0",
    name: "书库准备",
    status: "partial",
    children: [
      { id: "ofc", name: "On Food and Cooking (OFC)", status: "done", note: "306题来源" },
      {
        id: "mc",
        name: "Modernist Cuisine Vol 1–4",
        status: "wip",
        note: "Stage1进行中",
        children: [
          { id: "mc_pdf", name: "PDF提取 (MinerU + qwen3-vl-plus)", status: "done" },
          { id: "mc_merge", name: "Merge：页码精确匹配", status: "done" },
          { id: "mc_s4", name: "Stage4 Chonkie 语义切分", status: "todo" },
          { id: "mc_s5", name: "Stage5 qwen3.5:9b topic标注", status: "todo" },
        ],
      },
      {
        id: "batch2",
        name: "第二批12本书",
        status: "todo",
        note: "Neurogastronomy / Mouthfeel / 发酵等",
        children: [
          { id: "b2_neuro", name: "Neurogastronomy", status: "todo" },
          { id: "b2_mouth", name: "Mouthfeel", status: "todo" },
          { id: "b2_ferment", name: "The Art of Fermentation", status: "todo" },
          { id: "b2_others", name: "其余9本…", status: "todo" },
        ],
      },
      {
        id: "cant_src",
        name: "粤菜资料（待收集）",
        status: "todo",
        children: [
          { id: "cant_books", name: "粤菜书籍（陈钢文等）", status: "todo" },
          { id: "cant_manual", name: "酒楼内部培训手册", status: "todo" },
        ],
      },
    ],
  },
  {
    id: "phase1",
    phase: "Phase 1",
    name: "L0 原理库构建",
    status: "wip",
    children: [
      { id: "q306", name: "306道科学题（14 domain，已完成）", status: "done", note: "Jeff + AI设计" },
      {
        id: "s2",
        name: "Stage 2：Embedding 语义匹配",
        status: "partial",
        note: "OFC完成 / MC待做",
        children: [
          { id: "s2_gemini", name: "切换 Gemini Embedding 2", status: "todo" },
          { id: "s2_match", name: "每题 → top3 chunks (cosine)", status: "done" },
          { id: "s2_out", name: "question_chunk_matches.json", status: "done" },
        ],
      },
      {
        id: "s3a",
        name: "Stage 3A：原理蒸馏（Claude Opus）",
        status: "done",
        note: "OFC → 303条",
        children: [
          { id: "s3a_in", name: "题目 + chunks → Opus", status: "done" },
          { id: "s3a_out", name: "l0_principles_fixed.jsonl（303条）", status: "done" },
        ],
      },
      {
        id: "s3b",
        name: "Stage 3B：因果链补充 ★",
        status: "new",
        note: "现在就能做 · ~$6",
        children: [
          { id: "s3b_type", name: "判断 proposition_type（4类）", status: "todo" },
          { id: "s3b_chain", name: "提取 causal_chain_steps（3–6步）", status: "todo" },
          { id: "s3b_split", name: "复合命题拆分检测", status: "todo" },
          { id: "s3b_zones", name: "多区间 boundary_zones", status: "todo" },
          { id: "s3b_out", name: "l0_principles_v2.jsonl（~332条）", status: "todo" },
        ],
      },
      {
        id: "gap",
        name: "逆向补题（MC完成后）★",
        status: "new",
        note: "数据驱动发现盲区",
        children: [
          { id: "gap_low", name: "扫描低命中chunk (cosine < 0.55)", status: "todo" },
          { id: "gap_gen", name: "生成候选新题（Claude）", status: "todo" },
          { id: "gap_review", name: "Jeff审核 HTML 界面", status: "todo" },
          { id: "gap_add", name: "新题加入题库 → 重跑 Stage2+3", status: "todo" },
        ],
      },
      {
        id: "s35",
        name: "Stage 3.5：粤菜映射",
        status: "todo",
        note: "Stage3B后",
        children: [
          { id: "s35_gen", name: "generate_chinese_mapping.py", status: "todo" },
          { id: "s35_review", name: "Jeff人工审核（review_tool.html）", status: "todo" },
          { id: "s35_chef", name: "师傅二次验证", status: "todo" },
        ],
      },
    ],
  },
  {
    id: "phase2",
    phase: "Phase 2",
    name: "知识图谱构建",
    status: "todo",
    children: [
      {
        id: "weaviate",
        name: "Weaviate — 向量层",
        status: "todo",
        children: [
          { id: "w_schema", name: "FoodScienceChunk schema", status: "todo" },
          { id: "w_embed", name: "Gemini Embedding 2 向量化", status: "todo" },
          { id: "w_query", name: "Domain过滤 + 语义检索", status: "todo" },
        ],
      },
      {
        id: "neo4j",
        name: "Neo4j — 图谱层",
        status: "todo",
        children: [
          { id: "n_docker", name: "Docker 部署", status: "todo" },
          { id: "n_schema", name: "Schema v2（含 CausalStep 节点）", status: "todo" },
          { id: "n_import", name: "332+条原理导入", status: "todo" },
          { id: "n_hyper", name: "超边 compound_condition（MC后）", status: "todo" },
        ],
      },
      { id: "cognee", name: "Cognee — 增量学习", status: "todo" },
    ],
  },
  {
    id: "phase3",
    phase: "Phase 3",
    name: "L6 风味审美层",
    status: "todo",
    children: [
      {
        id: "flavor_bible",
        name: "Flavor Bible 结构化",
        status: "todo",
        children: [
          { id: "fb_import", name: "风味搭配关系 → Neo4j节点", status: "todo" },
          { id: "ft_import", name: "Flavor Thesaurus → 语义关联", status: "todo" },
        ],
      },
      {
        id: "l6_cant",
        name: "粤菜审美语言层",
        status: "todo",
        children: [
          { id: "l6_vocab", name: "核心审美词：嫩 / 爽 / 鲜 / 香 / 滑", status: "todo" },
          { id: "l6_map", name: "审美词 → L0 参数映射", status: "todo" },
        ],
      },
    ],
  },
  {
    id: "phase4",
    phase: "Phase 4",
    name: "查询引擎",
    status: "todo",
    children: [
      {
        id: "hirag",
        name: "HiRAG 三层漏斗",
        status: "todo",
        children: [
          { id: "h_global", name: "Global层：Domain 意图图谱", status: "todo" },
          { id: "h_bridge", name: "Bridge层：scientific_statement", status: "todo" },
          { id: "h_local", name: "Local层：Neo4j 参数边界", status: "todo" },
        ],
      },
      {
        id: "kag",
        name: "KAG 逻辑形式分解",
        status: "todo",
        children: [
          { id: "k_retrieve", name: "Retrieve(domain, entity)", status: "todo" },
          { id: "k_deduce", name: "Deduce(比较推断)", status: "todo" },
          { id: "k_math", name: "Math(数值计算)", status: "todo" },
          { id: "k_output", name: "Output(L6 审美翻译)", status: "todo" },
        ],
      },
      {
        id: "router",
        name: "路由模型 qwen3:0.6b",
        status: "todo",
        children: [
          { id: "r_schema", name: "查询分类 schema", status: "todo" },
          { id: "r_synth", name: "1000+ 合成训练样本", status: "todo" },
          { id: "r_finetune", name: "Fine-tune 路由模型", status: "todo" },
        ],
      },
    ],
  },
  {
    id: "phase5",
    phase: "Phase 5",
    name: "Station 应用层",
    status: "todo",
    children: [
      { id: "st_wok", name: "炒锅站（镬气 · 快炒蛋白质变性）", status: "todo" },
      { id: "st_stock", name: "上杂站（高汤萃取 · 胶原转化）", status: "todo" },
      { id: "st_siumei", name: "烧腊站（美拉德 · 腌制渗透）", status: "todo" },
      { id: "st_dimsum", name: "点心站（面团流变 · 蒸汽传热）", status: "todo" },
      { id: "st_chop", name: "砧板站（刀工 · 腌制化学）", status: "todo" },
    ],
  },
  {
    id: "phase6",
    phase: "Phase 6",
    name: "合成数据 & 模型训练",
    status: "todo",
    children: [
      { id: "syn_gen", name: "L0 × L6 生成推理链（海量合成）", status: "todo" },
      { id: "val_20", name: "20道粤菜验证集（白切鸡等）", status: "todo" },
      { id: "syn_train", name: "Fine-tune 烹饪推理专属模型", status: "todo" },
    ],
  },
] ;

function countStatus(nodes: TreeNode[]) {
  let done = 0;
  let wip = 0;
  let todo = 0;

  const walk = (arr: TreeNode[]) => {
    arr.forEach((node) => {
      if (node.status === "done") done += 1;
      else if (["wip", "partial", "new"].includes(node.status)) wip += 1;
      else todo += 1;

      if (node.children) walk(node.children);
    });
  };

  walk(nodes);
  return { done, wip, todo, total: done + wip + todo };
}

function Node({ node, depth = 0 }: { node: TreeNode; depth?: number }) {
  const [open, setOpen] = useState(depth < 2);
  const s = STATUS[node.status] ?? STATUS.todo;
  const hasChildren = (node.children?.length ?? 0) > 0;

  return (
    <div style={{ marginLeft: depth * 18 }}>
      <div
        onClick={() => hasChildren && setOpen((value) => !value)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 7,
          padding: "4px 10px 4px 6px",
          marginBottom: 3,
          borderRadius: 6,
          background: s.bg,
          border: `1px solid ${s.border}`,
          cursor: hasChildren ? "pointer" : "default",
          userSelect: "none",
        }}
      >
        {depth > 0 && <div style={{ width: 10, height: 1, background: "#cbd5e0", flexShrink: 0 }} />}
        {hasChildren ? (
          <span style={{ color: s.text, fontSize: 10, width: 12, textAlign: "center", flexShrink: 0 }}>
            {open ? "▾" : "▸"}
          </span>
        ) : (
          <span
            style={{
              display: "inline-block",
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: s.dot,
              marginLeft: 2,
              flexShrink: 0,
            }}
          />
        )}
        <span style={{ fontSize: 13, color: s.text, fontWeight: depth === 0 ? 700 : 500, flex: 1, lineHeight: 1.3 }}>
          {node.name}
        </span>
        {node.note && (
          <span style={{ fontSize: 11, color: "#a0aec0", fontStyle: "italic", flexShrink: 0, marginLeft: 4 }}>
            {node.note}
          </span>
        )}
        <span
          style={{
            fontSize: 10,
            fontWeight: 600,
            padding: "1px 6px",
            borderRadius: 10,
            background: "rgba(255,255,255,0.75)",
            color: s.text,
            flexShrink: 0,
            marginLeft: 4,
          }}
        >
          {s.label}
        </span>
      </div>
      {hasChildren && open && (
        <div style={{ marginLeft: 12, paddingLeft: 10, borderLeft: `2px solid ${s.border}25` }}>
          {node.children?.map((child) => (
            <Node key={child.id} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

function Phase({ phase }: { phase: PhaseNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const st = countStatus(phase.children ?? []);
  const colors: Record<string, string> = {
    "Phase 0": "#1a3c5e",
    "Phase 1": "#1d6b45",
    "Phase 2": "#6b46c1",
    "Phase 3": "#c8883a",
    "Phase 4": "#b5342a",
    "Phase 5": "#0e7c7b",
    "Phase 6": "#718096",
  };
  const bg = colors[phase.phase] ?? "#1a3c5e";

  return (
    <div
      style={{
        marginBottom: 14,
        borderRadius: 10,
        border: `1px solid ${bg}35`,
        overflow: "hidden",
        boxShadow: "0 1px 3px rgba(0,0,0,0.07)",
      }}
    >
      <div
        onClick={() => setCollapsed((value) => !value)}
        style={{
          background: bg,
          color: "white",
          padding: "10px 16px",
          display: "flex",
          alignItems: "center",
          gap: 10,
          cursor: "pointer",
          userSelect: "none",
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            opacity: 0.65,
            background: "rgba(255,255,255,0.15)",
            padding: "1px 7px",
            borderRadius: 9,
          }}
        >
          {phase.phase}
        </span>
        <span style={{ fontSize: 14, fontWeight: 700, flex: 1 }}>{phase.name}</span>
        <span style={{ fontSize: 11, opacity: 0.8 }}>
          {st.done > 0 && <span style={{ color: "#68d391", marginRight: 5 }}>✓{st.done}</span>}
          {st.wip > 0 && <span style={{ color: "#bee3f8", marginRight: 5 }}>⟳{st.wip}</span>}
          {st.todo > 0 && <span style={{ color: "rgba(255,255,255,0.4)" }}>○{st.todo}</span>}
        </span>
        <span style={{ opacity: 0.55, fontSize: 11 }}>{collapsed ? "▸" : "▾"}</span>
      </div>
      {!collapsed && (
        <div style={{ padding: "10px 10px 6px" }}>
          {phase.children?.map((child) => (
            <Node key={child.id} node={child} depth={0} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function RoadmapPage() {
  const all = countStatus(TREE.flatMap((phase) => phase.children ?? []));
  const pct = Math.round((all.done / all.total) * 100);

  return (
    <div
      style={{
        fontFamily: "-apple-system, 'PingFang SC', sans-serif",
        background: "#f0f4f8",
        minHeight: "100vh",
        paddingBottom: 40,
      }}
    >
      <div style={{ background: "#1a3c5e", color: "white", padding: "16px 22px 14px", marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700 }}>餐饮研发引擎 — 完整流程树</div>
            <div style={{ fontSize: 11, opacity: 0.55, marginTop: 2 }}>Culinary R&amp;D Engine · 2026.03</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 11, opacity: 0.65 }}>总进度</span>
            <div
              style={{
                width: 120,
                height: 7,
                background: "rgba(255,255,255,0.15)",
                borderRadius: 4,
                overflow: "hidden",
              }}
            >
              <div style={{ width: `${pct}%`, height: "100%", background: "#68d391", borderRadius: 4 }} />
            </div>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#68d391" }}>{pct}%</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 16, marginTop: 12, flexWrap: "wrap", alignItems: "center" }}>
          {Object.entries(STATUS).map(([key, value]) => (
            <div key={key} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11 }}>
              <div style={{ width: 9, height: 9, borderRadius: 2, background: value.bg, border: `1px solid ${value.border}` }} />
              <span style={{ color: "rgba(255,255,255,0.65)" }}>{value.label}</span>
            </div>
          ))}
          <div style={{ marginLeft: "auto", fontSize: 11, opacity: 0.6 }}>
            ✓{all.done} ⟳{all.wip} ○{all.todo} / {all.total}节点
          </div>
        </div>
      </div>
      <div style={{ maxWidth: 880, margin: "0 auto", padding: "0 14px" }}>
        {TREE.map((phase) => (
          <Phase key={phase.id} phase={phase} />
        ))}
        <div
          style={{
            marginTop: 16,
            padding: "12px 16px",
            background: "white",
            borderRadius: 10,
            border: "1px solid #e2e8f0",
            fontSize: 12,
            color: "#718096",
            lineHeight: 1.9,
          }}
        >
          <strong style={{ color: "#1a3c5e" }}>当前最优先：</strong>
          ① MC Vol2补跑 → Vol3/4 Stage4+5（Chonkie）→ ② Stage3B因果链补充（已有脚本，~$6）→ ③ Gemini Embedding
          2 + Weaviate填充 → ④ Neo4j搭建导入 → ⑤ 20道粤菜验证集
        </div>
      </div>
    </div>
  );
}
