export const heroSizes = "(max-width: 739px) calc(100vw - 64px), (max-width: 1199px) calc(100vw - 126px), 1118px";
export const heroSrcSet = (format: "avif" | "webp") =>
  [640, 960, 1440].map((width) => `/screenshots/mac-hero-${width}.${format} ${width}w`).join(", ");

export function HeroImage({ alt, enlarged = false }: { alt: string; enlarged?: boolean }) {
  const sizes = enlarged ? "(max-width: 739px) 900px, calc(100vw - 96px)" : heroSizes;
  return (
    <picture>
      <source type="image/avif" srcSet={heroSrcSet("avif")} sizes={sizes} />
      <source type="image/webp" srcSet={heroSrcSet("webp")} sizes={sizes} />
      <img src="/screenshots/mac-hero-1440.webp" srcSet={heroSrcSet("webp")} sizes={sizes}
        alt={alt} width="1440" height="900" loading="eager" fetchPriority={enlarged ? "auto" : "high"} />
    </picture>
  );
}
