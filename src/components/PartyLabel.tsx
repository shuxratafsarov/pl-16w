import type { Party } from "@/lib/types";
import { AkIcon } from "./AkIcon";

type Props = {
  party: Pick<Party, "num" | "type" | "is_auto">;
  /** Custom prefix before the number (e.g. "№" or "W3 · ") */
  prefix?: string;
  /** Hide the AK icon (text-only contexts like chart axis labels) */
  iconOff?: boolean;
  className?: string;
};

/**
 * Renders a party number, appending "(А)" + AK-47 icon for automatic MKO.
 * Use everywhere a party.num is shown in the UI.
 */
export const PartyLabel = ({ party, prefix = "", iconOff, className }: Props) => {
  const isAuto = party.type === "MKO" && party.is_auto;
  if (!isAuto) return <>{prefix}{party.num}</>;
  return (
    <span className={`inline-flex items-center gap-1 ${className ?? ""}`.trim()}>
      <span>{prefix}{party.num} (А)</span>
      {!iconOff && (
        <AkIcon
          className="inline-block h-3 w-auto opacity-80 shrink-0"
          aria-label="МКО автомат"
        />
      )}
    </span>
  );
};
