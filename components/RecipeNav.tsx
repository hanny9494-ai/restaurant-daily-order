"use client";

import Link from "next/link";

type RecipeNavProps = {
  current: "hub" | "new" | "view" | "edit" | "menus" | "approvals";
};

type VisibleNavKey = "hub" | "view" | "approvals";

const items: Array<{ key: VisibleNavKey; href: string; label: string }> = [
  { key: "hub", href: "/recipes", label: "录入工作台" },
  { key: "view", href: "/recipes/view", label: "查看菜谱" },
  { key: "approvals", href: "/recipes/approvals", label: "审批中心" }
];

export default function RecipeNav({ current }: RecipeNavProps) {
  const normalizedCurrent: VisibleNavKey =
    current === "new" || current === "edit" || current === "menus"
      ? "hub"
      : current;
  return (
    <nav className="ui24-nav">
      {items.map((item) => (
        <Link
          key={item.key}
          href={item.href}
          className={item.key === normalizedCurrent ? "ui24-btn" : "ui24-btn ui24-btn-ghost"}
          aria-current={item.key === normalizedCurrent ? "page" : undefined}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
