"use client";

import { useEffect, useState } from "react";
import { api, type DiscordRoleOption } from "../../lib/api";

interface RoleSelectProps {
  guildId: string;
  value: string | null;
  onChange: (roleId: string) => void;
  placeholder?: string;
}

export function RoleSelect({ guildId, value, onChange, placeholder }: RoleSelectProps) {
  const [roles, setRoles] = useState<DiscordRoleOption[]>([]);

  useEffect(() => {
    api.getDiscordRoles(guildId).then(setRoles);
  }, [guildId]);

  return (
    <select
      className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm mb-4"
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">{placeholder ?? "Select a role…"}</option>
      {roles.map((r) => (
        <option key={r.id} value={r.id}>
          @{r.name}
        </option>
      ))}
    </select>
  );
}
