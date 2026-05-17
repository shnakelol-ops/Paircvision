import React from "react";
import EventGrid from "./EventGrid";
import PlayerPicker from "./PlayerPicker";
import EventLog from "./EventLog";
import { TRAINING_EVENTS } from "../model/trainingScoring";
import { type TrainingEventKey, type TrainingLogEntry, type TrainingPeriod, type TrainingPlayer } from "../model/trainingTypes";

type Filter = "ALL"|"LAST_5"|"LAST_10";
function fmt(sec:number){const s=Math.max(0,Number.isFinite(sec)?Math.floor(sec):0);return `${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;}

export default function TrackerScreen(props:{players:TrainingPlayer[];logs:TrainingLogEntry[];elapsedSeconds:number;isRunning:boolean;period:TrainingPeriod;activeEventKey:TrainingEventKey|null;onToggleTimer:()=>void;onReset:()=>void;onPeriod:(p:TrainingPeriod)=>void;onSelectEvent:(k:TrainingEventKey)=>void;onTapPlayer:(id:string)=>void;onDelete:(id:string)=>void;onUndo:()=>void;lastDeleted:TrainingLogEntry|null|undefined}){
  const [showShots,setShowShots]=React.useState(false);const [filter,setFilter]=React.useState<Filter>("ALL");
  const [trackerView,setTrackerView]=React.useState<"events"|"players">("events");
  const now=props.elapsedSeconds;const filtered=props.logs.filter((l)=>filter==="ALL"?true:filter==="LAST_5"?now-l.elapsedSeconds<=300:now-l.elapsedSeconds<=600).slice().reverse();
  const ratings=props.players.reduce<Record<string,number>>((acc,p)=>{acc[p.id]=props.logs.filter((l)=>l.playerId===p.id).reduce((a,l)=>a+l.points,0);return acc;},{});
  const active=TRAINING_EVENTS.find((e)=>e.key===props.activeEventKey);
  const handleSelectEvent=(k:TrainingEventKey)=>{const nextActive=props.activeEventKey===k?null:k; props.onSelectEvent(k); if(nextActive) setTrackerView("players");};
  const handleTapPlayer=(id:string)=>{props.onTapPlayer(id); setTrackerView("events");};
  return <div className="ppt-wrap ppt-tracker"><section className="ppt-panel ppt-center"><div className="ppt-eyebrow">MY SQUAD</div><div className="ppt-timer">{fmt(props.elapsedSeconds)}</div><div className="ppt-row"><button className={`ppt-control ${props.isRunning?"ppt-reset":"ppt-start"}`} onClick={props.onToggleTimer}>{props.isRunning?"Pause":"Start"}</button><button className="ppt-control ppt-reset" onClick={props.onReset}>Reset</button></div><div className="ppt-periods">{(["PRE","1H","2H","ET"] as TrainingPeriod[]).map((p)=><button key={p} className={`ppt-period ${props.period===p?"active":""}`} onClick={()=>props.onPeriod(p)}>{p}</button>)}</div><div className="ppt-active ppt-active-event">Active: {active?active.label:"None"}</div></section>
  {trackerView==="events" ? <><EventGrid activeEventKey={props.activeEventKey} onSelectEvent={handleSelectEvent} showShots={showShots} onToggleShots={()=>setShowShots((s)=>!s)} /><EventLog logs={filtered.slice(0,6)} filter={filter} onFilter={setFilter} onDelete={props.onDelete} /></> : <section className="ppt-panel ppt-tracker-players-panel"><div className="ppt-active">{active?`${active.label} — WHO?`:"Select an event"}</div><PlayerPicker players={props.players} ratings={ratings} onTapPlayer={handleTapPlayer} /><button className="ppt-action" onClick={()=>setTrackerView("events")}>Back to Events</button></section>}
  {props.lastDeleted && <button className="ppt-undo" onClick={props.onUndo}>↩</button>}</div>;
}
