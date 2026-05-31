interface Props {
  primary: string;
  secondary: string;
  size?: number;
}

export function ProTaggerMiniJersey({ primary, secondary, size = 24 }: Props) {
  const h = Math.round(size * 22 / 20);
  return (
    <svg
      viewBox="0 0 20 22"
      width={size}
      height={h}
      style={{ display: "block", flexShrink: 0 }}
      aria-hidden="true"
    >
      {/* Body + sleeves — solid primary fill */}
      <path
        d="M4,21 L4,8 L0,8 L0,4 L4,2 L7,5 L10,8 L13,5 L16,2 L20,4 L20,8 L16,8 L16,21 Z"
        fill={primary}
        stroke="rgba(255,255,255,0.15)"
        strokeWidth="0.75"
        strokeLinejoin="round"
      />
      {/* Collar band — solid secondary fill */}
      <path
        d="M7,5 L10,8 L13,5 Q10,2 7,5 Z"
        fill={secondary}
      />
      {/* Chest stripe — secondary, horizontal band across body */}
      <rect x="4" y="10" width="12" height="3" fill={secondary} />
    </svg>
  );
}
