import { FinderzMark } from "@/components/app-shell";
import type { Campaign } from "@/lib/campaign-client";
import type { CreativeFormat } from "@/lib/creative-renderer";

export function CreativePreview({ campaign, format }: { campaign: Campaign; format: CreativeFormat }) {
  const ratio = format === "1:1" ? "1 / 1" : format === "1.91:1" ? "1.91 / 1" : "9 / 16";
  return (
    <div className="creative-shell" style={{ aspectRatio: ratio }}>
      <div
        className={"creative-bg" + (campaign.backgroundImage ? "" : " creative-bg-fallback")}
        style={campaign.backgroundImage ? { backgroundImage: `url(${campaign.backgroundImage})` } : undefined}
      />
      <div className="creative-top-scrim" />
      <div className="creative-content">
        <div className="creative-logo">
          <div className="creative-logo-badge">
            {campaign.logoImage ? <img src={campaign.logoImage} alt="Finderz Keeperz" /> : <FinderzMark />}
          </div>
        </div>
        <h3 className="creative-headline">{campaign.headline}</h3>
        <div className="creative-bottom">
          <div className="creative-title-banner">
            <div className="creative-title-banner-job">{campaign.title}</div>
            <div className="creative-title-banner-location">{campaign.location}</div>
          </div>
          <div className="creative-chip-row">
            {campaign.usps.filter((usp) => usp.trim()).map((usp) => (
              <div className="creative-chip" key={usp}>
                <div className="creative-chip-value">{usp}</div>
              </div>
            ))}
          </div>
          <div className="creative-cta-pill">SOLLICITEER NU</div>
        </div>
      </div>
    </div>
  );
}
