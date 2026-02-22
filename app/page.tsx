import Link from "next/link";

export default function HomePage() {
  return (
    <main className="container">
      <h1>极简餐厅下货工具</h1>
      <div className="row">
        <Link href="/order" className="btn">去下单端</Link>
        <Link href="/dashboard" className="btn secondary">去汇总端</Link>
        <Link href="/docs" className="btn secondary">技术文档中心</Link>
      </div>
    </main>
  );
}
