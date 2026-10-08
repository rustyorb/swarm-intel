import React from "react";

interface PixelAvatarProps {
  name: string;
  role: string;
  themeColor: string;
  size?: "sm" | "md" | "lg" | "xl";
  // Generated headshot (/portraits/<key>.png). When present it fills the
  // same frame; if it fails to load the pixel grid comes back.
  portraitUrl?: string;
}

const colorMap: Record<string, { bg: string; pixel: string; border: string }> = {
  cyan: { bg: "bg-cyan-950/40", pixel: "bg-cyan-400", border: "border-cyan-500/30" },
  emerald: { bg: "bg-emerald-950/40", pixel: "bg-emerald-400", border: "border-emerald-500/30" },
  rose: { bg: "bg-rose-950/40", pixel: "bg-rose-400", border: "border-rose-500/30" },
  amber: { bg: "bg-amber-950/40", pixel: "bg-amber-400", border: "border-amber-500/30" },
  purple: { bg: "bg-purple-950/40", pixel: "bg-purple-400", border: "border-purple-500/30" },
  indigo: { bg: "bg-indigo-950/40", pixel: "bg-indigo-400", border: "border-indigo-500/30" },
  blue: { bg: "bg-blue-950/40", pixel: "bg-blue-400", border: "border-blue-500/30" },
  fuchsia: { bg: "bg-fuchsia-950/40", pixel: "bg-fuchsia-400", border: "border-fuchsia-500/30" },
};

export default function PixelAvatar({ name, role, themeColor, size = "md", portraitUrl }: PixelAvatarProps) {
  const [imgFailed, setImgFailed] = React.useState(false);
  React.useEffect(() => { setImgFailed(false); }, [portraitUrl]);

  if (portraitUrl && !imgFailed) {
    const frame = colorMap[themeColor] || colorMap.blue;
    const dims = { sm: "w-8 h-8", md: "w-12 h-12", lg: "w-16 h-16", xl: "w-24 h-24" }[size];
    return (
      <div
        id={`avatar-${name.replace(/\s+/g, "-").toLowerCase()}`}
        className={`${dims} aspect-square rounded-xl border overflow-hidden flex-shrink-0 ${frame.border} ${frame.bg} shadow-inner`}
        title={`${name} — ${role}`}
      >
        <img
          src={portraitUrl}
          alt={`${name}, ${role}`}
          className="w-full h-full object-cover"
          loading="lazy"
          onError={() => setImgFailed(true)}
          style={{ filter: "saturate(0.92) contrast(1.04)" }}
        />
      </div>
    );
  }

  // Deterministic hash based on name and role
  const hashCode = (str: string) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    return Math.abs(hash);
  };

  const hash = hashCode(name + role);
  const colorConfig = colorMap[themeColor] || colorMap.blue;

  // Build an 8x8 grid.
  // To keep it symmetric, we generate a 4x8 half-grid, and mirror it.
  const grid: boolean[][] = [];
  for (let r = 0; r < 8; r++) {
    const row: boolean[] = [];
    for (let c = 0; c < 4; c++) {
      // Use the hash to decide if this pixel is filled
      // We introduce some mathematical variation based on row and column index
      const bitIndex = (r * 4 + c) % 31;
      const bit = (hash >> bitIndex) & 1;
      // We want ~40-50% fill rate, but keep the edges a bit lighter or heavier
      const isFilled = bit === 1 && (r > 0 && r < 7) && (c > 0 || r % 2 === 0);
      row.push(isFilled);
    }
    // Mirror the row to make a symmetric 8-pixel row
    const mirroredRow = [...row, ...[...row].reverse()];
    grid.push(mirroredRow);
  }

  // Size configurations
  const sizeClasses = {
    sm: "w-8 h-8 p-1 gap-[1px]",
    md: "w-12 h-12 p-1.5 gap-[1.5px]",
    lg: "w-16 h-16 p-2 gap-[2px]",
    xl: "w-24 h-24 p-3 gap-[3px]",
  };

  return (
    <div
      id={`avatar-${name.replace(/\s+/g, "-").toLowerCase()}`}
      className={`grid grid-cols-8 aspect-square rounded-xl border border-dashed transition-all duration-300 ${sizeClasses[size]} ${colorConfig.bg} ${colorConfig.border} shadow-inner flex-shrink-0`}
    >
      {grid.flatMap((row, rIndex) =>
        row.map((isFilled, cIndex) => (
          <div
            key={`${rIndex}-${cIndex}`}
            className={`rounded-[1px] transition-all duration-300 ${
              isFilled ? `${colorConfig.pixel} shadow-[0_0_6px_rgba(255,255,255,0.15)]` : "bg-transparent"
            }`}
          />
        ))
      )}
    </div>
  );
}
