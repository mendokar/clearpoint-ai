import Image from "next/image";
import Link from "next/link";
import { lowestPrice, type Product } from "@/lib/catalog/types";
import { formatPrice } from "@/lib/format";
import { IMAGE_ALTS } from "@/lib/images";

export function firmness(product: Product): string | undefined {
  return product.features.find((f) => f.toLowerCase().startsWith("firmeza"));
}

export function ProductCard({ product }: { product: Product }) {
  const image = product.images[0];
  const tag = firmness(product);
  return (
    <article className="card flex flex-col overflow-hidden">
      <div className="relative">
        {image && (
          <Image
            src={image}
            alt={IMAGE_ALTS[image] ?? product.name}
            width={1200}
            height={800}
            sizes="(max-width: 860px) 100vw, 580px"
            className="aspect-[3/2] w-full object-cover"
          />
        )}
        {tag && (
          <span className="mono absolute top-4 left-4 rounded-full bg-ink px-3 py-1 text-xs text-bg">{tag}</span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-4 p-6">
        <h3 className="text-[1.6rem] font-bold">{product.name}</h3>
        <p className="text-[.95rem] text-muted">{product.shortDescription || product.description}</p>
        <dl className="m-0 grid gap-2.5">
          {product.options.map((o) => (
            <div key={o.name} className="grid grid-cols-[5.5rem_1fr] items-baseline gap-3">
              <dt className="mono text-xs tracking-[.08em] text-muted uppercase">
                {o.name === "Medida" ? "Medidas" : o.name}
              </dt>
              <dd className="m-0 flex flex-wrap gap-1.5">
                {o.values.map((v) => (
                  <span key={v} className={`chip${/\d/.test(v) ? " mono" : ""}`}>
                    {v}
                  </span>
                ))}
              </dd>
            </div>
          ))}
        </dl>
        <div className="mt-auto flex flex-wrap items-center justify-between gap-4 border-t border-line pt-4">
          <div>
            <small className="block text-sm text-muted">Desde</small>
            <b className="mono font-display text-[1.9rem] font-bold">{formatPrice(lowestPrice(product))}</b>
          </div>
          <Link className="btn btn-primary" href={`/productos/${product.slug}`} aria-label={`Configurar ${product.name}`}>
            Configurar
          </Link>
        </div>
      </div>
    </article>
  );
}
