"use client";

import Image from "next/image";
import { useRef, useState, type PointerEvent } from "react";
import { IMAGE_ALTS, IMAGE_CREDITS, PRODUCT_PHOTOS_CREDIT } from "@/lib/images";

/**
 * Galería con fundido entre fotos y zoom que sigue al ratón (solo con puntero fino).
 * El zoom se mueve con variables CSS escritas en el DOM, sin re-render por cada movimiento.
 */
export function ProductGallery({ images, name }: { images: string[]; name: string }) {
  const [active, setActive] = useState(0);
  const stageRef = useRef<HTMLDivElement>(null);
  const current = images[active];
  if (!current) return null;
  const credit = IMAGE_CREDITS[current];

  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "mouse") return;
    const el = stageRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--zx", `${(((e.clientX - r.left) / r.width) * 100).toFixed(1)}%`);
    el.style.setProperty("--zy", `${(((e.clientY - r.top) / r.height) * 100).toFixed(1)}%`);
  };

  return (
    <div className="flex flex-col gap-3 lg:sticky lg:top-24">
      <div
        ref={stageRef}
        className="gallery-stage rounded-card border border-line bg-surface"
        onPointerEnter={(e) => e.pointerType === "mouse" && stageRef.current?.setAttribute("data-zoom", "true")}
        onPointerLeave={() => stageRef.current?.setAttribute("data-zoom", "false")}
        onPointerMove={onMove}
      >
        {images.map((src, i) => (
          <div key={src} className="g-slide" data-active={i === active} aria-hidden={i !== active}>
            <Image
              src={src}
              alt={i === active ? (IMAGE_ALTS[src] ?? name) : ""}
              width={1200}
              height={1200}
              priority={i === 0}
              sizes="(max-width: 860px) 100vw, 600px"
              className="h-full w-full object-cover"
            />
          </div>
        ))}
      </div>
      {images.length > 1 && (
        <ul className="m-0 flex list-none gap-3 p-0" aria-label="Fotos del producto">
          {images.map((src, i) => (
            <li key={src}>
              <button
                type="button"
                onClick={() => setActive(i)}
                aria-label={`Ver foto ${i + 1} de ${images.length}`}
                aria-current={i === active ? "true" : undefined}
                className={`thumb block overflow-hidden rounded-xl border-2 ${i === active ? "border-aji" : "border-line"}`}
              >
                <Image src={src} alt="" width={160} height={160} className="h-20 w-20 object-cover" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="credit">{credit ? `Foto: ${credit} en Unsplash` : PRODUCT_PHOTOS_CREDIT}</p>
    </div>
  );
}
