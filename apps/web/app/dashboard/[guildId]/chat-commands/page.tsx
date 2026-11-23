"use client";

import { ChatCommandsEditor } from "../../../../components/streaming/ChatCommandsEditor";

// Streaming › Chat Commands.
export default function ChatCommandsPage({ params }: { params: { guildId: string } }) {
  return <ChatCommandsEditor guildId={params.guildId} />;
}
