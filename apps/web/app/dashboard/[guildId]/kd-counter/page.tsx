import { redirect } from "next/navigation";

// Moved to Streaming › Overlays › K/D Counter. Old links and bookmarks land there.
export default function OldKdPage({ params }: { params: { guildId: string } }) {
  redirect(`/dashboard/${params.guildId}/overlays/kd`);
}
