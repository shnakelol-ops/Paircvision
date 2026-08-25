import "./eventStatsAtmosphere.css";
import scoreboardPitchPhoto from "../assets/event-stats/scoreboard-pitch.webp";

export type EventStatsAtmosphereVariant = "landing" | "setup" | "squads" | "saved";

type EventStatsAtmosphereProps = {
  variant: EventStatsAtmosphereVariant;
  portrait?: boolean;
};

// Presentation-only atmospheric layer for Event Stats (landing/setup/squads/
// saved-matches). Deliberately excludes a "live" variant — Live Capture must
// never import this component. Always render as the first child of a
// `position: relative` shell; screen content must sit above it at z-index 1.
export default function EventStatsAtmosphere({ variant, portrait = false }: EventStatsAtmosphereProps) {
  return (
    <div
      className={`es-atmosphere es-atmosphere--${variant}${portrait ? " es-atmosphere--portrait" : ""}`}
      aria-hidden="true"
    >
      <div className="es-atmosphere__photo" style={{ backgroundImage: `url(${scoreboardPitchPhoto})` }} />
      <div className="es-atmosphere__scrim" />
    </div>
  );
}
