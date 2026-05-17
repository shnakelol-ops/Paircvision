import { type TrainingLogEntry } from "../model/trainingTypes";

type Filter = "ALL" | "LAST_5" | "LAST_10";

export default function EventLog({ logs, filter, onFilter, onDelete }: { logs: TrainingLogEntry[]; filter: Filter; onFilter: (f: Filter) => void; onDelete: (id: string) => void; }) {
  const options: Filter[] = ["ALL", "LAST_5", "LAST_10"];
  return <section className="ppt-log ppt-log-soft"><div className="ppt-log-head"><h3 className="ppt-log-title">EVENT LOG</h3><div className="ppt-filters">{options.map((option)=><button key={option} type="button" onClick={()=>onFilter(option)} className={`ppt-filter ${filter===option?"active":""}`}>{option==="ALL"?"ALL":option==="LAST_5"?"L5":"L10"}</button>)}</div></div>{logs.map((log)=><div key={log.id} className="ppt-log-row ppt-log-entry"><span className="ppt-log-text">{String(Math.floor(log.elapsedSeconds/60)).padStart(2,"0")}:{String(log.elapsedSeconds%60).padStart(2,"0")} {log.period} #{log.playerNumber} {log.playerName} {log.eventLabel} {log.points > 0 ? `+${log.points}` : log.points}</span><button type="button" onClick={() => onDelete(log.id)} className="ppt-del">Delete</button></div>)}</section>;
}
