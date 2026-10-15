import type { Metadata } from "next";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { OpenChatButton } from "@/components/chat/ChatContext";
import { getShippingPolicy } from "@/lib/content";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Envíos y devoluciones",
  description: "Plazos y costes de envío en España, 30 días de devolución, cambios de medida y garantía.",
};

export default async function ShippingPage() {
  const md = await getShippingPolicy();
  return (
    <div className="wrap grid gap-10 py-10 lg:grid-cols-[1fr_18rem]">
      <article className="prose-contoso min-w-0">
        <span className="eyebrow">Ayuda</span>
        <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml>
          {md}
        </ReactMarkdown>
      </article>
      <aside className="flex flex-col gap-4 self-start rounded-[21px] bg-tint p-6 lg:sticky lg:top-28">
        <h2 className="text-xl font-bold">¿Te queda alguna duda?</h2>
        <p className="text-sm text-muted">
          Pregunta al asistente por plazos, devoluciones o el estado de tu pedido.
        </p>
        <OpenChatButton className="btn btn-primary">Preguntar al asistente</OpenChatButton>
      </aside>
    </div>
  );
}
