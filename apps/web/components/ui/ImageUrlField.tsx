"use client";

import { useRef, useState } from "react";
import { api } from "../../lib/api";

interface ImageUrlFieldProps {
  guildId: string;
  value: string;
  onChange: (url: string) => void;
  placeholder?: string;
}

// A URL text field plus an "Upload" button that sends a file straight to
// Discord (see api.uploadImage) and fills the field with the resulting CDN
// link — drop this in anywhere an image/thumbnail/icon URL is collected.
export function ImageUrlField({ guildId, value, onChange, placeholder }: ImageUrlFieldProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setUploading(true);
    setError(null);
    try {
      const { url } = await api.uploadImage(guildId, file);
      onChange(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div>
      <div className="flex gap-1.5">
        <input
          className="flex-1 min-w-0 bg-base-950 border border-white/10 rounded-lg p-2 text-xs"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="shrink-0 px-2.5 rounded-lg border border-white/10 bg-base-800 text-xs text-slate-300 hover:border-neon-blue/40 hover:text-neon-blue disabled:opacity-50"
        >
          {uploading ? "…" : "Upload"}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
        />
      </div>
      {error && <p className="text-[11px] text-rose-400 mt-1">{error}</p>}
    </div>
  );
}
