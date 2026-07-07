import { isFreeScore, isFreeMiss } from "./eventSource";

type TeamScore = { goals: number; points: number; total: number };
type TeamSide = "HOME" | "AWAY";
type LoggedEventLike = {
  kind?: string;
  team?: string;
  teamSide?: string;
  id?: string;
  tags?: readonly string[] | undefined;
};

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
  shots: number; scores: number; wides: number; goals: number; points: number; twoPt: number; short: number; post: number; fortyFive: number; blocked: number;
  kickWon: number; kickLost: number; kickClean: number; kickBreak: number;
  kickFoulWon: number; kickFoulConceded: number; kickDead: number;
  toWon: number; toLost: number; toForced: number; toUnforced: number;
  toTackle: number; toPress: number; toSwarm: number; toIntercept: number;
  toSlackKP: number; toSlackHP: number; toOvercarried: number; toStripped: number;
  freesFor: number; freesAgainst: number; freeScored: number; freeMissed: number;
  yellow: number; black: number; red: number;
};

const CARD_WIDTH = 1080;
const BASE_CARD_HEIGHT = 1640;
const FOOTER_TEXT_OFFSET = 78;
const FOOTER_SAFE_PADDING = 148;
const formatGaelicScore = (s: TeamScore) => `${s.goals}-${s.points}`;
const pct = (n:number,d:number)=> d>0?`${Math.round((n/d)*100)}%`:"0%";
const init = ():TeamBreakdown=>({shots:0,scores:0,wides:0,goals:0,points:0,twoPt:0,short:0,post:0,fortyFive:0,blocked:0,kickWon:0,kickLost:0,kickClean:0,kickBreak:0,kickFoulWon:0,kickFoulConceded:0,kickDead:0,toWon:0,toLost:0,toForced:0,toUnforced:0,toTackle:0,toPress:0,toSwarm:0,toIntercept:0,toSlackKP:0,toSlackHP:0,toOvercarried:0,toStripped:0,freesFor:0,freesAgainst:0,freeScored:0,freeMissed:0,yellow:0,black:0,red:0});
const has=(tags:readonly string[]|undefined,t:string)=>!!tags?.includes(t);

function getTeam(event: LoggedEventLike): TeamSide | null {
  if (event.teamSide === "FOR" || event.teamSide === "own") return "HOME";
  if (event.teamSide === "OPP" || event.teamSide === "opposition") return "AWAY";
  if (event.team === "HOME" || String(event.id||"").startsWith("team-home-")) return "HOME";
  if (event.team === "AWAY" || String(event.id||"").startsWith("team-away-")) return "AWAY";
  return null;
}

function buildBreakdown(events: readonly LoggedEventLike[]): Record<TeamSide, TeamBreakdown> {
  const r={HOME:init(),AWAY:init()} as Record<TeamSide,TeamBreakdown>;
  let hasOppKickoutEvents = false;
  let hasOppTurnoverEvents = false;
  let hasOppFreeEvents = false;
  for (const e of events) {
    const t = getTeam(e);
    if (t !== "AWAY") continue;
    const k = e.kind;
    if (k === "KICKOUT_WON" || k === "KICKOUT_CONCEDED") hasOppKickoutEvents = true;
    if (k === "TURNOVER_WON" || k === "TURNOVER_LOST") hasOppTurnoverEvents = true;
    if (
      k === "FREE_WON" ||
      k === "FREE_FOR" ||
      k === "FREE_CONCEDED" ||
      k === "FREE_AGAINST" ||
      k === "FREE_SCORED" ||
      k === "FREE_MISSED"
    ) {
      hasOppFreeEvents = true;
    }
  }
  for (const e of events){
    const t=getTeam(e); if(!t) continue; const b=r[t]; const k=e.kind; const tags=e.tags;
    if (k==="SHOT") { b.shots++; if(has(tags,"SHORT")) b.short++; if(has(tags,"POST")) b.post++; if(has(tags,"FORTY_FIVE")) b.fortyFive++; if(has(tags,"BLOCKED")) b.blocked++; }
    if (k==="WIDE") { b.wides++; b.shots++; }
    if (k==="GOAL") { b.goals++; b.scores++; b.shots++; }
    if (k==="POINT") { b.points++; b.scores++; b.shots++; }
    if (k==="TWO_POINTER"||k==="FORTY_FIVE_TWO_POINT") { b.twoPt++; b.scores++; b.shots++; }
    if (isFreeScore(e)) b.freeScored++;
    if (isFreeMiss(e))  b.freeMissed++;
    if (k==="FREE_WON" || k==="FREE_FOR") b.freesFor++;
    if (k==="FREE_CONCEDED" || k==="FREE_AGAINST") b.freesAgainst++;
    if (k==="KICKOUT_WON") { b.kickWon++; if(has(tags,"CLEAN")) b.kickClean++; if(has(tags,"BREAK")) b.kickBreak++; if(has(tags,"FOUL_WON")) b.kickFoulWon++; }
    if (k==="KICKOUT_CONCEDED") { b.kickLost++; if(has(tags,"CLEAN")) b.kickClean++; if(has(tags,"BREAK")) b.kickBreak++; if(has(tags,"FOUL_CONCEDED")) b.kickFoulConceded++; if(has(tags,"KICKED_DEAD")) b.kickDead++; }
    if (k==="TURNOVER_WON") { b.toWon++; if(has(tags,"FORCED")) b.toForced++; if(has(tags,"UNFORCED")) b.toUnforced++; if(has(tags,"TACKLE")) b.toTackle++; if(has(tags,"PRESS")) b.toPress++; if(has(tags,"SWARM")) b.toSwarm++; if(has(tags,"INTERCEPT")) b.toIntercept++; }
    if (k==="TURNOVER_LOST") { b.toLost++; if(has(tags,"FORCED")) b.toForced++; if(has(tags,"UNFORCED")) b.toUnforced++; if(has(tags,"SLACK_KICK_PASS")) b.toSlackKP++; if(has(tags,"SLACK_HAND_PASS")) b.toSlackHP++; if(has(tags,"OVERCARRIED")) b.toOvercarried++; if(has(tags,"STRIPPED")) b.toStripped++; }
    if (k==="YELLOW_CARD") b.yellow++;
    if (k==="BLACK_CARD") b.black++;
    if (k==="RED_CARD") b.red++;

    if (t === "HOME") {
      // Legacy logging often captures opposition outcomes as FOR negative events.
      if (!hasOppKickoutEvents && k === "KICKOUT_CONCEDED") r.AWAY.kickWon++;
      if (!hasOppKickoutEvents && k === "KICKOUT_WON") r.AWAY.kickLost++;
      if (!hasOppTurnoverEvents && k === "TURNOVER_LOST") r.AWAY.toWon++;
      if (!hasOppTurnoverEvents && k === "TURNOVER_WON") r.AWAY.toLost++;
      if (!hasOppFreeEvents && k === "FREE_CONCEDED") r.AWAY.freesFor++;
      if (!hasOppFreeEvents && k === "FREE_WON") r.AWAY.freesAgainst++;
    } else if (t === "AWAY") {
      // Apply the same legacy mirroring in reverse when HOME opposition rows are missing.
      if (!hasOppKickoutEvents && k === "KICKOUT_CONCEDED") r.HOME.kickWon++;
      if (!hasOppKickoutEvents && k === "KICKOUT_WON") r.HOME.kickLost++;
      if (!hasOppTurnoverEvents && k === "TURNOVER_LOST") r.HOME.toWon++;
      if (!hasOppTurnoverEvents && k === "TURNOVER_WON") r.HOME.toLost++;
      if (!hasOppFreeEvents && k === "FREE_CONCEDED") r.HOME.freesFor++;
      if (!hasOppFreeEvents && k === "FREE_WON") r.HOME.freesAgainst++;
    }
  }
  return r;
}

function estimateContentBottomY(hasDiscipline: boolean): number {
  let y = 454;
  y += 34 + (42 * 7) + 56;
  y += 34 + (42 * 3) + (56 * 2);
  y += 34 + (42 * 7) + 56;
  y += 34 + (42 * 3) + 56;
  if (hasDiscipline) y += 34 + 48;
  return y;
}

function drawHeader(ctx:CanvasRenderingContext2D,input:StatsShareCardInput,cardHeight:number){
  const g=ctx.createLinearGradient(0,0,CARD_WIDTH,cardHeight); g.addColorStop(0,"#0b1020"); g.addColorStop(1,"#101a37");
  ctx.fillStyle=g; ctx.fillRect(0,0,CARD_WIDTH,cardHeight); ctx.fillStyle="#22c55e"; ctx.fillRect(0,0,CARD_WIDTH,16);
  ctx.fillStyle="#e5e7eb"; ctx.font="600 34px Inter,system-ui,sans-serif"; ctx.fillText(input.stageLabel,72,84);
  ctx.fillStyle="#f9fafb"; ctx.font="700 50px Inter,system-ui,sans-serif"; ctx.fillText(`${input.homeTeamName} v ${input.awayTeamName}`,72,152);
  ctx.fillStyle="#9ca3af"; ctx.font="500 28px Inter,system-ui,sans-serif"; ctx.fillText(`${input.venueLabel} · ${input.clockLabel}`,72,196);
}

function drawScore(ctx:CanvasRenderingContext2D,input:StatsShareCardInput){
  ctx.fillStyle="#111827"; ctx.fillRect(56,224,CARD_WIDTH-112,150); ctx.strokeStyle="#374151"; ctx.lineWidth=2; ctx.strokeRect(56,224,CARD_WIDTH-112,150);
  ctx.fillStyle="#f9fafb"; ctx.font="700 58px Inter,system-ui,sans-serif"; ctx.fillText(formatGaelicScore(input.homeScore),80,306); ctx.textAlign="right"; ctx.fillText(formatGaelicScore(input.awayScore),CARD_WIDTH-80,306); ctx.textAlign="left";
  ctx.fillStyle="#9ca3af"; ctx.font="600 28px Inter,system-ui,sans-serif"; ctx.fillText(`${input.homeTeamName} (${input.homeScore.total})`,80,348); ctx.textAlign="right"; ctx.fillText(`${input.awayTeamName} (${input.awayScore.total})`,CARD_WIDTH-80,348); ctx.textAlign="left";
}

function row(ctx:CanvasRenderingContext2D,y:number,label:string,left:string,right:string){
  ctx.fillStyle="#9ca3af"; ctx.font="600 24px Inter,system-ui,sans-serif"; ctx.fillText(label,72,y);
  ctx.fillStyle="#f9fafb"; ctx.font="700 28px Inter,system-ui,sans-serif"; ctx.fillText(left,360,y); ctx.textAlign="right"; ctx.fillText(right,CARD_WIDTH-72,y); ctx.textAlign="left";
}

export async function buildStatsShareCardPng(input: StatsShareCardInput): Promise<File | null> {
  const d = buildBreakdown(input.events);
  const hasDiscipline = d.HOME.yellow+d.HOME.black+d.HOME.red+d.AWAY.yellow+d.AWAY.black+d.AWAY.red>0;
  const estimatedBottomY = estimateContentBottomY(hasDiscipline);
  const cardHeight = Math.max(BASE_CARD_HEIGHT, estimatedBottomY + FOOTER_SAFE_PADDING);
  const footerY = cardHeight - FOOTER_TEXT_OFFSET;

  const c=document.createElement("canvas"); c.width=CARD_WIDTH; c.height=cardHeight; const ctx=c.getContext("2d"); if(!ctx) return null;
  drawHeader(ctx,input,cardHeight); drawScore(ctx,input);
  ctx.fillStyle="#cbd5e1"; ctx.font="700 26px Inter,system-ui,sans-serif"; ctx.fillText(input.homeTeamName,360,412); ctx.textAlign="right"; ctx.fillText(input.awayTeamName,CARD_WIDTH-72,412); ctx.textAlign="left";
  let y=454;
  ctx.fillStyle="#93c5fd"; ctx.font="700 28px Inter,system-ui,sans-serif"; ctx.fillText("Shooting",72,y); y+=34;
  row(ctx,y,"Shots",String(d.HOME.shots),String(d.AWAY.shots)); y+=42;
  row(ctx,y,"Scores",String(d.HOME.scores),String(d.AWAY.scores)); y+=42;
  row(ctx,y,"Goals",String(d.HOME.goals),String(d.AWAY.goals)); y+=42;
  row(ctx,y,"Points",String(d.HOME.points),String(d.AWAY.points)); y+=42;
  row(ctx,y,"2PT",String(d.HOME.twoPt),String(d.AWAY.twoPt)); y+=42;
  row(ctx,y,"Wides",String(d.HOME.wides),String(d.AWAY.wides)); y+=42;
  row(ctx,y,"Conversion",pct(d.HOME.scores,d.HOME.shots),pct(d.AWAY.scores,d.AWAY.shots)); y+=42;
  row(ctx,y,"Short/Post/45/Blk",`${d.HOME.short}/${d.HOME.post}/${d.HOME.fortyFive}/${d.HOME.blocked}`,`${d.AWAY.short}/${d.AWAY.post}/${d.AWAY.fortyFive}/${d.AWAY.blocked}`); y+=56;
  ctx.fillStyle="#93c5fd"; ctx.font="700 28px Inter,system-ui,sans-serif"; ctx.fillText("Kickouts",72,y); y+=34;
  row(ctx,y,"Won / Total",`${d.HOME.kickWon}/${d.HOME.kickWon+d.HOME.kickLost}`,`${d.AWAY.kickWon}/${d.AWAY.kickWon+d.AWAY.kickLost}`); y+=42;
  row(ctx,y,"Win %",pct(d.HOME.kickWon,d.HOME.kickWon+d.HOME.kickLost),pct(d.AWAY.kickWon,d.AWAY.kickWon+d.AWAY.kickLost)); y+=42;
  row(ctx,y,"Clean / Break",`${d.HOME.kickClean}/${d.HOME.kickBreak}`,`${d.AWAY.kickClean}/${d.AWAY.kickBreak}`); y+=56;
  row(ctx,y,"Foul Won / Conceded",`${d.HOME.kickFoulWon}/${d.HOME.kickFoulConceded}`,`${d.AWAY.kickFoulWon}/${d.AWAY.kickFoulConceded}`); y+=42;
  row(ctx,y,"Kicked Dead",`${d.HOME.kickDead}`,`${d.AWAY.kickDead}`); y+=56;
  ctx.fillStyle="#93c5fd"; ctx.font="700 28px Inter,system-ui,sans-serif"; ctx.fillText("Turnovers",72,y); y+=34;
  row(ctx,y,"Won",String(d.HOME.toWon),String(d.AWAY.toWon)); y+=42;
  row(ctx,y,"Lost",String(d.HOME.toLost),String(d.AWAY.toLost)); y+=42;
  row(ctx,y,"Balance",String(d.HOME.toWon-d.HOME.toLost),String(d.AWAY.toWon-d.AWAY.toLost)); y+=42;
  row(ctx,y,"Tackle / Press",`${d.HOME.toTackle}/${d.HOME.toPress}`,`${d.AWAY.toTackle}/${d.AWAY.toPress}`); y+=42;
  row(ctx,y,"Swarm / Intercept",`${d.HOME.toSwarm}/${d.HOME.toIntercept}`,`${d.AWAY.toSwarm}/${d.AWAY.toIntercept}`); y+=42;
  row(ctx,y,"Unforced",`${d.HOME.toUnforced}`,`${d.AWAY.toUnforced}`); y+=42;
  row(ctx,y,"Slack KP / HP",`${d.HOME.toSlackKP}/${d.HOME.toSlackHP}`,`${d.AWAY.toSlackKP}/${d.AWAY.toSlackHP}`); y+=42;
  row(ctx,y,"Overcarried / Stripped",`${d.HOME.toOvercarried}/${d.HOME.toStripped}`,`${d.AWAY.toOvercarried}/${d.AWAY.toStripped}`); y+=56;
  ctx.fillStyle="#93c5fd"; ctx.font="700 28px Inter,system-ui,sans-serif"; ctx.fillText("Frees",72,y); y+=34;
  row(ctx,y,"Frees For",String(d.HOME.freesFor),String(d.AWAY.freesFor)); y+=42;
  row(ctx,y,"Frees Against",String(d.HOME.freesAgainst),String(d.AWAY.freesAgainst)); y+=42;
  row(ctx,y,"Placed Scored",String(d.HOME.freeScored),String(d.AWAY.freeScored)); y+=42;
  row(ctx,y,"Placed Missed",String(d.HOME.freeMissed),String(d.AWAY.freeMissed)); y+=56;
  if (hasDiscipline){
    ctx.fillStyle="#93c5fd"; ctx.font="700 28px Inter,system-ui,sans-serif"; ctx.fillText("Discipline",72,y); y+=34;
    row(ctx,y,"Y / B / R",`${d.HOME.yellow}/${d.HOME.black}/${d.HOME.red}`,`${d.AWAY.yellow}/${d.AWAY.black}/${d.AWAY.red}`); y+=48;
  }
  ctx.strokeStyle = "#374151";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(56, footerY - 38);
  ctx.lineTo(CARD_WIDTH - 56, footerY - 38);
  ctx.stroke();
  ctx.fillStyle="#9ca3af"; ctx.font="600 24px Inter,system-ui,sans-serif"; ctx.fillText(`Logged events: ${input.eventCount}`,72,footerY);
  ctx.fillStyle="#6b7280"; ctx.font="500 24px Inter,system-ui,sans-serif"; ctx.textAlign="right"; ctx.fillText("PáircVision Stats Summary",CARD_WIDTH-72,footerY); ctx.textAlign="left";
  const blob = await new Promise<Blob | null>((resolve)=>c.toBlob((b)=>resolve(b),"image/png")); if(!blob) return null;
  const fileLabel=`${input.homeTeamName}-${input.awayTeamName}-${input.stageLabel}`.toLowerCase().replace(/[^a-z0-9-]+/g,"-").replace(/^-+|-+$/g,"");
  return new File([blob],`${fileLabel||"match"}-summary.png`,{type:"image/png"});
}
