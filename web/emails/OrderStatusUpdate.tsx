import { Body, Container, Head, Heading, Hr, Html, Link, Preview, Section, Text } from "@react-email/components";
import type { NotifiableStatus, OrderEmail } from "@/lib/email/sender";
import { STATUS_LABELS } from "../lib/orders/status";
import { formatOptions } from "../lib/format";
import { emailColors as c, longDate } from "./emailTheme";

const COPY: Record<NotifiableStatus, { preview: (n: string) => string; title: string; body: string }> = {
  shipped: {
    preview: (n) => `Tu pedido ${n} va de camino`,
    title: "Tu colchón va de camino",
    body: "Ha salido de nuestro almacén de Madrid. Llega enrollado en una caja que cabe por cualquier puerta.",
  },
  delivered: {
    preview: (n) => `Tu pedido ${n} se ha entregado`,
    title: "¡Entregado! Que descanses",
    body: "Desenróllalo y déjalo airear unas horas antes de dormir. Desde hoy cuentan tus 30 noches de prueba.",
  },
  cancelled: {
    preview: (n) => `Tu pedido ${n} se ha cancelado`,
    title: "Hemos cancelado tu pedido",
    body: "Si ya se había cobrado, te devolveremos el importe en el mismo medio de pago. Si no lo esperabas, escríbenos.",
  },
};

/** Email al cliente cuando el pedido pasa a Enviado, Entregado o Cancelado. */
export default function OrderStatusUpdateEmail({
  order,
  status,
  siteUrl,
}: {
  order: OrderEmail;
  status: NotifiableStatus;
  siteUrl: string;
}) {
  const copy = COPY[status];
  return (
    <Html lang="es">
      <Head />
      <Preview>{copy.preview(order.orderNumber)}</Preview>
      <Body style={{ background: c.bg, color: c.ink, fontFamily: "Helvetica, Arial, sans-serif", margin: 0 }}>
        <Container style={{ maxWidth: 560, margin: "0 auto", padding: "24px 16px" }}>
          <Section style={{ height: 8, background: `repeating-linear-gradient(45deg, ${c.aji} 0 8px, ${c.panela} 8px 16px)` }} />
          <Section style={{ background: c.surface, border: `1px solid ${c.line}`, padding: 24 }}>
            <Text style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>contoso</Text>
            <Text style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: c.muted, marginTop: 0 }}>
              colchones
            </Text>
            <Heading as="h1" style={{ fontSize: 24, margin: "16px 0 8px" }}>
              {copy.title}
            </Heading>
            <Text style={{ color: c.muted, fontSize: 15 }}>
              Pedido <strong style={{ color: c.ink }}>{order.orderNumber}</strong>: {STATUS_LABELS[status]}. {copy.body}
            </Text>
            {status === "shipped" && (
              <Section style={{ background: c.bg, padding: 16, borderRadius: 8 }}>
                <Text style={{ margin: 0 }}>
                  <strong>Transportista:</strong> {order.carrier}
                </Text>
                <Text style={{ margin: 0 }}>
                  <strong>Nº de seguimiento:</strong> {order.trackingNumber}
                </Text>
                <Text style={{ margin: 0 }}>
                  <strong>Entrega estimada:</strong> {longDate(order.estimatedDelivery)}
                </Text>
              </Section>
            )}
            <Hr style={{ borderColor: c.line }} />
            {order.items.map((item) => (
              <Text key={item.sku} style={{ margin: "0 0 4px" }}>
                {item.name} × {item.quantity}
                <span style={{ color: c.muted, fontSize: 13 }}> · {formatOptions(item.options)}</span>
              </Text>
            ))}
            <Section style={{ marginTop: 24 }}>
              <Link
                href={`${siteUrl}/pedidos/${order.id}`}
                style={{ background: c.aji, color: "#FFF6EC", padding: "12px 20px", borderRadius: 999, fontWeight: 600 }}
              >
                Ver mi pedido
              </Link>
            </Section>
          </Section>
          <Text style={{ fontSize: 12, color: c.muted }}>
            Colchones Contoso · Tienda de demostración. ¿Dudas? Escríbenos a hola@contoso.example indicando tu número de
            pedido, o pregunta a nuestro asistente en la web.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
