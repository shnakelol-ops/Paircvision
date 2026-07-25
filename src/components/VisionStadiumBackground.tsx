import "./visionStadiumBackground.css";

type VisionStadiumBackgroundVariant = "board" | "play" | "stats" | "training";

type VisionStadiumBackgroundProps = {
  variant?: VisionStadiumBackgroundVariant;
  ready?: boolean;
  /**
   * Portrait modifier. When true, the stadium lights are rendered smaller,
   * higher and dimmer so they read as subtle background decoration that never
   * competes with a portrait pitch. Scoped so landscape and other surfaces are
   * unaffected.
   */
  portrait?: boolean;
};

const STADIUM_LIGHT_DOTS = Array.from({ length: 12 }, (_, index) => index);

export default function VisionStadiumBackground({
  variant = "board",
  ready = true,
  portrait = false,
}: VisionStadiumBackgroundProps) {
  return (
    <div
      className={`vision-stadium-shell vision-stadium-shell--${variant}${ready ? " vision-stadium-shell--ready" : ""}${portrait ? " vision-stadium-shell--portrait" : ""}`}
      aria-hidden="true"
    >
      <div className="vision-stadium-shell__base" />
      <div className="vision-stadium-shell__fog" />
      <div className="vision-stadium-shell__top-glow" />
      <div className="vision-stadium-shell__texture" />
      <div className="vision-stadium-shell__lights vision-stadium-shell__lights--left">
        {STADIUM_LIGHT_DOTS.map((dot) => (
          <span key={`vision-stadium-left-${dot}`} />
        ))}
      </div>
      <div className="vision-stadium-shell__lights vision-stadium-shell__lights--right">
        {STADIUM_LIGHT_DOTS.map((dot) => (
          <span key={`vision-stadium-right-${dot}`} />
        ))}
      </div>
      <div className="vision-stadium-shell__vignette" />
    </div>
  );
}
