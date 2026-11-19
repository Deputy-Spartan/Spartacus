"use client";

import { createContext, useContext, useState } from "react";

// One Edit Mode for the whole dashboard (owner only). The sidebar's Edit
// button turns it on: the menu becomes editable (components/nav/NavEditor.tsx)
// and so does every page (components/edit/PageEditor.tsx).

const Ctx = createContext<{ editing: boolean; setEditing: (v: boolean) => void }>({ editing: false, setEditing: () => {} });

export function EditModeProvider({ children }: { children: React.ReactNode }) {
  const [editing, setEditing] = useState(false);
  return <Ctx.Provider value={{ editing, setEditing }}>{children}</Ctx.Provider>;
}

export const useEditMode = () => useContext(Ctx);
