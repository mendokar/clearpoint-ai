import { LockIcon, MoonIcon, TruckIcon } from "@/components/ui/Icons";

const ITEMS = [
  { Icon: TruckIcon, text: "Envío gratis península" },
  { Icon: MoonIcon, text: "30 noches de prueba" },
  { Icon: LockIcon, text: "Pago seguro con Stripe" },
];

/** Sellos de confianza bajo los CTA del hero. */
export function TrustBadges() {
  return (
    <ul className="trust-badges m-0 mt-5 flex list-none flex-wrap gap-x-5 gap-y-2 p-0 text-sm text-muted">
      {ITEMS.map(({ Icon, text }) => (
        <li key={text} className="flex items-center gap-2">
          <Icon className="h-[18px] w-[18px] text-aji" />
          {text}
        </li>
      ))}
    </ul>
  );
}
