export const heroSizes = "(max-width: 739px) calc(100vw - 64px), (max-width: 1199px) calc(100vw - 126px), 1118px";
type ScreenshotName = "mac-ports" | "mac-hero";
const dimensions = {
  "mac-ports": { width: 1180, height: 820 },
  "mac-hero": { width: 1440, height: 900 },
};
export const heroSrcSet = (format: "avif" | "webp", name: ScreenshotName = "mac-ports") =>
  [640, 960, dimensions[name].width].map((width) => `/screenshots/${name}-${width}.${format} ${width}w`).join(", ");

export function HeroImage({ alt, name = "mac-ports", enlarged = false, priority = false }: {
  alt: string;
  name?: ScreenshotName;
  enlarged?: boolean;
  priority?: boolean;
}) {
  const sizes = enlarged ? "(max-width: 739px) 900px, calc(100vw - 96px)" : heroSizes;
  const { width, height } = dimensions[name];
  return (
    <picture>
      <source type="image/avif" srcSet={heroSrcSet("avif", name)} sizes={sizes} />
      <source type="image/webp" srcSet={heroSrcSet("webp", name)} sizes={sizes} />
      <img src={`/screenshots/${name}-${width}.webp`} srcSet={heroSrcSet("webp", name)} sizes={sizes}
        alt={alt} width={width} height={height} loading={priority || enlarged ? "eager" : "lazy"} fetchPriority={priority ? "high" : "auto"} />
    </picture>
  );
}
