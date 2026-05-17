import { SHOT_EVENT_KEYS, TRAINING_EVENTS } from "../model/trainingScoring";
import { type TrainingEventDef, type TrainingEventKey } from "../model/trainingTypes";

type Props = { activeEventKey: TrainingEventKey | null; onSelectEvent: (eventKey: TrainingEventKey) => void; showShots: boolean; onToggleShots: () => void; };
const topRow: TrainingEventKey[] = ["goal", "point", "two-pt"];
const pointsClass=(p:number)=>p>0?"pos":p<0?"neg":"";
const tone=(e:TrainingEventDef)=>e.key==="repeated-mistake"?"ppt-red-heavy":e.key.startsWith("shot-")?"ppt-shotneg":e.color==="blue"?"ppt-blue":e.color==="orange"?"ppt-orange":e.color==="purple"?"ppt-purple":e.color==="green"?"ppt-green":"ppt-red";
const label=(e:TrainingEventDef)=>e.key.startsWith("shot-")?e.label.replace("Shot — ",""):e.label;
const EBtn=({event,active,onClick}:{event:TrainingEventDef;active:boolean;onClick:()=>void})=><button type="button" onClick={onClick} className={`ppt-event ${tone(event)} ${active?"active":""}`}><div className="ppt-event-label small">{label(event)}</div><div className={`ppt-points ${pointsClass(event.points)}`}>{event.points>0?`+${event.points}`:event.points}</div></button>;

export default function EventGrid({ activeEventKey, onSelectEvent, showShots, onToggleShots }: Props) {
  const eventMap = new Map(TRAINING_EVENTS.map((event) => [event.key, event]));
  const topEvents = topRow.map((key) => eventMap.get(key)).filter((event): event is TrainingEventDef => Boolean(event));
  const shotEvents = TRAINING_EVENTS.filter((event) => SHOT_EVENT_KEYS.includes(event.key));
  const remaining = TRAINING_EVENTS.filter((event) => !SHOT_EVENT_KEYS.includes(event.key) && !topRow.includes(event.key));
  const shotActive = showShots || (activeEventKey != null && SHOT_EVENT_KEYS.includes(activeEventKey));
  return <section className="ppt-event-grid-shell"><div className="ppt-grid4">{topEvents.map((event)=><EBtn key={event.key} event={event} active={activeEventKey===event.key} onClick={()=>onSelectEvent(event.key)} />)}<button type="button" onClick={onToggleShots} className={`ppt-event ppt-blue ${shotActive?"active":""}`}><div className="ppt-event-label small">SHOT</div><div className="ppt-points">{showShots?"▲":"▼"}</div></button></div>{showShots&&<div className="ppt-grid2 ppt-event-grid-shots">{shotEvents.map((event)=><EBtn key={event.key} event={event} active={activeEventKey===event.key} onClick={()=>onSelectEvent(event.key)} />)}</div>}<div className="ppt-grid3 ppt-event-grid-rest">{remaining.map((event)=><EBtn key={event.key} event={event} active={activeEventKey===event.key} onClick={()=>onSelectEvent(event.key)} />)}</div></section>;
}
