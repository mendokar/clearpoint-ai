import { Body, Column, Container, Head, Heading, Hr, Html, Link, Preview, Row, Section, Text } from "@react-email/components";
import type { OrderEmail } from "@/lib/email/sender";
import { formatOptions } from "../lib/format";
import { emailColors as c, eur } from "./emailTheme";

/** Aviso interno a la tienda: ha entrado un pedido pagado. */
export default function NewOrderAlertEmail({ order, siteUrl }: { order: OrderEmail; siteUrl: string }) {
  const a = order.shippingAddress;
  const units = order.items.reduce((n, i) => n + i.quantity, 0);
  return (
    <Html lang="es">
      <Head />
      <Preview>{`Nuevo pedido ${order.orderNumber} · ${eur.format(order.total)}`}</Preview>
      <Body style={{ background: c.bg, color: c.ink, fontFamily: "Helvetica, Arial, sans-serif", margin: 0 }}>
        <Container style={{ maxWidth: 560, margin: "0 auto", padding: "24px 16px" }}>
          <Section style={{ background: c.surface, border: `1px solid ${c.line}`, padding: 24 }}>
            <Text style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: c.muted, margin: 0 }}>
              Panel de administración
            </Text>
            <Heading as="h1" style={{ fontSize: 22, margin: "8px 0" }}>
              Nuevo pedido {order.orderNumber}
            </Heading>
            <Text style={{ color: c.muted, fontSize: 15, marginTop: 0 }}>
              {eur.format(order.total)} · {units} {units === 1 ? "artículo" : "artículos"} · {order.email || "sin email"}
            </Text>
            <Hr style={{ borderColor: c.line }} />
            {order.items.map((item) => (
              <Row key={item.sku} style={{ marginBottom: 8 }}>
                <Column>
                  <Text style={{ margin: 0, fontWeight: 600 }}>
                    {item.name} × {item.quantity}
                  </Text>
                  <Text style={{ margin: 0, fontSize: 13, color: c.muted }}>
                    {formatOptions(item.options)} · SKU {item.sku}
                  </Text>
                </Column>
                <Column align="right">
                  <Text style={{ margin: 0 }}>{eur.format(item.unitPrice * item.quantity)}</Text>
                </Column>
              </Row>
            ))}
            <Hr style={{ borderColor: c.line }} />
            <Text style={{ margin: 0 }}>
              Envío: {order.shipping ? eur.format(order.shipping) : "Gratis"} · <strong>Total: {eur.format(order.total)}</strong>
            </Text>
            {a && (
              <>
                <Hr style={{ borderColor: c.line }} />
                <Text style={{ margin: 0, fontSize: 13, color: c.muted }}>Dirección de entrega</Text>
                <Text style={{ margin: 0 }}>
                  {a.name}
                  <br />
                  {a.line1}
                  {a.line2 ? `, ${a.line2}` : ""}
                  <br />
                  {a.postalCode} {a.city}
                  {a.state ? ` (${a.state})` : ""} · {a.country}
                </Text>
              </>
            )}
            <Section style={{ marginTop: 24 }}>
              <Link
                href={`${siteUrl}/admin/pedidos/${order.id}`}
                style={{ background: c.aji, color: "#FFF6EC", padding: "12px 20px", borderRadius: 999, fontWeight: 600 }}
              >
                Abrir en el panel
              </Link>
            </Section>
          </Section>
          <Text style={{ fontSize: 12, color: c.muted }}>Aviso automático de Colchones Contoso. No respondas a este correo.</Text>
        </Container>
      </Body>
    </Html>
  );
}
