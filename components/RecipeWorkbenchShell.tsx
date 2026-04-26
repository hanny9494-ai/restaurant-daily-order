"use client";

import type { ReactNode } from "react";
import RecipeNav from "@/components/RecipeNav";

type RecipeWorkbenchShellProps = {
  current: "hub" | "new" | "view" | "edit" | "menus" | "approvals";
  title: string;
  description?: string;
  children: ReactNode;
  actions?: ReactNode;
};

export default function RecipeWorkbenchShell(props: RecipeWorkbenchShellProps) {
  const { current, title, description, children, actions } = props;
  return (
    <div className="ui24-body">
      <header className="ui24-topbar">
        <div className="ui24-topbar-inner">
          <div className="ui24-brand">食谱系统</div>
          <RecipeNav current={current} />
        </div>
      </header>

      <main className="ui24-wrap">
        <section className="ui24-card" style={{ marginBottom: 14 }}>
          <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <h1 style={{ marginBottom: 8 }}>{title}</h1>
              {description ? <div className="ui24-muted">{description}</div> : null}
            </div>
            {actions ? <div className="row">{actions}</div> : null}
          </div>
        </section>
        {children}
      </main>
    </div>
  );
}
