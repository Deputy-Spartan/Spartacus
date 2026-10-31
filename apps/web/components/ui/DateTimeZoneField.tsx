"use client";

import { useEffect, useMemo, useState } from "react";
import {
  allTimeZones,
  browserTimeZone,
  formatDateTime,
  isValidTimeZone,
  timeZoneLabel,
  utcOffsetLabel,
  utcToWallTime,
  wallTimeToUtc,
} from "../../lib/timeZones";

const ZONE_STORAGE_KEY = "spartacus.timeZone";

interface DateTimeZoneFieldProps {
  // A UTC ISO string, or "" when nothing is picked.
  value: string;
  onChange: (iso: string) => void;
  // Shows a Clear link, for times that are optional.
  clearable?: boolean;
}

// Date, time and time zone picker. The value is always the real moment in
// UTC, so nobody has to do that math and the server can't misread it. The
// zone starts on the viewer's own and is remembered on their device.
export function DateTimeZoneField({ value, onChange, clearable = false }: DateTimeZoneFieldProps) {
  const [zone, setZone] = useState("UTC");
  const [deviceZone, setDeviceZone] = useState("UTC");
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const device = browserTimeZone();
    setDeviceZone(device);
    let remembered: string | null = null;
    try {
      remembered = localStorage.getItem(ZONE_STORAGE_KEY);
    } catch {}
    setZone(remembered && isValidTimeZone(remembered) ? remembered : device);
  }, []);

  // Keeps what's being typed on screen; anything set from outside (opening
  // a saved item, clearing the form) is read from the value instead.
  const wall = draft && wallTimeToUtc(draft, zone) === value ? draft : value ? utcToWallTime(value, zone) : "";

  function changeWall(next: string) {
    setDraft(next);
    onChange(next ? wallTimeToUtc(next, zone) : "");
  }

  function pickZone(next: string) {
    setZone(next);
    setOpen(false);
    setQuery("");
    try {
      localStorage.setItem(ZONE_STORAGE_KEY, next);
    } catch {}
    // The clock time stays as typed; it's the moment it means that changes.
    if (wall) onChange(wallTimeToUtc(wall, next));
  }

  // Offsets are shown for the picked date, since daylight saving can make
  // them differ from today's.
  const at = value ? new Date(value).getTime() : Date.now();
  const matches = useMemo(() => {
    if (!open) return [];
    const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
    return allTimeZones()
      .map((o) => ({ ...o, offset: utcOffsetLabel(at, o.zone) }))
      .filter((o) => {
        const text = `${o.label} ${o.terms ?? ""} ${o.offset} ${o.offset.replace("UTC", "GMT")}`.toLowerCase();
        return words.every((w) => text.includes(w));
      });
  }, [open, query, at]);

  const inPast = Boolean(value) && new Date(value).getTime() < Date.now();

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <input
          type="datetime-local"
          className="flex-1 min-w-0 w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm"
          value={wall}
          onChange={(e) => changeWall(e.target.value)}
        />
        {clearable && value && (
          <button type="button" onClick={() => changeWall("")} className="text-xs text-slate-500 hover:text-rose-400 px-2 py-2.5 shrink-0" title="Clear this time">
            Clear
          </button>
        )}
      </div>

      <label className="text-xs text-slate-500 block mb-1">Time zone</label>
      <input
        type="text"
        role="combobox"
        aria-expanded={open}
        autoComplete="off"
        className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm"
        placeholder="Type a city, country or zone (New York, EST, Japan)…"
        value={open ? query : `${timeZoneLabel(zone)} · ${utcOffsetLabel(at, zone)}`}
        onFocus={() => {
          setQuery("");
          setOpen(true);
        }}
        onBlur={() => setOpen(false)}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") e.currentTarget.blur();
          if (e.key === "Enter") {
            e.preventDefault();
            if (matches[0]) pickZone(matches[0].zone);
            e.currentTarget.blur();
          }
        }}
      />
      {open && (
        // Keeps focus on the search box so a tap or scroll here can't close the list first.
        <div className="mt-1 max-h-56 overflow-y-auto rounded-lg border border-white/10 bg-base-950" onMouseDown={(e) => e.preventDefault()}>
          {matches.length === 0 && <p className="px-3 py-2.5 text-xs text-slate-500">No match. Try a nearby big city or country.</p>}
          {matches.map((o) => (
            <button
              key={o.zone}
              type="button"
              onClick={() => pickZone(o.zone)}
              className={`w-full flex justify-between gap-3 text-left px-3 py-2.5 text-sm hover:bg-white/5 ${o.zone === zone ? "text-neon-blue" : ""}`}
            >
              <span className="min-w-0">{o.label}</span>
              <span className="text-xs text-slate-500 shrink-0">{o.offset}</span>
            </button>
          ))}
        </div>
      )}

      {value && (
        <p className="text-xs text-slate-400 mt-2">
          {formatDateTime(value, zone)}
          {zone !== deviceZone && <span className="text-slate-600"> · {formatDateTime(value)} on this device</span>}
        </p>
      )}
      {inPast && <p className="text-xs text-amber-400 mt-1">This time has already passed.</p>}
    </div>
  );
}
