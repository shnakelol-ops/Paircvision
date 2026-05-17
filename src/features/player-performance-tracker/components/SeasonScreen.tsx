import { type SeasonPlayerStat } from "../model/trainingTypes";

type Props = {
  seasonTable: SeasonPlayerStat[];
  onClearSeason: () => void;
};

export default function SeasonScreen({ seasonTable, onClearSeason }: Props) {
  return <section className="ppt-wrap">
    <section className="ppt-panel">
      <div className="ppt-sub">Season Table</div>
      {seasonTable.length===0?<div className="ppt-active">No season data yet.</div>:seasonTable.slice().sort((a,b)=>b.totalPoints-a.totalPoints).map((row,idx)=><div key={row.playerId} className="ppt-log-row"><span>{idx+1}. #{row.playerNumber} {row.playerName} ({row.sessions} sessions)</span><strong>{row.totalPoints>0?`+${row.totalPoints}`:row.totalPoints}</strong></div>)}
      <button className="ppt-action" onClick={onClearSeason}>Clear Season Table</button>
    </section>
  </section>;
}
