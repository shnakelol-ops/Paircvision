import { type SavedSquad, type TrainingPlayer } from "../model/trainingTypes";

type Props = {
  sessionName: string;
  players: TrainingPlayer[];
  onSessionNameChange: (name: string) => void;
  onPlayerChange: (id: string, updates: Partial<TrainingPlayer>) => void;
  onAddPlayer: () => void;
  onAddTeamA: () => void;
  onAddTeamB: () => void;
  onRemovePlayer: (id: string) => void;
  onStart: () => void;
  squads: SavedSquad[];
  activeSquadId: string | null;
  onSelectSquad: (squadId: string) => void;
  onSaveCurrentSquad: () => void;
};

export default function SetupScreen({ sessionName, players, onSessionNameChange, onPlayerChange, onAddPlayer, onAddTeamA, onAddTeamB, onRemovePlayer, onStart, squads, activeSquadId, onSelectSquad, onSaveCurrentSquad }: Props) {
  const canAdd = players.length < 30;
  return <div className="ppt-wrap ppt-setup"><h1>Vision Training</h1><div className="ppt-sub">Player Performance Tracker</div>
    <section className="ppt-panel ppt-setup-section"><div className="ppt-setup-section-head"><h2 className="ppt-setup-title">Saved Squads</h2><span className="ppt-setup-count">{squads.length}/10</span></div>{squads.length===0?<div className="ppt-active">No saved squads yet.</div>:<div className="ppt-squad-list">{squads.map((s)=>{const isActive=activeSquadId===s.id;return <button key={s.id} className={`ppt-action ppt-squad-action ${isActive?"active":""}`} onClick={()=>onSelectSquad(s.id)}><span><strong className="ppt-squad-name">{s.name}</strong><span className="ppt-squad-meta">{s.players.length} players</span></span>{isActive?<span className="ppt-squad-active">Active</span>:null}</button>;})}</div>}<button className="ppt-action primary" onClick={onSaveCurrentSquad} disabled={squads.length>=10 && !activeSquadId}>Save Current Squad</button></section>
    <section className="ppt-panel ppt-setup-section">
      <div className="ppt-setup-section-head"><h2 className="ppt-setup-title">Current Squad</h2><span className="ppt-setup-count">{players.length}/30</span></div>
      <div className="ppt-setup-quick-add">
        <button className="ppt-action ppt-quick-add-btn" onClick={onAddTeamA} disabled={!canAdd}>+ Team A</button>
        <button className="ppt-action ppt-quick-add-btn" onClick={onAddTeamB} disabled={!canAdd}>+ Team B</button>
        <button className="ppt-action ppt-quick-add-btn" onClick={onAddPlayer} disabled={!canAdd}>+ Add Player</button>
      </div>
      <div className="ppt-setup-players">{players.map((p)=><div className="ppt-setup-player" key={p.id}><div className="ppt-setup-row"><input className="ppt-number" type='number' value={p.number} onChange={(e)=>onPlayerChange(p.id,{number:Number(e.target.value)})}/><input className="ppt-input" value={p.name} onChange={(e)=>onPlayerChange(p.id,{name:e.target.value})}/><button className="ppt-remove-btn" type="button" aria-label={`Remove player ${p.number}`} onClick={()=>onRemovePlayer(p.id)}>✕</button></div></div>)}</div>
    </section>
    <section className="ppt-panel ppt-setup-section"><h2 className="ppt-setup-title">Session Start</h2><label className="ppt-setup-label" htmlFor="ppt-session-name">Session Name</label><input id="ppt-session-name" className="ppt-input" value={sessionName} onChange={(e)=>onSessionNameChange(e.target.value)} /><button className="ppt-action primary" onClick={onStart}>Start Session</button></section>
  </div>;
}
