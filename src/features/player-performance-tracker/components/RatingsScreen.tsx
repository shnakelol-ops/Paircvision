import { ratingColor } from "../model/trainingScoring";
import { type TrainingLogEntry, type TrainingPlayer } from "../model/trainingTypes";

function countByKey(logs: TrainingLogEntry[], key: string): number {
  return logs.filter((l) => l.eventKey === key).length;
}

export default function RatingsScreen({ players, logs, ratings }: {players: TrainingPlayer[]; logs: TrainingLogEntry[]; ratings: Record<string, number>}) {
  const sorted = [...players].sort((a,b)=>(ratings[b.id]??0)-(ratings[a.id]??0));

  return <section className="ppt-wrap"><h2 className="ppt-ratings-title">Squad Ratings</h2>{sorted.map((p, idx)=>{
    const playerLogs=logs.filter((l)=>l.playerId===p.id);

    const scoreTotal = playerLogs.filter((l)=>l.category==="score").reduce((a,l)=>a+l.points,0);
    const shotsTotal = playerLogs.filter((l)=>l.category==="shots").reduce((a,l)=>a+l.points,0);
    const widesTotal = playerLogs.filter((l)=>l.category==="wides").reduce((a,l)=>a+l.points,0);

    const toPlus = countByKey(playerLogs, "turnover-plus");
    const toMinus = countByKey(playerLogs, "turnover-minus");
    const koPlus = countByKey(playerLogs, "kickout-plus");
    const koMinus = countByKey(playerLogs, "kickout-minus");
    const frPlus = countByKey(playerLogs, "free-plus") + countByKey(playerLogs, "free-scored");
    const frMinus = countByKey(playerLogs, "free-minus") + countByKey(playerLogs, "free-missed");
    const decPlus = countByKey(playerLogs, "good-decision");
    const decMinus = countByKey(playerLogs, "bad-decision");
    const rmCount = countByKey(playerLogs, "repeated-mistake");
    const passPlus = countByKey(playerLogs, "good-pass");
    const passMinus = countByKey(playerLogs, "bad-pass");
    const wrPlus = countByKey(playerLogs, "work-rate-plus");
    const wrMinus = countByKey(playerLogs, "work-rate-minus");

    return <div key={p.id} className={`ppt-rating-card compact ${idx===0?"top":""} ${idx===sorted.length-1?"low":""}`}><div className="ppt-rating-head"><div className="ppt-rating-name compact">#{p.number} {p.name}</div><span className="ppt-rating-score compact" style={{color:ratingColor(ratings[p.id]??0)}}>{ratings[p.id]??0}</span></div><div className="ppt-break compact"><span>Score {scoreTotal}</span><span>Shots {shotsTotal}</span><span>Wides {widesTotal}</span><span>TO {toPlus}/{toMinus}</span><span>KO {koPlus}/{koMinus}</span><span>FR {frPlus}/{frMinus}</span><span>Dec {decPlus}/{decMinus}</span><span>RM {rmCount}</span><span>Pass {passPlus}/{passMinus}</span><span>WR {wrPlus}/{wrMinus}</span></div></div>;
  })}</section>;
}
