import "../features/player-performance-tracker/playerPerformanceTracker.css";
import { useEffect, useMemo, useRef, useState } from "react";
import SetupScreen from "../features/player-performance-tracker/components/SetupScreen";
import TrackerScreen from "../features/player-performance-tracker/components/TrackerScreen";
import RatingsScreen from "../features/player-performance-tracker/components/RatingsScreen";
import SeasonScreen from "../features/player-performance-tracker/components/SeasonScreen";
import VisionStadiumBackground from "../components/VisionStadiumBackground";
import { useScreenWakeLock } from "../hooks/useScreenWakeLock";
import { TRAINING_EVENTS } from "../features/player-performance-tracker/model/trainingScoring";
import { loadSavedSquads, loadSeasonTable, loadSessionState, saveSavedSquads, saveSeasonTable, saveSessionState } from "../features/player-performance-tracker/storage/trainingSessionStorage";
import { type SavedSquad, type SeasonPlayerStat, type TrainingLogEntry, type TrainingPeriod, type TrainingSessionState } from "../features/player-performance-tracker/model/trainingTypes";

function id(){return `${Date.now()}-${Math.random().toString(36).slice(2,8)}`;}
type TrackerScreenView = "setup" | "live" | "ratings" | "season";
type SaveSessionFeedbackState = "idle" | "success" | "duplicate" | "failure";

export default function PlayerPerformanceTracker(){
  const [state,setState]=useState<TrainingSessionState>(()=>loadSessionState());
  const [seasonTable,setSeasonTable]=useState<SeasonPlayerStat[]>(()=>loadSeasonTable());
  const [squads,setSquads]=useState<SavedSquad[]>(()=>loadSavedSquads());
  const [activeSquadId,setActiveSquadId]=useState<string|null>(null);
  const [screen,setScreen]=useState<TrackerScreenView>(()=>!state.hasStarted?"setup":state.activeTab==="ratings"?"ratings":"live");
  const [saveSessionFeedback,setSaveSessionFeedback]=useState<SaveSessionFeedbackState>("idle");
  const saveSessionFeedbackTimeoutRef=useRef<number|null>(null);
  const hasSavedCurrentSessionRef=useRef(false);
  const isTrainingSessionActive = state.hasStarted;

  useScreenWakeLock(isTrainingSessionActive);

  useEffect(()=>{saveSessionState(state);},[state]);
  useEffect(()=>{if(!state.hasStarted||!state.isRunning) return;const t=window.setInterval(()=>setState((s)=>({...s,elapsedSeconds:Math.max(0,(s.elapsedSeconds||0)+1)})),1000);return ()=>window.clearInterval(t);},[state.hasStarted,state.isRunning]);
  useEffect(()=>()=>{if(saveSessionFeedbackTimeoutRef.current!==null){window.clearTimeout(saveSessionFeedbackTimeoutRef.current);}},[]);

  const ratings = useMemo(()=>state.players.reduce<Record<string,number>>((acc,p)=>{acc[p.id]=state.logs.filter((l)=>l.playerId===p.id).reduce((a,l)=>a+l.points,0);return acc;},{}),[state.players,state.logs]);

  const resetSaveSessionDuplicateGuard=()=>{hasSavedCurrentSessionRef.current=false;setSaveSessionFeedback("idle");};
  const scheduleSaveSessionFeedbackReset=()=>{if(saveSessionFeedbackTimeoutRef.current!==null){window.clearTimeout(saveSessionFeedbackTimeoutRef.current);}saveSessionFeedbackTimeoutRef.current=window.setTimeout(()=>{setSaveSessionFeedback("idle");saveSessionFeedbackTimeoutRef.current=null;},1800);};
  const saveCurrentSessionToSeason = ()=>{
    if(hasSavedCurrentSessionRef.current){
      setSaveSessionFeedback("duplicate");
      scheduleSaveSessionFeedbackReset();
      return;
    }
    try {
      const next = new Map(seasonTable.map((s)=>[s.playerId,s]));
      state.players.forEach((p)=>{
        const existing = next.get(p.id);
        const points = ratings[p.id] ?? 0;
        next.set(p.id, {
          playerId: p.id,
          playerNumber: p.number,
          playerName: p.name,
          totalPoints: (existing?.totalPoints ?? 0) + points,
          sessions: (existing?.sessions ?? 0) + 1,
        });
      });
      const merged = Array.from(next.values());
      setSeasonTable(merged);
      saveSeasonTable(merged);
      hasSavedCurrentSessionRef.current=true;
      setSaveSessionFeedback("success");
    } catch {
      setSaveSessionFeedback("failure");
    } finally {
      scheduleSaveSessionFeedbackReset();
    }
  };

  const onTapPlayer=(playerId:string)=>{if(!state.activeEventKey) return; const player=state.players.find((p)=>p.id===playerId); const ev=TRAINING_EVENTS.find((e)=>e.key===state.activeEventKey); if(!player||!ev) return; const log:TrainingLogEntry={id:id(),eventKey:ev.key,eventLabel:ev.label,points:ev.points,category:ev.category,playerId:player.id,playerName:player.name,playerNumber:player.number,elapsedSeconds:Math.max(0,state.elapsedSeconds||0),period:state.period,createdAt:Date.now()}; setState((s)=>({...s,logs:[...s.logs,log]}));};
  const saveSessionButtonLabel=saveSessionFeedback==="success"?"SAVED ✓":saveSessionFeedback==="duplicate"?"ALREADY SAVED":saveSessionFeedback==="failure"?"FAILED":"Save Session to Season";
  const saveSessionButtonClassName=["ppt-action","primary","ppt-save-session-btn",saveSessionFeedback==="success"?"ppt-save-session-btn-success":"",saveSessionFeedback==="duplicate"?"ppt-save-session-btn-duplicate":"",saveSessionFeedback==="failure"?"ppt-save-session-btn-failure":""].filter(Boolean).join(" ");

  const setupScreen = (
    <SetupScreen
      sessionName={state.sessionName}
      players={state.players}
      onSessionNameChange={(sessionName) => setState((s) => ({ ...s, sessionName }))}
      onPlayerChange={(id, updates) => setState((s) => ({ ...s, players: s.players.map((p) => (p.id === id ? { ...p, ...updates } : p)) }))}
      onAddPlayer={() =>
        setState((s) =>
          s.players.length >= 30 ? s : { ...s, players: [...s.players, { id: `player-${id()}`, name: `Player ${s.players.length + 1}`, number: s.players.length + 1 }] },
        )
      }
      onAddTeamA={() =>
        setState((s) => {
          const toAdd = Math.min(15, 30 - s.players.length);
          if (toAdd <= 0) return s;
          const next = Array.from({ length: toAdd }, (_, i) => ({ id: `player-${id()}`, name: `Player ${i + 1}`, number: i + 1 }));
          return { ...s, players: [...s.players, ...next] };
        })
      }
      onAddTeamB={() =>
        setState((s) => {
          const toAdd = Math.min(15, 30 - s.players.length);
          if (toAdd <= 0) return s;
          const next = Array.from({ length: toAdd }, (_, i) => ({ id: `player-${id()}`, name: `Player ${i + 1}`, number: i + 1 }));
          return { ...s, players: [...s.players, ...next] };
        })
      }
      onRemovePlayer={(playerId) =>
        setState((s) => ({ ...s, players: s.players.filter((p) => p.id !== playerId) }))
      }
      onStart={() => {
        setState((s) => ({ ...s, hasStarted: true, activeTab: "tracker" }));
        resetSaveSessionDuplicateGuard();
        setScreen("live");
      }}
      squads={squads}
      activeSquadId={activeSquadId}
      onSelectSquad={(squadId) => {
        const squad = squads.find((x) => x.id === squadId);
        if (!squad) return;
        setActiveSquadId(squadId);
        setState((s) => ({ ...s, players: squad.players.map((p) => ({ ...p })) }));
      }}
      onSaveCurrentSquad={() => {
        const exists = activeSquadId ? squads.find((s) => s.id === activeSquadId) : null;
        const nextName = exists?.name ?? `Squad ${squads.length + 1}`;
        const nextId = exists?.id ?? `squad-${Date.now()}`;
        const nextSquad: SavedSquad = { id: nextId, name: nextName, players: state.players.slice(0, 30).map((p) => ({ ...p })) };
        const next = exists ? squads.map((s) => (s.id === nextId ? nextSquad : s)) : [...squads, nextSquad].slice(0, 10);
        setSquads(next);
        setActiveSquadId(nextId);
        saveSavedSquads(next);
      }}
    />
  );

  return (
    <div className="ppt-page-shell">
      <VisionStadiumBackground variant="training" />
      {screen === "setup" ? (
        <div className="ppt-shell">{setupScreen}</div>
      ) : (
        <div className="ppt-shell">
          <div className="ppt-container">
            <header className="ppt-header">
              <h1 className="text-xl font-semibold">Vision Training</h1>
              <p className="text-sm text-slate-300">Player Performance Tracker</p>
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button
                  className="ppt-action"
                  onClick={() => {
                    setState((s) => ({ ...s, hasStarted: false, isRunning: false, activeTab: "tracker" }));
                    resetSaveSessionDuplicateGuard();
                    setScreen("setup");
                  }}
                >
                  Back to Squad
                </button>
                <button className={saveSessionButtonClassName} onClick={saveCurrentSessionToSeason}>
                  {saveSessionButtonLabel}
                </button>
                <button className="ppt-action" onClick={() => setScreen("season")}>
                  Season
                </button>
              </div>
            </header>
            {screen === "live" ? (
              <TrackerScreen
                players={state.players}
                logs={state.logs}
                elapsedSeconds={state.elapsedSeconds}
                isRunning={state.isRunning}
                period={state.period}
                activeEventKey={state.activeEventKey}
                onToggleTimer={() => setState((s) => ({ ...s, isRunning: !s.isRunning }))}
                onReset={() => {
                  if (window.confirm("Reset session timer and logs?")) {
                    setState((s) => ({ ...s, elapsedSeconds: 0, logs: [], isRunning: false, lastDeleted: null }));
                    resetSaveSessionDuplicateGuard();
                  }
                }}
                onPeriod={(period: TrainingPeriod) => setState((s) => ({ ...s, period }))}
                onSelectEvent={(k) => setState((s) => ({ ...s, activeEventKey: s.activeEventKey === k ? null : k }))}
                onTapPlayer={onTapPlayer}
                onDelete={(id) =>
                  setState((s) => {
                    const found = s.logs.find((l) => l.id === id) ?? null;
                    return { ...s, logs: s.logs.filter((l) => l.id !== id), lastDeleted: found };
                  })
                }
                onUndo={() => setState((s) => (s.lastDeleted ? { ...s, logs: [...s.logs, s.lastDeleted], lastDeleted: null } : s))}
                lastDeleted={state.lastDeleted}
              />
            ) : screen === "ratings" ? (
              <RatingsScreen players={state.players} logs={state.logs} ratings={ratings} />
            ) : (
              <SeasonScreen
                seasonTable={seasonTable}
                onClearSeason={() => {
                  if (window.confirm("Clear season table?")) {
                    setSeasonTable([]);
                    saveSeasonTable([]);
                  }
                }}
              />
            )}
          </div>
          <nav className="ppt-nav">
            <div className="ppt-nav-inner">
              <button
                type="button"
                onClick={() => {
                  setState((s) => ({ ...s, activeTab: "tracker" }));
                  setScreen("live");
                }}
                className={["ppt-nav-item", screen === "live" ? "active" : "inactive"].join(" ")}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true" className="ppt-nav-icon">
                  <path d="M2 13h4l3-8 4 14 3-8h6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span>Tracker</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setState((s) => ({ ...s, activeTab: "ratings" }));
                  setScreen("ratings");
                }}
                className={["ppt-nav-item", screen === "ratings" ? "active" : "inactive"].join(" ")}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true" className="ppt-nav-icon">
                  <path d="M4 20V10m6 10V4m6 16v-7m4 7H2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
                <span>Ratings</span>
              </button>
            </div>
          </nav>
        </div>
      )}
    </div>
  );
}
