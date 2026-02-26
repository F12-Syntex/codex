import type { BookFormat } from "@/lib/mock-data";

interface BookCardProps {
  title: string;
  author: string;
  gradient: string;
  cover: string;
  format: BookFormat;
}

export function BookCard({ title, author, gradient, cover, format }: BookCardProps) {
  return (
    <div className="group flex flex-col gap-2.5">
      {/* Cover */}
      <div className="relative">
        {/* Soft colored shadow beneath */}
        <div
          className="absolute inset-x-2 -bottom-2 h-6 rounded-lg opacity-0 blur-xl transition-opacity duration-300 group-hover:opacity-60"
          style={{ background: gradient }}
        />

        <div
          className="relative aspect-[2/3] overflow-hidden rounded-lg transition-all duration-300 ease-out group-hover:-translate-y-1 group-hover:scale-[1.02]"
          style={{ background: gradient }}
        >
          {/* Cover image */}
          <img
            src={cover}
            alt={title}
            className="absolute inset-0 h-full w-full object-cover"
            loading="lazy"
          />

          {/* Spine edge */}
          <div className="pointer-events-none absolute inset-y-0 left-0 w-[3px] bg-black/20" />

          {/* Top specular highlight */}
          <div className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/10 to-transparent" />

          {/* Bottom fade */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/40 to-transparent" />

          {/* Edge highlights */}
          <div className="pointer-events-none absolute inset-0 rounded-lg shadow-[inset_0_1px_0_rgba(255,255,255,0.08),inset_0_-1px_0_rgba(0,0,0,0.2)]" />

          {/* Format badge */}
          <div className="absolute bottom-2 right-2 rounded-lg bg-black/50 px-1.5 py-0.5 text-[11px] font-medium leading-none text-white/70 backdrop-blur-sm">
            {format}
          </div>
        </div>
      </div>

      {/* Meta */}
      <div className="min-w-0">
        <p className="truncate text-[13px] font-medium leading-tight">{title}</p>
        <p className="mt-0.5 truncate text-xs text-white/40">{author}</p>
      </div>
    </div>
  );
}
