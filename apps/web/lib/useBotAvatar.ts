"use client";

import { useEffect, useState } from "react";
import { api } from "./api";

// The bot's actual current avatar (fetched live from Discord), for message
// previews so what you see matches what really gets posted — not a
// generic placeholder circle.
export function useBotAvatar(): string | null {
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    api
      .getBotConfig()
      .then((c) => setAvatarUrl(c.avatarUrl))
      .catch(() => null);
  }, []);

  return avatarUrl;
}
