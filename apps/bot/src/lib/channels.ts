import { Channel, SendableChannels } from "discord.js";

// client.channels.fetch() returns a broad union that includes
// PartialGroupDMChannel, which has no `send` — bot user accounts never
// actually see those, but the type doesn't know that. This narrows it.
export function isSendableChannel(channel: Channel | null): channel is SendableChannels {
  return !!channel && "send" in channel;
}
