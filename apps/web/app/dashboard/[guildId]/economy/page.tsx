import { redirect } from "next/navigation";

export default function EconomyRedirectPage({ params }: { params: { guildId: string } }) {
  redirect(`/dashboard/${params.guildId}/economy/settings`);
}
