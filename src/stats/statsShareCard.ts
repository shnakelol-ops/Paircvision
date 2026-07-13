import { isFreeScore, isFreeMiss } from "./eventSource";
import { adaptEventsToChainable } from "./reporting/eventAdapter";
import { buildMatchReport } from "./reporting/matchReport";
import {
  buildShareCardBreakdown,
  viewShootingConversion,
  viewShootingConversionLabel,
} from "./reporting/teamStatsViews";

type TeamScore = { goals: number; points: number; total: number };
type LoggedEventLike = {
  kind?: string;
  team?: string;
  teamSide?: string;
  id?: string;
  half?: 1 | 2;
  period?: string;
  timestamp?: number;
  matchClockSeconds?: number | null;
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

const CARD_WIDTH = 1080;
const BASE_CARD_HEIGHT = 1640;
const FOOTER_TEXT_OFFSET = 78;
const FOOTER_SAFE_PADDING = 148;
const formatGaelicScore = (s: TeamScore) => `${s.goals}-${s.points}`;

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
  const scope = input.stageLabel === "Half Time" ? "1H" : "FULL";
  const report = buildMatchReport({
    events: adaptEventsToChainable(input.events),
    homeTeam: input.homeTeamName,
    awayTeam: input.awayTeamName,
    scope,
  });
  const d = buildShareCardBreakdown(report);
  const homeConv = viewShootingConversionLabel(viewShootingConversion(report, "FOR"));
  const awayConv = viewShootingConversionLabel(viewShootingConversion(report, "OPP"));

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
  row(ctx,y,"Conversion",homeConv,awayConv); y+=42;
  row(ctx,y,"Short/Post/45/Blk",`${d.HOME.short}/${d.HOME.post}/${d.HOME.fortyFive}/${d.HOME.blocked}`,`${d.AWAY.short}/${d.AWAY.post}/${d.AWAY.fortyFive}/${d.AWAY.blocked}`); y+=56;
  ctx.fillStyle="#93c5fd"; ctx.font="700 28px Inter,system-ui,sans-serif"; ctx.fillText("Kickouts",72,y); y+=34;
  row(ctx,y,"Restart Share Won",String(d.HOME.kickWon),String(d.AWAY.kickWon)); y+=42;
  row(ctx,y,"Restart Share Conceded",String(d.HOME.kickLost),String(d.AWAY.kickLost)); y+=42;
  row(ctx,y,"Restart Share",d.HOME.kickWinPct,d.AWAY.kickWinPct); y+=42;
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
  row(ctx,y,"Placed Attempts",String(d.HOME.freeScored+d.HOME.freeMissed),String(d.AWAY.freeScored+d.AWAY.freeMissed)); y+=42;
  row(ctx,y,"Placed Scores",String(d.HOME.freeScored),String(d.AWAY.freeScored)); y+=42;
  row(ctx,y,"Placed Misses",String(d.HOME.freeMissed),String(d.AWAY.freeMissed)); y+=42;
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
