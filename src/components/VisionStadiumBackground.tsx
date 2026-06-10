import "./visionStadiumBackground.css";

type VisionStadiumBackgroundVariant = "board" | "play" | "stats" | "training";

type VisionStadiumBackgroundProps = {
  variant?: VisionStadiumBackgroundVariant;
  ready?: boolean;
};

const STADIUM_LIGHT_DOTS = Array.from({ length: 12 }, (_, index) => index);

export default function VisionStadiumBackground({ variant = "board", ready = true }: VisionStadiumBackgroundProps) {
  return (
    <div
      className={`vision-stadium-shell vision-stadium-shell--${variant}${ready ? " vision-stadium-shell--ready" : ""}`}
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
