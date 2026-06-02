import type { MovementBoardToken } from "../shell/types";

export function buildDefaultTokens(): MovementBoardToken[] {
  const rowSizes = [1, 2, 3, 4, 5] as const;
  const tokens: MovementBoardToken[] = [];
  let jersey = 1;
  for (let row = 0; row < rowSizes.length; row += 1) {
    const rowSize = rowSizes[row]!;
    const x = 12 + row * 18;
    for (let i = 0; i < rowSize; i += 1) {
      const y = ((i + 1) * 100) / (rowSize + 1);
      tokens.push({
        id: `setup-token-${jersey}`,
        number: jersey,
        color: "blue",
        position: { x, y },
      });
      jersey += 1;
    }
  }
  return tokens;
}
