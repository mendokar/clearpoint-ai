import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AdminNav } from "@/components/admin/AdminNav";
import { RequireAdmin } from "@/components/admin/RequireAdmin";

export const metadata: Metadata = {
  title: { default: "Panel de administración", template: "%s · Admin · Colchones Contoso" },
  robots: { index: false, follow: false, nocache: true },
};

/** Panel de administración. Guarda de cliente + autorización real en `/api/admin/**`. */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="wrap py-10">
      <span className="eyebrow block">Colchones Contoso</span>
      <h1 className="page-title mt-2 mb-6">Panel de administración</h1>
      <RequireAdmin>
        <AdminNav />
        {children}
      </RequireAdmin>
    </div>
  );
}
