import Image from "next/image";

/** Logo mark using the 3D icon PNG — for page headers and navigation. */
export function ObolLogo({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <Image
      src="/icon.png"
      alt="Obol AI"
      width={size}
      height={size}
      className={`rounded-lg ${className ?? ""}`}
    />
  );
}
