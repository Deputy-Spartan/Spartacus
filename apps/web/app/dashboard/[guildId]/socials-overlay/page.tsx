import { redirect } from "next/navigation";

// Moved to Streaming › Overlays › Socials. Old links and bookmarks land there.
export default function OldSocialsPage({ params }: { params: { guildId: string } }) {
  redirect(`/dashboard/${params.guildId}/overlays/socials`);
}
