import Link from "next/link";

export default function HomePage() {
  return (
    <div className="ui24-body">
      <header className="ui24-topbar">
        <div className="ui24-topbar-inner">
          <div className="ui24-brand">餐厅管理系统</div>
          <div className="ui24-muted">v2.4</div>
        </div>
      </header>

      <main className="ui24-wrap">
        <section style={{ marginBottom: 16 }}>
          <p className="ui24-muted" style={{ marginBottom: 6 }}>早上好</p>
          <h1 className="ui24-title">店长工作台</h1>
        </section>

        <section className="ui24-grid-3" style={{ marginBottom: 16 }}>
          <div className="ui24-card">
            <div className="ui24-muted">今日收货</div>
            <div style={{ fontSize: 28, fontWeight: 700 }}>12 单</div>
          </div>
          <div className="ui24-card">
            <div className="ui24-muted">待审核食谱</div>
            <div style={{ fontSize: 28, fontWeight: 700 }}>5 个</div>
          </div>
          <div className="ui24-card">
            <div className="ui24-muted">忌口查询</div>
            <div style={{ fontSize: 28, fontWeight: 700 }}>8 次</div>
          </div>
        </section>

        <section style={{ marginBottom: 16 }}>
          <h2 style={{ marginBottom: 10 }}>快捷操作</h2>
          <div className="ui24-grid-2">
            <Link href="/receiving" className="ui24-card ui24-card-press" style={{ textDecoration: "none", color: "inherit" }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>拍照收货</div>
              <div className="ui24-muted">AI 识别来货单并入库</div>
            </Link>
            <Link href="/recipes" className="ui24-card ui24-card-press" style={{ textDecoration: "none", color: "inherit" }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>导入食谱</div>
              <div className="ui24-muted">支持拖拽上传和文本解析</div>
            </Link>
            <Link href="/recipes/view" className="ui24-card ui24-card-press" style={{ textDecoration: "none", color: "inherit" }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>查看/修改食谱</div>
              <div className="ui24-muted">表格查看，在线修改并审批</div>
            </Link>
            <Link href="/foh" className="ui24-card ui24-card-press" style={{ textDecoration: "none", color: "inherit" }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>前厅忌口端口</div>
              <div className="ui24-muted">输入客人忌口并分析菜品</div>
            </Link>
          </div>
        </section>

        <section className="ui24-card">
          <h2 style={{ marginBottom: 10 }}>系统入口</h2>
          <div className="row">
            <Link href="/order" className="ui24-btn ui24-btn-ghost">下单</Link>
            <Link href="/dashboard" className="ui24-btn ui24-btn-ghost">汇总</Link>
            <Link href="/dashboard/manage" className="ui24-btn ui24-btn-ghost">管理设置</Link>
            <Link href="/recipes/approvals" className="ui24-btn ui24-btn-ghost">审批中心</Link>
          </div>
        </section>
      </main>
    </div>
  );
}
