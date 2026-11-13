import { ProTaggerJersey } from "./ProTaggerJersey";
import type { JerseyKit } from "./jersey-kit";

interface Props {
  primary: string;
  secondary: string;
  /** Jersey Designer V2 kit; omitted or invalid renders the default kit. */
  kit?: JerseyKit | null;
  size?: number;
}

// Small header/summary jersey icon. Draws through the shared
// ProTaggerJersey renderer so every jersey in Event Stats matches the
// team's chosen kit.
export function ProTaggerMiniJersey({ primary, secondary, kit, size = 24 }: Props) {
  return <ProTaggerJersey primary={primary} secondary={secondary} kit={kit} size={size} />;
}
