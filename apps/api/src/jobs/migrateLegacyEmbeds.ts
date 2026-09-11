import { prisma, Prisma } from "@spartacus/db";

// One-time (per row), idempotent migration: Embed Creator's saved-embed
// library is now the ONLY place an embed gets built — every one of the 8
// features below dropped its own embed-editing UI. Any row that already had
// real embed content configured before that change gets that content copied
// into a brand-new EmbedCreatorPreset, and the row's savedEmbedId is pointed
// at it, so nothing anyone already set up silently disappears. Runs once at
// API boot; each row is only ever migrated once (guarded by `savedEmbedId:
// null` in every query), so re-running on every subsequent boot is a no-op.
interface LegacyEmbedFields {
  embedEnabled?: boolean | null;
  embedTitle?: string | null;
  embedDescription?: string | null;
  embedColor?: string | null;
  embedExtra?: unknown;
  buttons?: unknown;
}

function hasRealEmbedContent(row: LegacyEmbedFields): boolean {
  if (row.embedEnabled === false) return false;
  const extra = row.embedExtra as Record<string, unknown> | null | undefined;
  const hasExtra = !!extra && typeof extra === "object" && Object.keys(extra).length > 0;
  return !!(row.embedTitle || row.embedDescription || row.embedColor || hasExtra);
}

function buttonsToComponents(buttons: unknown): Prisma.InputJsonValue {
  const list = Array.isArray(buttons) ? (buttons as Array<{ label?: string; url?: string }>) : [];
  const items = list.filter((b) => b && b.url).map((b) => ({ id: cryptoRandom(), kind: "link", label: b.label || "Link", url: b.url }));
  if (items.length === 0) return [];
  return [{ id: cryptoRandom(), type: "buttons", items }];
}

function cryptoRandom(): string {
  return Math.random().toString(36).slice(2, 11);
}

async function makePreset(guildId: string, namePrefix: string, row: LegacyEmbedFields, description?: string | null) {
  const embed = {
    title: row.embedTitle || undefined,
    description: row.embedDescription || description || undefined,
    color: row.embedColor || "#7B99BC",
    ...(typeof row.embedExtra === "object" && row.embedExtra ? (row.embedExtra as Record<string, unknown>) : {}),
  };

  let name = `${namePrefix} (migrated)`;
  let suffix = 2;
  while (await prisma.embedCreatorPreset.findUnique({ where: { guildId_name: { guildId, name } } })) {
    name = `${namePrefix} (migrated ${suffix})`;
    suffix++;
  }

  const preset = await prisma.embedCreatorPreset.create({
    data: {
      guildId,
      name,
      data: { content: "", embeds: [embed], components: buttonsToComponents(row.buttons) } as unknown as Prisma.InputJsonValue,
    },
  });
  return preset.id;
}

export async function migrateLegacyEmbeds() {
  let migrated = 0;

  const welcomes = await prisma.welcomeConfig.findMany({ where: { savedEmbedId: null } });
  for (const row of welcomes) {
    if (!hasRealEmbedContent(row)) continue;
    const presetId = await makePreset(row.guildId, "Welcome", row, row.welcomeText);
    await prisma.welcomeConfig.update({ where: { id: row.id }, data: { savedEmbedId: presetId } });
    migrated++;
  }

  const commands = await prisma.customCommand.findMany({ where: { savedEmbedId: null } });
  for (const row of commands) {
    if (!hasRealEmbedContent(row)) continue;
    const presetId = await makePreset(row.guildId, `Command !${row.trigger}`, row, row.response);
    await prisma.customCommand.update({ where: { id: row.id }, data: { savedEmbedId: presetId } });
    migrated++;
  }

  const announcements = await prisma.announcement.findMany({ where: { savedEmbedId: null } });
  for (const row of announcements) {
    if (!hasRealEmbedContent(row)) continue;
    const presetId = await makePreset(row.guildId, "Announcement", row, row.content);
    await prisma.announcement.update({ where: { id: row.id }, data: { savedEmbedId: presetId } });
    migrated++;
  }

  const stickies = await prisma.stickyMessage.findMany({ where: { savedEmbedId: null } });
  for (const row of stickies) {
    if (!hasRealEmbedContent(row)) continue;
    const presetId = await makePreset(row.guildId, "Sticky Message", row, row.content);
    await prisma.stickyMessage.update({ where: { id: row.id }, data: { savedEmbedId: presetId } });
    migrated++;
  }

  const birthdays = await prisma.birthdayConfig.findMany({ where: { savedEmbedId: null } });
  for (const row of birthdays) {
    const hasContent = !!(row.embedTitle || row.embedMessage || (row.embedExtra && Object.keys(row.embedExtra as object).length > 0));
    if (!hasContent) continue;
    const presetId = await makePreset(row.guildId, "Birthday", { embedTitle: row.embedTitle, embedDescription: row.embedMessage, embedColor: row.embedColor, embedExtra: row.embedExtra });
    await prisma.birthdayConfig.update({ where: { id: row.id }, data: { savedEmbedId: presetId } });
    migrated++;
  }

  const giveaways = await prisma.giveaway.findMany({ where: { savedEmbedId: null } });
  for (const row of giveaways) {
    const hasContent = !!(row.description || (row.embedExtra && Object.keys(row.embedExtra as object).length > 0));
    if (!hasContent) continue;
    const presetId = await makePreset(row.guildId, `Giveaway: ${row.prize}`, { embedDescription: row.description, embedColor: row.embedColor, embedExtra: row.embedExtra, buttons: row.buttons }, row.description);
    await prisma.giveaway.update({ where: { id: row.id }, data: { savedEmbedId: presetId } });
    migrated++;
  }

  const slashCommands = await prisma.customSlashCommand.findMany({ where: { savedEmbedId: null, actionType: "POST_EMBED" } });
  for (const row of slashCommands) {
    if (!hasRealEmbedContent(row)) continue;
    const presetId = await makePreset(row.guildId, `Slash /${row.name}`, row, row.embedDescription);
    await prisma.customSlashCommand.update({ where: { id: row.id }, data: { savedEmbedId: presetId } });
    migrated++;
  }

  const lfgCommands = await prisma.lfgCommand.findMany({ where: { savedEmbedId: null, mode: "embed" } });
  for (const row of lfgCommands) {
    if (!hasRealEmbedContent(row)) continue;
    const presetId = await makePreset(row.guildId, `LFG !${row.trigger}`, row, row.embedDescription);
    await prisma.lfgCommand.update({ where: { id: row.id }, data: { savedEmbedId: presetId } });
    migrated++;
  }

  if (migrated > 0) {
    console.log(`[migrateLegacyEmbeds] Migrated ${migrated} existing configured embed(s) into the Saved Embeds library.`);
  }
}
