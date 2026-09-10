/**
 * Local player type for the internal Team Sheet tool. Deliberately NOT
 * ProTaggerSquadPlayer (src/pro-tagger/pro-tagger-session.ts) — this tool
 * must stay isolated from Event Stats types and state, so it defines its
 * own minimal shape instead of importing that one.
 */
export interface TeamSheetPlayer {
  id: string;
  number: number;
  name: string;
}
