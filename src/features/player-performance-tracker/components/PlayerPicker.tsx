import { ratingColor } from "../model/trainingScoring";
import { type TrainingPlayer } from "../model/trainingTypes";

type Props = { players: TrainingPlayer[]; ratings: Record<string, number>; onTapPlayer: (id: string)=>void };

export default function PlayerPicker({ players, ratings, onTapPlayer }: Props){
  return <div className="ppt-players ppt-player-grid">{players.map((p)=><button key={p.id} type="button" onClick={()=>onTapPlayer(p.id)} className="ppt-player ppt-player-tap"><div className="ppt-player-name">#{p.number} {p.name}</div><div className="ppt-chip" style={{color:ratingColor(ratings[p.id] ?? 0)}}>{ratings[p.id] ?? 0}</div></button>)}</div>;
}
