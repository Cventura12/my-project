"use client";

import { createContext, useContext, useMemo, useState } from "react";

interface SelectionContextValue {
  selectedObligationId: string | null;
  openDrawer: (id: string) => void;
  closeDrawer: () => void;
}

const SelectionContext = createContext<SelectionContextValue | null>(null);

export function SelectionProvider({ children }: { children: React.ReactNode }) {
  const [selectedObligationId, setSelectedObligationId] = useState<string | null>(null);

  const value = useMemo(
    () => ({
      selectedObligationId,
      openDrawer: (id: string) => setSelectedObligationId(id),
      closeDrawer: () => setSelectedObligationId(null),
    }),
    [selectedObligationId]
  );

  return <SelectionContext.Provider value={value}>{children}</SelectionContext.Provider>;
}

export function useSelection() {
  const ctx = useContext(SelectionContext);
  if (!ctx) {
    throw new Error("useSelection must be used within SelectionProvider");
  }
  return ctx;
}
