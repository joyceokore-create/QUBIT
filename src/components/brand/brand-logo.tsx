import Image from "next/image";
import mainLogo from "@/assets/qubit_main_logo.svg";
import mainWhite from "@/assets/qubit_main_white.svg";
import mainNight from "@/assets/qubit_main_night.svg";

const DIMS = { width: 92, height: 28 };

// Full QUBIT logo (icon + wordmark). Rendered from static SVG imports, unoptimized
// (SVG needs no image optimization). Aspect ratio is fixed by the artwork
// (1920×588 ≈ 3.27:1); size via the `className` height.
//
// variant:
//   "auto"  (default) — colour lockup on light, white on dark, swapped via the
//                       `dark:` variant so only one is visible. For surfaces that
//                       follow the theme (the marketing header/footer).
//   "white"           — always the white lockup.
//   "color"           — always the full-colour lockup (red icon + navy wordmark).
//   "night"           — red icon + white wordmark, for permanently-dark surfaces
//                       (the login card) where navy text wouldn't read.
export function BrandLogo({
  className = "h-7 w-auto",
  variant = "auto",
}: {
  className?: string;
  variant?: "auto" | "white" | "color" | "night";
}) {
  if (variant === "white") {
    return <Image src={mainWhite} alt="QUBIT" {...DIMS} priority unoptimized className={className} />;
  }
  if (variant === "night") {
    return <Image src={mainNight} alt="QUBIT" {...DIMS} priority unoptimized className={className} />;
  }
  if (variant === "color") {
    return <Image src={mainLogo} alt="QUBIT" {...DIMS} priority unoptimized className={className} />;
  }
  return (
    <>
      <Image src={mainLogo} alt="QUBIT" {...DIMS} priority unoptimized className={`${className} dark:hidden`} />
      <Image src={mainWhite} alt="QUBIT" {...DIMS} priority unoptimized className={`hidden ${className} dark:block`} />
    </>
  );
}
