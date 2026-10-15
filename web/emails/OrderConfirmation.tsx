import {
  Body,
  Column,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Row,
  Section,
  Text,
} from "@react-email/components";
import type { OrderEmail } from "@/lib/email/sender";

const eur = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });

const c = {
  bg: "#F7EEE4",
  surface: "#FFFAF4",
  ink: "#2C1B12",
  muted: "#6E5546",
  line: "#E2CDBA",
  aji: "#D9542B",
  panela: "#C4862C",
};

export default function OrderConfirmationEmail({ order, siteUrl }: { order: OrderEmail; siteUrl: string }) {
  const firstName = order.shippingAddress?.name?.split(" ")[0];
  return (
    <Html lang="es">
      <Head />
      <Preview>{`Tu pedido ${order.orderNumber} está confirmado`}</Preview>
      <Body style={{ background: c.bg, color: c.ink, fontFamily: "Helvetica, Arial, sans-serif", margin: 0 }}>
        <Container style={{ maxWidth: 560, margin: "0 auto", padding: "24px 16px" }}>
          <Section style={{ height: 8, background: `repeating-linear-gradient(45deg, ${c.aji} 0 8px, ${c.panela} 8px 16px)` }} />
          <Section style={{ background: c.surface, border: `1px solid ${c.line}`, padding: 24 }}>
            <Text style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>contoso</Text>
            <Text style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: c.muted, marginTop: 0 }}>
              colchones
            </Text>
            <Heading as="h1" style={{ fontSize: 24, margin: "16px 0 8px" }}>
              {firstName ? `¡Gracias, ${firstName}!` : "¡Gracias por tu compra!"}
            </Heading>
            <Text style={{ color: c.muted, fontSize: 15 }}>
              Hemos recibido el pago de tu pedido <strong style={{ color: c.ink }}>{order.orderNumber}</strong>. Lo
              preparamos ahora y te avisaremos cuando salga del almacén con el número de seguimiento.
            </Text>
            <Hr style={{ borderColor: c.line }} />
            {order.items.map((item) => (
              <Row key={item.sku} style={{ marginBottom: 8 }}>
                <Column>
                  <Text style={{ margin: 0, fontWeight: 600 }}>
                    {item.name} × {item.quantity}
                  </Text>
                  <Text style={{ margin: 0, fontSize: 13, color: c.muted }}>{Object.values(item.options).join(" · ")}</Text>
                </Column>
                <Column align="right">
                  <Text style={{ margin: 0 }}>{eur.format(item.unitPrice * item.quantity)}</Text>
                </Column>
              </Row>
            ))}
            <Hr style={{ borderColor: c.line }} />
            <Row>
              <Column>
                <Text style={{ margin: 0, color: c.muted }}>Envío</Text>
              </Column>
              <Column align="right">
                <Text style={{ margin: 0 }}>{order.shipping ? eur.format(order.shipping) : "Gratis"}</Text>
              </Column>
            </Row>
            <Row>
              <Column>
                <Text style={{ margin: 0, fontWeight: 700 }}>Total</Text>
              </Column>
              <Column align="right">
                <Text style={{ margin: 0, fontWeight: 700 }}>{eur.format(order.total)}</Text>
              </Column>
            </Row>
            {order.shippingAddress && (
              <>
                <Hr style={{ borderColor: c.line }} />
                <Text style={{ margin: 0, fontSize: 13, color: c.muted }}>Dirección de entrega</Text>
                <Text style={{ margin: 0 }}>
                  {order.shippingAddress.name}
                  <br />
                  {order.shippingAddress.line1}
                  {order.shippingAddress.line2 ? `, ${order.shippingAddress.line2}` : ""}
                  <br />
                  {order.shippingAddress.postalCode} {order.shippingAddress.city}
                </Text>
              </>
            )}
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
            Colchones Contoso · Tienda de demostración · Pago de prueba con Stripe. ¿Dudas? Escríbenos a
            hola@contoso.example indicando tu número de pedido.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
