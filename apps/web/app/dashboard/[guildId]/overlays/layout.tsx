import { OverlayTabs } from "../../../../components/streaming/OverlayTabs";

// Streaming › Overlays: Socials, Money Counter and K/D Counter share a tab row.
export default function OverlaysLayout({ children, params }: { children: React.ReactNode; params: { guildId: string } }) {
  return (
    <>
      <OverlayTabs guildId={params.guildId} />
      {children}
    </>
  );
}
