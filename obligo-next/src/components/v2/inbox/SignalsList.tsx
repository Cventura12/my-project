"use client";

import { UISignal } from "@/types/ui";
import SignalRow from "./SignalRow";

export default function SignalsList({
  items,
  rawItems,
  onDismiss,
  onOpen,
}: {
  items: UISignal[];
  rawItems: any[];
  onDismiss: (id: string) => void;
  onOpen: (signal: UISignal) => void;
}) {
  const rawById = new Map(rawItems.map((r) => [r.id, r]));

  return (
    <div className="space-y-3">
      {items.map((signal) => (
        <SignalRow
          key={signal.id}
          signal={signal}
          raw={rawById.get(signal.id)}
          onDismiss={() => onDismiss(signal.id)}
          onOpen={() => onOpen(signal)}
        />
      ))}
    </div>
  );
}
