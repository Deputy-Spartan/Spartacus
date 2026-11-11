"use client";

import { createContext, useContext, type ReactNode } from "react";

// Lets a whole settings page sit inside another page (the Economy Hub's
// tabs) without repeating its title and module switch, which the hub
// already shows for that tab.
const Embedded = createContext(false);

export function EmbeddedPage({ children }: { children: ReactNode }) {
  return <Embedded.Provider value={true}>{children}</Embedded.Provider>;
}

export function useEmbedded() {
  return useContext(Embedded);
}
