import Link from "next/link";
import { IBM_Plex_Sans, Noto_Serif_SC, JetBrains_Mono } from "next/font/google";
import styles from "./docs.module.css";

const sans = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });
const serif = Noto_Serif_SC({ subsets: ["latin"], weight: ["500", "600", "700"] });
const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "600"] });

const milestones = [
  { date: "2026-02-20", title: "打通转换流水线", detail: "OCR / MinerU / 上传 Dify 的主流程稳定。" },
  { date: "2026-02-21", title: "感官语言库完成", detail: "EN/JA/ZH 三语内容沉淀，形成可复用描述体系。" },
  { date: "2026-02-22", title: "研发机器人 v7 跑通", detail: "分类、检索、主模型链路可运行，并沉淀 DSL 调试规范。" }
];

const priorities = [
  "P1: 修复首轮阶段误判（首条输入强制阶段1）",
  "P2: 提升跨语言检索（query rewriting / 多语 embedding）",
  "P3: 固化 Ollama 开机自启（launchd）",
  "P4: 清理 OCR 噪声并重传受影响文档",
  "P5: 引入 14b 阶段路由，降低 API 成本"
];

export default function DocsPortalPage() {
  return (
    <main className={`${styles.page} ${sans.className}`}>
      <section className={styles.bgLayer} aria-hidden />

      <header className={styles.hero}>
        <p className={styles.kicker}>CULINARY AI PROJECT</p>
        <h1 className={`${styles.title} ${serif.className}`}>技术文档中心</h1>
        <p className={styles.subtitle}>不是阅读器，而是面向执行的项目作战面板。</p>
        <div className={styles.heroActions}>
          <Link href="https://github.com/hanny9494-ai/restaurant-daily-order/blob/main/handover/LIVE_CONTEXT.md" className={styles.cta}>
            打开 Live Context
          </Link>
          <Link href="/order" className={styles.ghost}>
            打开下单端
          </Link>
        </div>
      </header>

      <div className={styles.layout}>
        <aside className={styles.sideNav}>
          <p className={styles.sideLabel}>导航</p>
          <a href="#status">当前状态</a>
          <a href="#runbook">运行手册</a>
          <a href="#session">会话协议</a>
          <a href="#timeline">里程碑</a>
          <a href="#risk">重点待办</a>
        </aside>

        <section className={styles.content}>
          <article id="status" className={styles.card}>
            <h2>当前状态</h2>
            <div className={styles.badges}>
              <span className={styles.badgeOk}>v7 可运行</span>
              <span className={styles.badgeInfo}>6 库已成型</span>
              <span className={styles.badgeWarn}>P1-P5 待优化</span>
            </div>
            <p>
              当前主链路：阶段分类器（qwen2.5:7b）→ 双路知识检索 → 主模型（qwen3.5-plus）。
              已进入“可用 + 持续优化”阶段。
            </p>
          </article>

          <article id="runbook" className={styles.card}>
            <h2>运行手册（Runbook）</h2>
            <pre className={`${styles.code} ${mono.className}`}>
{`OLLAMA_HOST=0.0.0.0:11434 ollama serve
cd ~/culinary-ai && docker compose up -d
conda activate paddleocr`}
            </pre>
            <p>每次重启后先确认 Ollama 与 Dify 可达，再进行 DSL 或知识库调试。</p>
          </article>

          <article id="session" className={styles.card}>
            <h2>AI 会话协议</h2>
            <pre className={`${styles.code} ${mono.className}`}>
{`npm run status:session:start -- --goal "本次目标" --plan "执行计划"
npm run status:session:end -- --summary "会话总结" --done "完成A|完成B" --pending "未完成A" --next "下一步A|下一步B"
npm run status:check
npm run status:push -- --message "chore(handover): session update"`}
            </pre>
            <p>规则：先读 Live Context，结束必须写 session 报告，并通过文档检查。</p>
          </article>

          <article id="timeline" className={styles.card}>
            <h2>里程碑时间线</h2>
            <ul className={styles.timeline}>
              {milestones.map((item) => (
                <li key={item.date + item.title}>
                  <span className={styles.time}>{item.date}</span>
                  <div>
                    <strong>{item.title}</strong>
                    <p>{item.detail}</p>
                  </div>
                </li>
              ))}
            </ul>
          </article>

          <article id="risk" className={styles.card}>
            <h2>重点待办（价值优先）</h2>
            <ul className={styles.priorityList}>
              {priorities.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>
        </section>
      </div>
    </main>
  );
}
