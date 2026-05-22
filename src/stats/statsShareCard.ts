type TeamScore = { goals: number; points: number; total: number };
type TeamSide = "HOME" | "AWAY";
type LoggedEventLike = { kind?: string; team?: string; teamSide?: string; id?: string; tags?: readonly string[] | undefined };

type StatsShareCardInput = {
  stageLabel: "Half Time" | "Full Time";
  homeTeamName: string;
  awayTeamName: string;
  venueLabel: string;
  clockLabel: string;
  homeScore: TeamScore;
  awayScore: TeamScore;
  eventCount: number;
  events: readonly LoggedEventLike[];
};

type TeamBreakdown = {
  shots: number; scores: number; wides: number; short: number; post: number; fortyFive: number; blocked: number;
  kickWon: number; kickLost: number; kickClean: number; kickBreak: number;
  toWon: number; toLost: number; toForced: number; toUnforced: number;
  yellow: number; black: number; red: number;
};

const CARD_WIDTH = 1080;
const CARD_HEIGHT = 1640;
const formatGaelicScore = (s: TeamScore) => `${s.goals}-${s.points}`;
const pct = (n:number,d:number)=> d>0?`${Math.round((n/d)*100)}%`:'0%';
const init = ():TeamBreakdown=>({shots:0,scores:0,wides:0,short:0,post:0,fortyFive:0,blocked:0,kickWon:0,kickLost:0,kickClean:0,kickBreak:0,toWon:0,toLost:0,toForced:0,toUnforced:0,yellow:0,black:0,red:0});
const has=(tags:readonly string[]|undefined,t:string)=>!!tags?.includes(t);

function getTeam(event: LoggedEventLike): TeamSide | null {
  if (event.team === 'HOME' || String(event.id||'').startsWith('team-home-')) return 'HOME';
  if (event.team === 'AWAY' || String(event.id||'').startsWith('team-away-')) return 'AWAY';
  if (event.teamSide === 'FOR') return 'HOME';
  if (event.teamSide === 'OPP') return 'AWAY';
  return null;
}

function buildBreakdown(events: readonly LoggedEventLike[]): Record<TeamSide, TeamBreakdown> {
  const r={HOME:init(),AWAY:init()} as Record<TeamSide,TeamBreakdown>;
  for (const e of events){
    const t=getTeam(e); if(!t) continue; const b=r[t]; const k=e.kind; const tags=e.tags;
    if (k==='SHOT') { b.shots++; if(has(tags,'SHORT')) b.short++; if(has(tags,'POST')) b.post++; if(has(tags,'FORTY_FIVE')) b.fortyFive++; if(has(tags,'BLOCKED')) b.blocked++; }
    if (k==='WIDE') { b.wides++; b.shots++; }
    if (k==='GOAL'||k==='POINT'||k==='TWO_POINTER'||k==='FORTY_FIVE_TWO_POINT'||k==='FREE_SCORED') { b.scores++; b.shots++; }
    if (k==='KICKOUT_WON') { b.kickWon++; if(has(tags,'CLEAN')) b.kickClean++; if(has(tags,'BREAK')) b.kickBreak++; }
    if (k==='KICKOUT_CONCEDED') { b.kickLost++; if(has(tags,'CLEAN')) b.kickClean++; if(has(tags,'BREAK')) b.kickBreak++; }
    if (k==='TURNOVER_WON') { b.toWon++; if(has(tags,'FORCED')) b.toForced++; if(has(tags,'UNFORCED')) b.toUnforced++; }
    if (k==='TURNOVER_LOST') { b.toLost++; if(has(tags,'FORCED')) b.toForced++; if(has(tags,'UNFORCED')) b.toUnforced++; }
    if (k==='YELLOW_CARD') b.yellow++;
    if (k==='BLACK_CARD') b.black++;
    if (k==='RED_CARD') b.red++;
  }
  return r;
}

function drawHeader(ctx:CanvasRenderingContext2D,input:StatsShareCardInput){
  const g=ctx.createLinearGradient(0,0,CARD_WIDTH,CARD_HEIGHT); g.addColorStop(0,'#0b1020'); g.addColorStop(1,'#101a37');
  ctx.fillStyle=g; ctx.fillRect(0,0,CARD_WIDTH,CARD_HEIGHT); ctx.fillStyle='#22c55e'; ctx.fillRect(0,0,CARD_WIDTH,16);
  ctx.fillStyle='#e5e7eb'; ctx.font='600 34px Inter,system-ui,sans-serif'; ctx.fillText(input.stageLabel,72,84);
  ctx.fillStyle='#f9fafb'; ctx.font='700 50px Inter,system-ui,sans-serif'; ctx.fillText(`${input.homeTeamName} v ${input.awayTeamName}`,72,152);
  ctx.fillStyle='#9ca3af'; ctx.font='500 28px Inter,system-ui,sans-serif'; ctx.fillText(`${input.venueLabel} · ${input.clockLabel}`,72,196);
}

function drawScore(ctx:CanvasRenderingContext2D,input:StatsShareCardInput){
  ctx.fillStyle='#111827'; ctx.fillRect(56,224,CARD_WIDTH-112,150); ctx.strokeStyle='#374151'; ctx.lineWidth=2; ctx.strokeRect(56,224,CARD_WIDTH-112,150);
  ctx.fillStyle='#f9fafb'; ctx.font='700 58px Inter,system-ui,sans-serif'; ctx.fillText(formatGaelicScore(input.homeScore),80,306); ctx.textAlign='right'; ctx.fillText(formatGaelicScore(input.awayScore),CARD_WIDTH-80,306); ctx.textAlign='left';
  ctx.fillStyle='#9ca3af'; ctx.font='600 28px Inter,system-ui,sans-serif'; ctx.fillText(`${input.homeTeamName} (${input.homeScore.total})`,80,348); ctx.textAlign='right'; ctx.fillText(`${input.awayTeamName} (${input.awayScore.total})`,CARD_WIDTH-80,348); ctx.textAlign='left';
}

function row(ctx:CanvasRenderingContext2D,y:number,label:string,left:string,right:string){
  ctx.fillStyle='#9ca3af'; ctx.font='600 24px Inter,system-ui,sans-serif'; ctx.fillText(label,72,y);
  ctx.fillStyle='#f9fafb'; ctx.font='700 28px Inter,system-ui,sans-serif'; ctx.fillText(left,360,y); ctx.textAlign='right'; ctx.fillText(right,CARD_WIDTH-72,y); ctx.textAlign='left';
}

export async function buildStatsShareCardPng(input: StatsShareCardInput): Promise<File | null> {
  const c=document.createElement('canvas'); c.width=CARD_WIDTH; c.height=CARD_HEIGHT; const ctx=c.getContext('2d'); if(!ctx) return null;
  drawHeader(ctx,input); drawScore(ctx,input);
  const d=buildBreakdown(input.events);
  ctx.fillStyle='#cbd5e1'; ctx.font='700 26px Inter,system-ui,sans-serif'; ctx.fillText(input.homeTeamName,360,412); ctx.textAlign='right'; ctx.fillText(input.awayTeamName,CARD_WIDTH-72,412); ctx.textAlign='left';
  let y=454;
  ctx.fillStyle='#93c5fd'; ctx.font='700 28px Inter,system-ui,sans-serif'; ctx.fillText('Shooting',72,y); y+=34;
  row(ctx,y,'Shots',String(d.HOME.shots),String(d.AWAY.shots)); y+=42;
  row(ctx,y,'Scores',String(d.HOME.scores),String(d.AWAY.scores)); y+=42;
  row(ctx,y,'Wides',String(d.HOME.wides),String(d.AWAY.wides)); y+=42;
  row(ctx,y,'Conversion',pct(d.HOME.scores,d.HOME.shots),pct(d.AWAY.scores,d.AWAY.shots)); y+=42;
  row(ctx,y,'Shot tags S/P/45/B',`${d.HOME.short}/${d.HOME.post}/${d.HOME.fortyFive}/${d.HOME.blocked}`,`${d.AWAY.short}/${d.AWAY.post}/${d.AWAY.fortyFive}/${d.AWAY.blocked}`); y+=56;
  ctx.fillStyle='#93c5fd'; ctx.font='700 28px Inter,system-ui,sans-serif'; ctx.fillText('Kickouts',72,y); y+=34;
  row(ctx,y,'Won / Total',`${d.HOME.kickWon}/${d.HOME.kickWon+d.HOME.kickLost}`,`${d.AWAY.kickWon}/${d.AWAY.kickWon+d.AWAY.kickLost}`); y+=42;
  row(ctx,y,'Win %',pct(d.HOME.kickWon,d.HOME.kickWon+d.HOME.kickLost),pct(d.AWAY.kickWon,d.AWAY.kickWon+d.AWAY.kickLost)); y+=42;
  row(ctx,y,'Clean / Break',`${d.HOME.kickClean}/${d.HOME.kickBreak}`,`${d.AWAY.kickClean}/${d.AWAY.kickBreak}`); y+=56;
  ctx.fillStyle='#93c5fd'; ctx.font='700 28px Inter,system-ui,sans-serif'; ctx.fillText('Turnovers',72,y); y+=34;
  row(ctx,y,'Won',String(d.HOME.toWon),String(d.AWAY.toWon)); y+=42;
  row(ctx,y,'Lost',String(d.HOME.toLost),String(d.AWAY.toLost)); y+=42;
  row(ctx,y,'Balance',String(d.HOME.toWon-d.HOME.toLost),String(d.AWAY.toWon-d.AWAY.toLost)); y+=42;
  row(ctx,y,'Forced / Unforced',`${d.HOME.toForced}/${d.HOME.toUnforced}`,`${d.AWAY.toForced}/${d.AWAY.toUnforced}`); y+=56;
  if (d.HOME.yellow+d.HOME.black+d.HOME.red+d.AWAY.yellow+d.AWAY.black+d.AWAY.red>0){
    ctx.fillStyle='#93c5fd'; ctx.font='700 28px Inter,system-ui,sans-serif'; ctx.fillText('Discipline',72,y); y+=34;
    row(ctx,y,'Y / B / R',`${d.HOME.yellow}/${d.HOME.black}/${d.HOME.red}`,`${d.AWAY.yellow}/${d.AWAY.black}/${d.AWAY.red}`); y+=48;
  }
  ctx.fillStyle='#9ca3af'; ctx.font='600 24px Inter,system-ui,sans-serif'; ctx.fillText(`Logged events: ${input.eventCount}`,72,CARD_HEIGHT-78);
  ctx.fillStyle='#6b7280'; ctx.font='500 24px Inter,system-ui,sans-serif'; ctx.textAlign='right'; ctx.fillText('Páirc Stats Lite summary',CARD_WIDTH-72,CARD_HEIGHT-78); ctx.textAlign='left';
  const blob = await new Promise<Blob | null>((resolve)=>c.toBlob((b)=>resolve(b),'image/png')); if(!blob) return null;
  const fileLabel=`${input.homeTeamName}-${input.awayTeamName}-${input.stageLabel}`.toLowerCase().replace(/[^a-z0-9-]+/g,'-').replace(/^-+|-+$/g,'');
  return new File([blob],`${fileLabel||'match'}-summary.png`,{type:'image/png'});
}
