import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Benefits } from "@/components/home/Benefits";
import { ProductCard } from "@/components/home/ProductCard";
import { Reviews } from "@/components/home/Reviews";
import { CoresTable } from "@/components/product/CoresTable";
import { ProductConfigurator } from "@/components/product/ProductConfigurator";
import { ProductGallery } from "@/components/product/ProductGallery";
import { getCatalog, localSlugs } from "@/lib/catalog/repository";
import { lowestPrice } from "@/lib/catalog/types";
import { formatPrice } from "@/lib/format";

export const revalidate = 300;
export const dynamicParams = true;

export function generateStaticParams() {
  return localSlugs().map((slug) => ({ slug }));
}

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const product = await getCatalog().getProduct(slug);
  if (!product) return { title: "Producto no encontrado" };
  return {
    title: product.name,
    description: `${product.shortDescription} Desde ${formatPrice(lowestPrice(product))}. Envío gratis a la península.`,
    openGraph: { images: product.images.slice(0, 1) },
  };
}

export default async function ProductPage({ params }: Params) {
  const { slug } = await params;
  const catalog = getCatalog();
  const product = await catalog.getProduct(slug);
  if (!product) notFound();
  const others = (await catalog.listProducts()).filter((p) => p.slug !== product.slug);
  const fundas = product.optionDetails?.["Funda"] ?? {};

  return (
    <>
      <div className="wrap pt-6">
        <nav aria-label="Migas de pan" className="text-sm text-muted">
          <ol className="m-0 flex list-none flex-wrap gap-2 p-0">
            <li>
              <Link href="/" className="transition-colors hover:text-aji-ink">Inicio</Link> /
            </li>
            <li>
              <Link href="/#productos" className="transition-colors hover:text-aji-ink">Colchones</Link> /
            </li>
            <li aria-current="page" className="text-ink">{product.name}</li>
          </ol>
        </nav>
      </div>

      <section className="wrap grid items-start gap-8 py-6 md:grid-cols-[1.05fr_.95fr] md:gap-12 md:py-8">
        <ProductGallery images={product.images} name={product.name} />
        <div className="enter flex flex-col gap-6">
          <div>
            <span className="eyebrow">Hecho en Envigado · Algodón del Tolima</span>
            <h1 className="mt-2 mb-3 text-[clamp(2.2rem,4.4vw,3.4rem)] font-extrabold tracking-[-.025em]">{product.name}</h1>
            <p className="text-[1.05rem] text-muted">{product.shortDescription}</p>
            <p className="mt-2 text-sm text-muted">
              Desde <b className="text-ink tabular-nums">{formatPrice(lowestPrice(product))}</b> · Envío gratis a la
              península · 30 noches de prueba
            </p>
          </div>
          <ProductConfigurator product={product} />
          <ul className="m-0 grid list-none gap-2 rounded-card border border-line bg-surface p-4 text-sm">
            {[
              "Península en 24–72 h laborables, gratis. Baleares 45 €; Canarias, Ceuta y Melilla 89 €.",
              "30 días para devolverlo desde la entrega (salvo medidas a medida).",
              "Pago seguro con Stripe (modo prueba): tus datos de tarjeta no pasan por nuestros servidores.",
            ].map((t) => (
              <li key={t} className="flex gap-2.5">
                <span className="mt-[.5rem] h-2 w-2 flex-none rounded-full bg-panela" aria-hidden="true" />
                {t}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <div className="wayuu mt-8" role="presentation" />

      <section className="section" aria-labelledby="descripcion-title">
        <div className="wrap grid gap-10 md:grid-cols-2" data-reveal="stagger">
          <div>
            <span className="eyebrow">Descripción</span>
            <h2 id="descripcion-title" className="mt-2 mb-4 text-[clamp(1.8rem,3.2vw,2.4rem)] font-extrabold">
              Así es el {product.name.replace(/^Colchón /, "")}
            </h2>
            <p className="text-muted">{product.description}</p>
          </div>
          <div>
            <h3 className="mb-3 text-lg font-semibold">Ventajas</h3>
            <ul className="m-0 grid list-none gap-2 p-0">
              {product.features.map((f) => (
                <li key={f} className="flex gap-2.5">
                  <span className="mt-[.55rem] h-2 w-2 flex-none rounded-full bg-aji" aria-hidden="true" />
                  {f}
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="wrap mt-10">
          <Benefits limit={4} />
        </div>
      </section>

      <section className="section flush" aria-labelledby="nucleos-title">
        <div className="wrap">
          <div className="section-head" data-reveal>
            <div>
              <span className="eyebrow">Núcleos</span>
              <h2 id="nucleos-title">Brisa o Ceiba+: ¿cuál te conviene?</h2>
            </div>
            <p>Ceiba+ es más alto, soporta más peso, tiene más zonas de confort y el doble de garantía.</p>
          </div>
          <div data-reveal>
            <CoresTable product={product} caption={`Comparativa de núcleos del ${product.name}`} />
          </div>
        </div>
      </section>

      {Object.keys(fundas).length > 0 && (
        <section className="section flush" aria-labelledby="fundas-title">
          <div className="wrap">
            <div className="section-head" data-reveal>
              <div>
                <span className="eyebrow">Materiales</span>
                <h2 id="fundas-title">Dos fundas, las dos lavables</h2>
              </div>
            </div>
            <div className="grid gap-5 md:grid-cols-2" data-reveal="stagger">
              {Object.entries(fundas).map(([name, info]) => (
                <article key={name} className="card lift p-6">
                  <h3 className="mb-2 text-xl font-semibold">{name}</h3>
                  <p className="text-muted">{String(info.descripcion ?? "")}</p>
                </article>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="section flush" aria-labelledby="envio-title">
        <div className="wrap">
          <div className="grid gap-8 rounded-[21px] bg-tint p-6 md:grid-cols-[1fr_1.2fr] md:p-10" data-reveal>
            <div>
              <span className="eyebrow">Envío y devoluciones</span>
              <h2 id="envio-title" className="mt-2 mb-3 text-[clamp(1.6rem,3vw,2.2rem)] font-extrabold">
                Llega enrollado y listo para dormir
              </h2>
              <p className="text-muted">
                Lo enviamos desde Madrid en una caja que cabe por cualquier puerta. Te mandamos el número de seguimiento
                en cuanto sale del almacén.
              </p>
              <Link href="/envios-y-devoluciones" className="btn btn-ghost mt-5">
                Leer la política completa
              </Link>
            </div>
            <dl className="m-0 grid gap-3 self-center">
              {[
                ["España peninsular", "24–72 h laborables · Gratis"],
                ["Islas Baleares", "5–7 días laborables · 45 €"],
                ["Canarias, Ceuta y Melilla", "5–7 días laborables · 89 €"],
                ["A medida", "Unos 30 días · sin devolución"],
                ["Devoluciones", "30 días desde la entrega"],
              ].map(([k, v]) => (
                <div key={k} className="flex flex-wrap justify-between gap-2 border-b border-line pb-2">
                  <dt className="font-medium">{k}</dt>
                  <dd className="m-0 text-muted">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      <section className="section flush" aria-label="Opiniones">
        <div className="wrap">
          <Reviews slug={product.slug} title={`Opiniones del ${product.name}`} />
        </div>
      </section>

      {others.length > 0 && (
        <section className="section flush" aria-labelledby="recomendados-title">
          <div className="wrap">
            <div className="section-head" data-reveal>
              <div>
                <span className="eyebrow">También te puede gustar</span>
                <h2 id="recomendados-title">Compara con nuestro otro colchón</h2>
              </div>
            </div>
            <div className="grid gap-6 md:grid-cols-2" data-reveal="stagger">
              {others.map((p) => (
                <ProductCard key={p.slug} product={p} />
              ))}
            </div>
          </div>
        </section>
      )}
    </>
  );
}
