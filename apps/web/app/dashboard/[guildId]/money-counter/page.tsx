import { redirect } from "next/navigation";

// Moved to Streaming › Overlays › Money Counter. Old links and bookmarks land there.
export default function OldMoneyPage({ params }: { params: { guildId: string } }) {
  redirect(`/dashboard/${params.guildId}/overlays/money`);
}
