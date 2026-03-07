import Link from "next/link";

export default function UiPage() {
  return (
    <main className="container">
      <h1>餐厅食谱 UI</h1>
      <section className="card">
        <h2>入口</h2>
        <p className="muted" style={{ marginBottom: 8 }}>
          拖拽上传食谱文件在「食谱系统」页面（/recipes）内，不在本页。
        </p>
        <div className="row">
          <Link href="/recipes" className="btn">去拖拽上传页（/recipes）</Link>
          <Link href="/recipes/new" className="btn">食谱增加</Link>
          <Link href="/recipes/view" className="btn secondary">食谱查看 / 修改（JSON）</Link>
          <Link href="/foh" className="btn secondary">前厅端口（忌口识别）</Link>
          <Link href="/recipes/approvals" className="btn secondary">审批中心</Link>
        </div>
      </section>

      <section className="card">
        <h2>说明</h2>
        <p className="muted">MENU：季度菜单食谱（建议填写菜单周期，例如 2026Q2）。</p>
        <p className="muted">BACKBONE：基础母配方（跨菜单长期复用）。</p>
      </section>
    </main>
  );
}
