"use client";

import { useEffect, useState } from "react";
import { api, type DiscordMemberOption } from "./api";

// Resolves a handful of user ids to display names in one batched call —
// leaderboards/analytics show raw ids otherwise. Falls back to the id
// itself per-entry if Discord lookup fails (e.g. member left the server).
export function useMemberNames(guildId: string, userIds: string[]) {
  const [members, setMembers] = useState<Record<string, DiscordMemberOption>>({});

  useEffect(() => {
    const unique = [...new Set(userIds)].filter((id) => !members[id]);
    if (unique.length === 0) return;
    api.getDiscordMembers(guildId, unique).then((rows) => {
      setMembers((prev) => {
        const next = { ...prev };
        for (const row of rows) next[row.id] = row;
        return next;
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guildId, userIds.join(",")]);

  function displayName(userId: string): string {
    const member = members[userId];
    if (!member) return userId;
    return member.nickname && member.nickname !== member.username ? `${member.username} (${member.nickname})` : member.username;
  }

  return { displayName };
}
