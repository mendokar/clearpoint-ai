import Image from "next/image";
import Link from "next/link";
import { OpenChatButton } from "@/components/chat/ChatContext";
import { Benefits } from "@/components/home/Benefits";
import { ProductCard } from "@/components/home/ProductCard";
import { Reviews } from "@/components/home/Reviews";
import { CoresTable } from "@/components/product/CoresTable";
import { getCatalog } from "@/lib/catalog/repository";
import { PRODUCT_PHOTOS_CREDIT } from "@/lib/images";

export const revalidate = 300;

export default async function HomePage() {
  const products = await getCatalog().listProducts();

  return (
    <>
      {/* Hero */}
      <section>
        <div className="wrap grid items-center gap-8 py-10 md:grid-cols-[1.1fr_.9fr] md:gap-12 md:py-14">
          <div>
            <span className="eyebrow">Colchones para descansar de verdad</span>
            <h1 className="mt-[.9rem] mb-5 text-[clamp(2.4rem,5.4vw,4.4rem)] font-extrabold tracking-[-.03em]">
              Dormir con la calma de una <em className="text-aji not-italic">siesta</em> en tierra caliente.
            </h1>
            <p className="max-w-[34rem] text-[1.15rem] text-muted">
              Colchones de matrimonio e individuales cosidos a mano en Medellín con algodón colombiano. Eliges medida,
              núcleo y funda, y te lo llevamos a casa.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link className="btn btn-primary" href="#productos">
                Elegir mi colchón
              </Link>
              <OpenChatButton className="btn btn-ghost">Preguntar al asistente</OpenChatButton>
            </div>
            <div className="mt-9 flex flex-wrap gap-8 border-t border-line pt-6">
              <Fact value="90 a 180" label="cm de ancho" />
              <Fact value="A medida" label="para cualquier cama" />
              <Fact value="4,8 / 5" label="valoración media" mono />
            </div>
          </div>
          <figure className="relative m-0">
            <Image
              src="/images/hero.jpg"
              alt="Cama con edredón naranja iluminada por la luz dorada de la tarde que entra por una ventana en arco"
              width={800}
              height={1200}
              priority
              sizes="(max-width: 860px) 100vw, 520px"
              className="aspect-[4/3] w-full rounded-[160px_160px_var(--r)_var(--r)] object-cover md:aspect-[4/5] md:rounded-[220px_220px_var(--r)_var(--r)]"
            />
            <div className="font-display absolute bottom-7 left-3 max-w-48 rounded-card bg-panela px-4 py-3 text-[.95rem] leading-tight font-semibold text-[#2C1B12] shadow-[0_10px_30px_rgba(44,27,18,.2)] md:-left-[18px]">
              <span className="mono mb-1 block text-[.7rem] font-medium tracking-[.1em] uppercase">Hecho en Colombia</span>
              Algodón del Tolima en cada funda
            </div>
            <figcaption className="credit mt-2 text-right">Foto: Matthieu Lemarchal en Unsplash</figcaption>
          </figure>
        </div>
      </section>

      <div className="wayuu" role="presentation" />

      <section className="section" id="beneficios" aria-labelledby="beneficios-title">
        <div className="wrap">
          <div className="section-head">
            <div>
              <span className="eyebrow">Por qué Contoso</span>
              <h2 id="beneficios-title">Todo lo que una buena noche necesita</h2>
            </div>
            <p>
              Cada colchón combina un núcleo transpirable con una funda lavable. La espalda queda alineada y el aire
              circula toda la noche, incluso en verano.
            </p>
          </div>
          <Benefits />
        </div>
      </section>

      <section className="section flush scroll-mt-24" id="productos" aria-labelledby="productos-title">
        <div className="wrap">
          <div className="section-head">
            <div>
              <span className="eyebrow">Nuestros colchones</span>
              <h2 id="productos-title">Dos colchones, cada uno con su carácter</h2>
            </div>
            <p>Configura medida, núcleo y funda. El precio se actualiza al instante y pagas con tarjeta de forma segura.</p>
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            {products.map((p) => (
              <ProductCard key={p.slug} product={p} />
            ))}
          </div>
          <p className="credit mt-2">{PRODUCT_PHOTOS_CREDIT}</p>
        </div>
      </section>

      <section className="section flush scroll-mt-24" id="nucleos" aria-labelledby="nucleos-title">
        <div className="wrap">
          <div className="section-head">
            <div>
              <span className="eyebrow">Dos núcleos</span>
              <h2 id="nucleos-title">Brisa para empezar, Ceiba+ para ir más allá</h2>
            </div>
            <p>
              Los dos llevan canales de ventilación y espumas sin tóxicos. Ceiba+ es más alto, aguanta más peso y añade
              una capa extra de confort.
            </p>
          </div>
          <div className="grid items-stretch gap-6 md:grid-cols-[.8fr_1.2fr]">
            <figure className="m-0 flex flex-col gap-1.5">
              <Image
                src="/images/textura.jpg"
                alt="Primer plano de la superficie acolchada de un colchón blanco con dibujo de hexágonos"
                width={1200}
                height={1200}
                sizes="(max-width: 860px) 100vw, 460px"
                className="aspect-video h-auto w-full rounded-card object-cover md:aspect-auto md:h-0 md:min-h-[260px] md:flex-1"
              />
              <figcaption className="credit">Foto: Costa Live en Unsplash</figcaption>
            </figure>
            {products[0] && <CoresTable product={products[0]} caption="Comparativa de núcleos Brisa y Ceiba+" />}
          </div>
        </div>
      </section>

      <section className="bg-ink text-bg" aria-labelledby="prueba-title">
        <div className="wrap grid items-center gap-6 py-14 md:grid-cols-[auto_1fr_auto] md:gap-10">
          <div className="mono font-display text-[clamp(4rem,10vw,7rem)] leading-[.9] font-extrabold tracking-[-.04em] text-panela">
            30
            <span className="mono mt-1.5 block text-[.9rem] font-medium tracking-[.14em] text-bg uppercase">
              noches de prueba
            </span>
          </div>
          <div>
            <h2 id="prueba-title" className="mb-3 text-[clamp(1.6rem,3vw,2.2rem)] font-bold">
              Si no te convence, nos lo devuelves
            </h2>
            <p className="max-w-[40rem] opacity-85">
              Duerme con él un mes. Si no cumple lo que esperabas, puedes devolverlo en los 30 días siguientes a la
              entrega y te reembolsamos el importe.
            </p>
          </div>
          <Link className="btn border-bg text-bg" href="/envios-y-devoluciones">
            Ver envíos y devoluciones
          </Link>
        </div>
      </section>

      <section className="section scroll-mt-24" id="taller" aria-labelledby="taller-title">
        <div className="wrap grid items-start gap-8 md:grid-cols-2 md:gap-12">
          <div>
            <figure className="m-0 mb-6">
              <Image
                src="/images/taller.jpg"
                alt="Dormitorio amplio con cama baja de madera clara, alfombras de lana y luz natural"
                width={1200}
                height={800}
                sizes="(max-width: 860px) 100vw, 560px"
                className="aspect-[3/2] w-full rounded-card object-cover"
              />
              <figcaption className="credit mt-1.5">Foto: Roberto Nickson en Unsplash</figcaption>
            </figure>
            <span className="eyebrow">El taller</span>
            <h2 id="taller-title" className="mt-2.5 mb-5 text-[clamp(1.9rem,3.6vw,2.8rem)] font-extrabold">
              De un taller en Antioquia a tu dormitorio
            </h2>
            <p className="mb-4 max-w-[36rem] text-muted">
              Contoso nació en <strong className="text-ink">Envigado, Antioquia</strong>, en un taller familiar de
              tapicería. Allí aprendimos que dormir bien es como una buena siesta de mediodía: fresco, sin prisa y sin
              interrupciones.
            </p>
            <p className="max-w-[36rem] text-muted">
              Hoy cosemos cada colchón a mano con <strong className="text-ink">algodón del Tolima</strong> y lo enviamos
              a España desde nuestro almacén en Madrid.
            </p>
          </div>
          <ol className="m-0 grid list-none p-0">
            {[
              ["Cortamos el núcleo", "A la medida exacta de tu cama, también si es a medida."],
              ["Cosemos la funda", "Costura doble y cremallera oculta para lavarla sin esfuerzo."],
              ["Revisamos a mano", "Cada colchón pasa un control de medidas, firmeza y acabado."],
              ["Lo enrollamos y enviamos", "Llega enrollado en una caja que cabe por cualquier puerta."],
              ["Lo recibes", "En 24 a 72 horas laborables. Los pedidos a medida tardan unos 30 días."],
            ].map(([title, text], i) => (
              <li key={title} className="grid grid-cols-[3rem_1fr] gap-4 border-t border-line py-[1.1rem]">
                <span className="mono pt-1 text-[.9rem] text-aji-ink" aria-hidden="true">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div>
                  <h3 className="mb-1 text-[1.15rem] font-semibold">{title}</h3>
                  <p className="text-[.93rem] text-muted">{text}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="section flush" aria-label="Opiniones">
        <div className="wrap">
          <Reviews />
        </div>
      </section>

      <section className="section flush scroll-mt-24" id="asistente" aria-labelledby="asistente-title">
        <div className="wrap">
          <div className="grid items-center gap-10 rounded-[21px] bg-tint p-6 md:grid-cols-2 md:p-12">
            <div>
              <span className="eyebrow">Asistente Contoso</span>
              <h2 id="asistente-title" className="mt-2.5 mb-4 text-[clamp(1.8rem,3.2vw,2.5rem)] font-extrabold">
                Pregunta lo que quieras, a cualquier hora
              </h2>
              <p className="text-muted">
                Nuestro asistente conoce los colchones, las condiciones de envío y, si inicias sesión, el estado de tus
                pedidos.
              </p>
              <ul className="mt-5 grid list-none gap-2 p-0">
                {["Qué colchón y qué firmeza te convienen", "Plazos de envío y cómo devolver", "Dónde está tu pedido y cuándo llega"].map(
                  (t) => (
                    <li key={t} className="flex gap-2.5">
                      <span className="mt-[.55rem] h-2 w-2 flex-none rounded-full bg-aji" aria-hidden="true" />
                      {t}
                    </li>
                  ),
                )}
              </ul>
              <OpenChatButton className="btn btn-primary mt-6">Abrir el asistente</OpenChatButton>
            </div>
            <div
              className="card flex min-w-0 flex-col gap-3 p-5 text-[.93rem]"
              aria-label="Ejemplo de conversación con el asistente"
              role="group"
            >
              <span className="mono text-[.7rem] tracking-[.1em] text-muted uppercase">Ejemplo</span>
              <div className="max-w-[88%] self-end rounded-[14px] rounded-br-[4px] bg-ink px-4 py-2.5 text-bg">
                ¿Dónde está mi pedido CP-000123?
              </div>
              <div className="max-w-[88%] self-start rounded-[14px] rounded-bl-[4px] bg-tint px-4 py-2.5">
                Tu pedido está{" "}
                <span className="mono rounded-md bg-panela px-1.5 text-xs text-[#2C1B12]">Enviado</span> con SEUR.
                Número de seguimiento <span className="mono">SE48201937</span>. La entrega estimada es el jueves 22 de
                octubre.
              </div>
              <div className="max-w-[88%] self-end rounded-[14px] rounded-br-[4px] bg-ink px-4 py-2.5 text-bg">
                Duermo de lado y paso calor. ¿Cuál me recomiendas?
              </div>
              <div className="max-w-[88%] self-start rounded-[14px] rounded-bl-[4px] bg-tint px-4 py-2.5">
                El Caribe con núcleo Ceiba+ y funda de algodón. Los muelles ensacados dejan pasar el aire y el núcleo
                reforzado alivia hombro y cadera.
              </div>
              <OpenChatButton className="flex items-center gap-2 rounded-full border border-line py-1.5 pr-1.5 pl-4 text-left text-muted">
                <span className="min-w-0 flex-1 truncate">Escribe tu pregunta…</span>
                <b className="rounded-full bg-aji px-3.5 py-1.5 text-sm text-on-accent">Enviar</b>
              </OpenChatButton>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

function Fact({ value, label, mono }: { value: string; label: string; mono?: boolean }) {
  return (
    <div className="flex flex-col">
      <strong className={`font-display text-2xl font-semibold${mono ? " mono" : ""}`}>{value}</strong>
      <span className="text-sm text-muted">{label}</span>
    </div>
  );
}
