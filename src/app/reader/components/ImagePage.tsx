"use client";

interface ImagePageProps {
  src: string;
  alt: string;
}

export function ImagePage({ src, alt }: ImagePageProps) {
  return (
    <div className="flex h-full items-center justify-center p-4">
      <img
        src={src}
        alt={alt}
        className="max-h-full max-w-full rounded-lg object-contain shadow-lg shadow-black/20"
      />
    </div>
  );
}
