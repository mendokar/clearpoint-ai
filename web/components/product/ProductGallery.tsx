"use client";

import Image from "next/image";
import { useState } from "react";
import { IMAGE_ALTS, IMAGE_CREDITS, PRODUCT_PHOTOS_CREDIT } from "@/lib/images";

export function ProductGallery({ images, name }: { images: string[]; name: string }) {
  const [active, setActive] = useState(0);
  const current = images[active];
  if (!current) return null;
  const credit = IMAGE_CREDITS[current];
  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-hidden rounded-card border border-line bg-surface">
        <Image
          key={current}
          src={current}
          alt={IMAGE_ALTS[current] ?? name}
          width={1200}
          height={1200}
          priority={active === 0}
          sizes="(max-width: 860px) 100vw, 600px"
          className="aspect-square w-full object-cover"
        />
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
                className={`block overflow-hidden rounded-xl border-2 ${i === active ? "border-aji" : "border-line"}`}
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
