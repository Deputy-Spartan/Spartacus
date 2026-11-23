"use client";

// The dashboard's on/off control. Use it for every yes/no setting (never a
// check box). Inside a <label>, clicking the words flips it too.
interface ToggleSwitchProps {
  enabled: boolean;
  onChange: (next: boolean) => void;
  label?: string;
  disabled?: boolean;
  size?: "md" | "sm";
}

export function ToggleSwitch({ enabled, onChange, label, disabled, size = "md" }: ToggleSwitchProps) {
  const sm = size === "sm";
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!enabled)}
      className={[
        "relative inline-flex shrink-0 items-center rounded-full transition-colors duration-200",
        sm ? "h-5 w-9" : "h-6 w-11",
        enabled ? "neon-toggle-on" : "bg-base-700",
        disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
      ].join(" ")}
    >
      <span
        className={[
          "inline-block transform rounded-full bg-white transition-transform duration-200",
          sm ? "h-3.5 w-3.5" : "h-4 w-4",
          enabled ? (sm ? "translate-x-[18px]" : "translate-x-6") : sm ? "translate-x-[3px]" : "translate-x-1",
        ].join(" ")}
      />
    </button>
  );
}
