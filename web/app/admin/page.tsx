import Link from "next/link";
import { AdminSummary } from "@/components/admin/AdminSummary";
import { ArrowRight } from "@/components/ui/Icons";

export default function AdminHome() {
  const cards = [
    {
      href: "/admin/productos",
      title: "Productos",
      text: "Crea, edita, activa o desactiva colchones, sus opciones y variantes con precio y stock.",
    },
    {
      href: "/admin/pedidos",
      title: "Pedidos",
      text: "Consulta todos los pedidos y avanza su estado: preparación, envío con seguimiento y entrega.",
    },
  ];
  return (
    <div className="flex flex-col gap-8">
    <AdminSummary />
    <div className="grid gap-6 md:grid-cols-2">
      {cards.map((c) => (
        <Link key={c.href} href={c.href} className="card lift group flex flex-col gap-3 p-6 no-underline hover:border-aji">
          <h2 className="text-2xl font-bold">{c.title}</h2>
          <p className="text-muted">{c.text}</p>
          <span className="mt-auto inline-flex items-center gap-2 font-semibold text-aji-ink">
            Abrir <ArrowRight />
          </span>
        </Link>
      ))}
      <p className="text-sm text-muted md:col-span-2">
        Los cambios se guardan en Firestore y se ven al momento en la tienda y en el asistente.
      </p>
    </div>
    </div>
  );
}
