import { z } from "zod";
import { MAX_QTY_PER_LINE } from "./cart/store";

/** Cuerpo de POST /api/checkout: solo SKU y cantidad. Cualquier otro campo se rechaza. */
export const checkoutItemSchema = z
  .object({
    sku: z.string().regex(/^[A-Z0-9-]{3,40}$/, "SKU no válido"),
    quantity: z.number().int().min(1).max(MAX_QTY_PER_LINE),
  })
  .strict();

export const checkoutRequestSchema = z
  .object({
    items: z.array(checkoutItemSchema).min(1).max(20),
  })
  .strict();

export type CheckoutRequest = z.infer<typeof checkoutRequestSchema>;

export { ORDER_STATUSES, STATUS_LABELS, type OrderStatus } from "./orders/status";


/** Formato del ID de pedido: el ID de la Checkout Session de Stripe. */
export const orderIdSchema = z.string().regex(/^cs_[A-Za-z0-9_]{6,200}$/);

export const loginSchema = z.object({
  email: z.string().trim().email("Escribe un correo válido."),
  password: z.string().min(1, "Escribe tu contraseña."),
});

export const registerSchema = z
  .object({
    name: z.string().trim().min(2, "Escribe tu nombre.").max(80),
    email: z.string().trim().email("Escribe un correo válido."),
    password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres.").max(128),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, {
    message: "Las contraseñas no coinciden.",
    path: ["confirm"],
  });
