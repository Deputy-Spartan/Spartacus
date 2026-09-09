"use client";

import { useEffect, useState } from "react";
import { NeonCard } from "../../../../components/ui/NeonCard";
import { ModuleHeader } from "../../../../components/ui/ModuleHeader";
import { PanelHeader } from "../../../../components/ui/PanelHeader";
import { ChannelSelect } from "../../../../components/ui/ChannelSelect";
import { RoleSelect } from "../../../../components/ui/RoleSelect";
import { ToggleSwitch } from "../../../../components/ui/ToggleSwitch";
import { EventPreview } from "../../../../components/ui/EventPreview";
import { StickyPreview } from "../../../../components/ui/StickyPreview";
import { ButtonsEditor } from "../../../../components/ui/ButtonsEditor";
import { useConfirm, usePrompt } from "../../../../components/ui/ConfirmDialog";
import {
  api,
  type EventInput,
  type EventRow,
  type EventSettingsRow,
  type EventTemplateInput,
  type EventTemplateRow,
  type SavedEmbedInput,
  type SavedEmbedRow,
  type RsvpRole,
} from "../../../../lib/api";

type View = "root" | "create" | "embed" | "calendar" | "current" | "past" | "scheduled" | "attendance" | "templates" | "settings";

const ROLE_ICONS: Record<string, string> = {
  TANK: "🛡️",
  DPS: "⚔️",
  HEALER: "✨",
  ATTENDING: "✅",
  ABSENT: "❌",
  TENTATIVE: "❔",
};

const MENU: Array<{ view: View; label: string; icon: string; color: string }> = [
  { view: "create", label: "Create Event", icon: "📋", color: "#818cf8" },
  { view: "embed", label: "Create Embed", icon: "🧩", color: "#f472b6" },
  { view: "calendar", label: "Calendar", icon: "📅", color: "#fbbf24" },
  { view: "current", label: "Current Events", icon: "✅", color: "#34d399" },
  { view: "past", label: "Past Events", icon: "🗓️", color: "#f87171" },
  { view: "scheduled", label: "Scheduled Events", icon: "⏱️", color: "#2dd4bf" },
  { view: "attendance", label: "Attendance", icon: "▦", color: "#a78bfa" },
  { view: "templates", label: "Custom Templates", icon: "📄", color: "#c084fc" },
  { view: "settings", label: "Server Settings", icon: "⚙️", color: "#94a3b8" },
];

const ALL_ROLES: RsvpRole[] = ["TANK", "DPS", "HEALER", "ATTENDING", "ABSENT"];

const EMPTY_EVENT: EventInput = {
  title: "",
  description: "",
  channelId: "",
  startTime: "",
  reminderMinutesBefore: 15,
  embedEnabled: true,
  embedColor: "#00E5FF",
  buttons: [],
  enabledRoles: [...ALL_ROLES],
};

export default function EventsPage({ params }: { params: { guildId: string } }) {
  const confirm = useConfirm();
  const [view, setView] = useState<View>("root");
  const [events, setEvents] = useState<EventRow[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<EventInput>(EMPTY_EVENT);
  const [saving, setSaving] = useState(false);
  const [templates, setTemplates] = useState<EventTemplateRow[]>([]);
  const [embedToLoad, setEmbedToLoad] = useState<SavedEmbedRow | undefined>(undefined);

  function refreshEvents() {
    api.getEvents(params.guildId).then(setEvents);
  }
  useEffect(refreshEvents, [params.guildId]);
  useEffect(() => {
    api.getEventTemplates(params.guildId).then(setTemplates);
  }, [params.guildId]);

  function goCreate() {
    setEditingId(null);
    setForm(EMPTY_EVENT);
    setView("create");
  }

  function goEdit(event: EventRow) {
    setEditingId(event.id);
    setForm({
      title: event.title,
      description: event.description ?? "",
      channelId: event.channelId,
      startTime: event.startTime.slice(0, 16),
      reminderMinutesBefore: event.reminderMinutesBefore,
      embedEnabled: event.embedEnabled,
      embedColor: event.embedColor ?? "#00E5FF",
      buttons: event.buttons,
      enabledRoles: event.enabledRoles,
    });
    setView("create");
  }

  async function saveEvent() {
    if (!form.title || !form.channelId || !form.startTime) return;
    setSaving(true);
    if (editingId) {
      await api.updateEvent(params.guildId, editingId, form);
    } else {
      await api.createEvent(params.guildId, form);
    }
    setSaving(false);
    setView("root");
    refreshEvents();
  }

  async function removeEvent(id: string) {
    if (!(await confirm("Delete this event? RSVPs will be lost."))) return;
    await api.deleteEvent(params.guildId, id);
    refreshEvents();
  }

  function applyTemplate(t: EventTemplateRow) {
    setForm((prev) => ({
      ...prev,
      title: t.title,
      description: t.description ?? "",
      reminderMinutesBefore: t.reminderMinutesBefore,
      embedEnabled: t.embedEnabled,
      embedColor: t.embedColor ?? "#00E5FF",
      buttons: t.buttons,
      enabledRoles: t.enabledRoles,
    }));
  }

  const now = Date.now();
  const current = events.filter((e) => new Date(e.startTime).getTime() >= now);
  const past = events.filter((e) => new Date(e.startTime).getTime() < now);

  return (
    <div>
      <ModuleHeader
        guildId={params.guildId}
        moduleKey="EVENTS"
        title="Event Scheduler"
        description="Create a raid, stream, or meeting — signups sync live in Discord."
      />

      {view === "root" && (
        <NeonCard>
          <div className="divide-y divide-white/5">
            {MENU.map((item) => (
              <button
                key={item.view}
                onClick={() => setView(item.view)}
                className="w-full flex items-center gap-3 py-3 px-1 text-left hover:bg-base-800/40 transition-colors first:pt-1 last:pb-1"
                style={{ borderLeft: `3px solid ${item.color}` }}
              >
                <span className="pl-3 text-lg w-6 text-center" style={{ color: item.color }}>
                  {item.icon}
                </span>
                <span className="text-sm text-slate-200 font-medium">{item.label}</span>
              </button>
            ))}
          </div>
        </NeonCard>
      )}

      {view === "create" && (
        <div>
          <PanelHeader title={editingId ? "Edit Event" : "Create Event"} onBack={() => setView("root")} />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
            <NeonCard>
              {!editingId && templates.length > 0 && (
                <div className="mb-4">
                  <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Load Template</label>
                  <select
                    className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm"
                    defaultValue=""
                    onChange={(e) => {
                      const t = templates.find((t) => t.id === e.target.value);
                      if (t) applyTemplate(t);
                    }}
                  >
                    <option value="">Select a template…</option>
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Title</label>
              <input
                className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm mb-4"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />

              <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Description</label>
              <textarea
                className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm mb-4 min-h-16"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />

              <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Channel</label>
              <ChannelSelect
                guildId={params.guildId}
                value={form.channelId || null}
                onChange={(channelId) => setForm({ ...form, channelId })}
                placeholder="Select a channel…"
              />

              <div className="grid grid-cols-2 gap-3 mb-4">
                <div>
                  <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Start Time</label>
                  <input
                    type="datetime-local"
                    className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm"
                    value={form.startTime}
                    onChange={(e) => setForm({ ...form, startTime: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Reminder (min before)</label>
                  <input
                    type="number"
                    className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm"
                    value={form.reminderMinutesBefore}
                    onChange={(e) => setForm({ ...form, reminderMinutesBefore: Number(e.target.value) })}
                  />
                </div>
              </div>

              <div className="mb-4 pb-4 border-b border-white/5">
                <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">RSVP Buttons</label>
                <p className="text-xs text-slate-600 mb-2">
                  Toggle which RSVP buttons appear on the event — a disabled role also drops its stat field from the embed.
                </p>
                <div className="flex flex-wrap gap-2">
                  {ALL_ROLES.map((role) => {
                    const enabled = form.enabledRoles.includes(role);
                    return (
                      <button
                        key={role}
                        type="button"
                        onClick={() =>
                          setForm({
                            ...form,
                            enabledRoles: enabled ? form.enabledRoles.filter((r) => r !== role) : [...form.enabledRoles, role],
                          })
                        }
                        className={[
                          "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs border transition-colors",
                          enabled
                            ? "bg-base-800 text-neon-blue font-medium border-neon-blue/40 shadow-glow-blue"
                            : "bg-base-800 text-slate-500 border-white/10 hover:text-slate-300",
                        ].join(" ")}
                      >
                        {ROLE_ICONS[role]} {role.charAt(0) + role.slice(1).toLowerCase()}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-between mb-4 pb-4 border-b border-white/5">
                <div>
                  <p className="text-sm text-slate-300">Use an embed</p>
                  <p className="text-xs text-slate-500">Only affects the info card look — RSVP buttons above post either way.</p>
                </div>
                <ToggleSwitch enabled={form.embedEnabled} onChange={(v) => setForm({ ...form, embedEnabled: v })} />
              </div>

              {form.embedEnabled && (
                <div className="mb-4">
                  <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Embed Color</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      className="h-9 w-12 rounded-lg border border-white/10 bg-base-950 cursor-pointer"
                      value={form.embedColor}
                      onChange={(e) => setForm({ ...form, embedColor: e.target.value })}
                    />
                    <input
                      className="flex-1 bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm font-mono"
                      value={form.embedColor}
                      onChange={(e) => setForm({ ...form, embedColor: e.target.value })}
                    />
                  </div>
                </div>
              )}

              <div className="mb-4">
                <ButtonsEditor guildId={params.guildId} buttons={form.buttons} onChange={(next) => setForm({ ...form, buttons: next })} />
              </div>

              <button onClick={saveEvent} disabled={saving} className="neon-button">
                {saving ? "Saving…" : editingId ? "Save Changes" : "Create Event"}
              </button>
            </NeonCard>

            <NeonCard>
              <p className="text-xs uppercase tracking-wide text-slate-500 mb-3">Preview</p>
              <EventPreview
                title={form.title}
                description={form.description}
                startTime={form.startTime}
                embedEnabled={form.embedEnabled}
                embedColor={form.embedColor}
                buttons={form.buttons}
                enabledRoles={form.enabledRoles}
              />
            </NeonCard>
          </div>
        </div>
      )}

      {view === "embed" && (
        <CreateEmbedView
          key={embedToLoad?.id ?? "new"}
          guildId={params.guildId}
          initial={embedToLoad}
          onBack={() => {
            setEmbedToLoad(undefined);
            setView("root");
          }}
        />
      )}

      {view === "calendar" && <CalendarView events={events} onBack={() => setView("root")} onSelect={goEdit} />}

      {(view === "current" || view === "scheduled") && (
        <div>
          <PanelHeader title={view === "current" ? "Current Events" : "Scheduled Events"} onBack={() => setView("root")} />
          <NeonCard>
            <div className="flex justify-end mb-3">
              <button onClick={goCreate} className="neon-button-sm">
                + New Event
              </button>
            </div>
            <EventList
              events={view === "scheduled" ? current.filter((e) => e.status === "SCHEDULED") : current}
              onEdit={goEdit}
              onDelete={removeEvent}
              empty="no events found"
            />
          </NeonCard>
        </div>
      )}

      {view === "past" && (
        <div>
          <PanelHeader title="Past Events" onBack={() => setView("root")} />
          <NeonCard>
            <EventList events={past} onEdit={goEdit} onDelete={removeEvent} empty="no events found" dim />
          </NeonCard>
        </div>
      )}

      {view === "attendance" && <AttendanceView events={events} onBack={() => setView("root")} />}

      {view === "templates" && (
        <TemplatesView
          guildId={params.guildId}
          templates={templates}
          onRefresh={() => api.getEventTemplates(params.guildId).then(setTemplates)}
          onBack={() => setView("root")}
          onUseTemplate={(t) => {
            setEditingId(null);
            setForm({ ...EMPTY_EVENT });
            applyTemplate(t);
            setView("create");
          }}
          onUseSavedEmbed={(e) => {
            setEmbedToLoad(e);
            setView("embed");
          }}
        />
      )}

      {view === "settings" && <SettingsView guildId={params.guildId} onBack={() => setView("root")} />}
    </div>
  );
}

function EventList({
  events,
  onEdit,
  onDelete,
  empty,
  dim,
}: {
  events: EventRow[];
  onEdit: (e: EventRow) => void;
  onDelete: (id: string) => void;
  empty: string;
  dim?: boolean;
}) {
  if (events.length === 0) return <p className="text-sm text-slate-500 py-4 text-center">{empty}</p>;
  return (
    <div className={`space-y-3 ${dim ? "opacity-60" : ""}`}>
      {events.map((event) => {
        const counts = event.signups.reduce<Record<string, number>>((acc, s) => {
          acc[s.role] = (acc[s.role] ?? 0) + 1;
          return acc;
        }, {});
        return (
          <div key={event.id} className="rounded-lg p-3 bg-base-950 border-l-2 border-neon-blue">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">⚔️ {event.title}</p>
                <p className="text-xs text-slate-500 mt-1">{new Date(event.startTime).toLocaleString()}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={() => onEdit(event)} className="text-slate-500 hover:text-neon-blue text-xs">
                  Edit
                </button>
                <button onClick={() => onDelete(event.id)} className="text-slate-500 hover:text-rose-400 text-xs">
                  Remove
                </button>
              </div>
            </div>
            <div className="flex gap-3 mt-2 text-xs text-slate-400">
              {Object.entries(counts).map(([role, count]) => (
                <span key={role}>
                  {ROLE_ICONS[role] ?? ""} {count}
                </span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CalendarView({ events, onBack, onSelect }: { events: EventRow[]; onBack: () => void; onSelect: (e: EventRow) => void }) {
  const [cursor, setCursor] = useState(() => new Date());
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstDay = new Date(year, month, 1);
  const startWeekday = firstDay.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: Array<number | null> = [...Array(startWeekday).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7 !== 0) cells.push(null);

  const eventsByDay = new Map<number, EventRow[]>();
  for (const e of events) {
    const d = new Date(e.startTime);
    if (d.getFullYear() === year && d.getMonth() === month) {
      const list = eventsByDay.get(d.getDate()) ?? [];
      list.push(e);
      eventsByDay.set(d.getDate(), list);
    }
  }

  const today = new Date();
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;

  return (
    <div>
      <PanelHeader
        title={`${cursor.toLocaleString(undefined, { month: "long" })} ${year}`}
        onBack={onBack}
      />
      <NeonCard>
        <div className="flex justify-between items-center mb-4">
          <button
            onClick={() => setCursor(new Date(year, month - 1, 1))}
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-white/10 bg-base-950 text-slate-400 hover:text-neon-blue hover:border-neon-blue/40 transition-colors"
          >
            ←
          </button>
          <button
            onClick={() => setCursor(new Date())}
            className="text-xs text-slate-500 hover:text-neon-blue uppercase tracking-wide"
          >
            Today
          </button>
          <button
            onClick={() => setCursor(new Date(year, month + 1, 1))}
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-white/10 bg-base-950 text-slate-400 hover:text-neon-blue hover:border-neon-blue/40 transition-colors"
          >
            →
          </button>
        </div>
        <div className="grid grid-cols-7 gap-1.5 text-center text-[10px] uppercase tracking-wide text-slate-500 mb-2">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d}>{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {cells.map((day, i) => {
            const isToday = isCurrentMonth && day === today.getDate();
            const hasEvents = day !== null && (eventsByDay.get(day)?.length ?? 0) > 0;
            return (
              <div
                key={i}
                className={[
                  "min-h-16 rounded-lg p-1.5 transition-colors",
                  day === null ? "bg-transparent" : "bg-base-950 border",
                  isToday ? "border-neon-blue shadow-glow-blue" : hasEvents ? "border-neon-blue/30" : "border-white/5",
                ].join(" ")}
              >
                {day && (
                  <>
                    <p className={`text-[10px] ${isToday ? "text-neon-blue font-bold" : "text-slate-500"}`}>{day}</p>
                    {(eventsByDay.get(day) ?? []).map((e) => (
                      <button
                        key={e.id}
                        onClick={() => onSelect(e)}
                        className="block w-full text-left text-[10px] bg-neon-gradient text-base-950 font-medium rounded px-1.5 py-0.5 mt-1 truncate shadow-glow-blue hover:shadow-glow-blue-lg transition-shadow"
                      >
                        {e.title}
                      </button>
                    ))}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </NeonCard>
    </div>
  );
}

function AttendanceView({ events, onBack }: { events: EventRow[]; onBack: () => void }) {
  const past = [...events]
    .filter((e) => new Date(e.startTime).getTime() < Date.now())
    .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
    .slice(0, 20);

  const userIds = Array.from(new Set(past.flatMap((e) => e.signups.map((s) => s.userId))));

  return (
    <div>
      <PanelHeader title="Attendance" onBack={onBack} />
      <NeonCard>
        {past.length === 0 || userIds.length === 0 ? (
          <p className="text-sm text-slate-500 py-4 text-center">No attendance data yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="text-xs w-full">
              <thead>
                <tr>
                  <th className="text-left text-slate-500 font-medium p-2 sticky left-0 bg-base-900">Member</th>
                  {past.map((e) => (
                    <th key={e.id} className="text-slate-500 font-medium p-2 whitespace-nowrap">
                      {e.title}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {userIds.map((userId) => (
                  <tr key={userId} className="border-t border-white/5">
                    <td className="p-2 sticky left-0 bg-base-900 text-slate-300">{`<@${userId}>`}</td>
                    {past.map((e) => {
                      const signup = e.signups.find((s) => s.userId === userId);
                      return (
                        <td key={e.id} className="p-2 text-center">
                          {signup ? ROLE_ICONS[signup.role] ?? signup.role : "—"}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </NeonCard>
    </div>
  );
}

const EMPTY_TEMPLATE: EventTemplateInput = {
  name: "",
  title: "",
  description: "",
  reminderMinutesBefore: 15,
  embedEnabled: true,
  embedColor: "#00E5FF",
  buttons: [],
  enabledRoles: [...ALL_ROLES],
};

function TemplatesView({
  guildId,
  templates,
  onRefresh,
  onBack,
  onUseTemplate,
  onUseSavedEmbed,
}: {
  guildId: string;
  templates: EventTemplateRow[];
  onRefresh: () => void;
  onBack: () => void;
  onUseTemplate: (t: EventTemplateRow) => void;
  onUseSavedEmbed: (e: SavedEmbedRow) => void;
}) {
  const confirm = useConfirm();
  const [form, setForm] = useState<EventTemplateInput>(EMPTY_TEMPLATE);
  const [editing, setEditing] = useState(false);
  const [savedEmbeds, setSavedEmbeds] = useState<SavedEmbedRow[]>([]);

  useEffect(() => {
    api.getSavedEmbeds(guildId).then(setSavedEmbeds);
  }, [guildId]);

  async function save() {
    if (!form.name || !form.title) return;
    await api.saveEventTemplate(guildId, form);
    setForm(EMPTY_TEMPLATE);
    setEditing(false);
    onRefresh();
  }

  async function remove(id: string) {
    if (!(await confirm("Delete this event template?"))) return;
    await api.deleteEventTemplate(guildId, id);
    onRefresh();
  }

  async function removeEmbed(id: string) {
    if (!(await confirm("Delete this saved embed?"))) return;
    await api.deleteSavedEmbed(guildId, id);
    setSavedEmbeds((prev) => prev.filter((e) => e.id !== id));
  }

  return (
    <div>
      <PanelHeader title="Custom Templates" onBack={onBack} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        <div className="space-y-4">
          <NeonCard>
            <div className="flex items-center justify-between mb-3">
              <p className="font-medium">Event Templates</p>
              <button onClick={() => setEditing(true)} className="neon-button-sm">
                + New Template
              </button>
            </div>
            {templates.length === 0 && <p className="text-sm text-slate-500">No templates yet.</p>}
            <div className="divide-y divide-white/5">
              {templates.map((t) => (
                <div key={t.id} className="flex items-center justify-between py-2.5 text-sm">
                  <button onClick={() => onUseTemplate(t)} className="text-slate-300 hover:text-neon-blue text-left">
                    {t.name}
                  </button>
                  <button onClick={() => remove(t.id)} className="text-slate-500 hover:text-rose-400 text-xs">
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </NeonCard>

          <NeonCard>
            <p className="font-medium mb-3">Saved Embeds</p>
            {savedEmbeds.length === 0 && (
              <p className="text-sm text-slate-500">
                No saved embeds yet — save one from the Create Embed tab.
              </p>
            )}
            <div className="divide-y divide-white/5">
              {savedEmbeds.map((e) => (
                <div key={e.id} className="flex items-center justify-between py-2.5 text-sm">
                  <button onClick={() => onUseSavedEmbed(e)} className="text-slate-300 hover:text-neon-blue text-left">
                    {e.name}
                  </button>
                  <button onClick={() => removeEmbed(e.id)} className="text-slate-500 hover:text-rose-400 text-xs">
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </NeonCard>
        </div>

        {editing && (
          <NeonCard>
            <p className="font-medium mb-3">New Template</p>
            <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Template Name</label>
            <input
              className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm mb-4"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Event Title</label>
            <input
              className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm mb-4"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
            <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Description</label>
            <textarea
              className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm mb-4 min-h-16"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
            <button onClick={save} className="neon-button">
              Save Template
            </button>
          </NeonCard>
        )}
      </div>
    </div>
  );
}

function SettingsView({ guildId, onBack }: { guildId: string; onBack: () => void }) {
  const [settings, setSettings] = useState<EventSettingsRow | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    api.getEventSettings(guildId).then(setSettings);
  }, [guildId]);

  async function persist(next: EventSettingsRow) {
    setSettings(next);
    await api.setEventSettings(guildId, next);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1200);
  }

  if (!settings) return <p className="text-slate-400">Loading…</p>;

  return (
    <div>
      <PanelHeader title="Server Settings" onBack={onBack} />
      <NeonCard>
        <div className="flex items-center justify-between mb-4">
          <p className="font-medium">Event Defaults</p>
          {savedFlash && <span className="text-xs text-emerald-400">Saved ✓</span>}
        </div>

        <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Default Channel</label>
        <ChannelSelect
          guildId={guildId}
          value={settings.defaultChannelId}
          onChange={(channelId) => persist({ ...settings, defaultChannelId: channelId })}
          placeholder="No default — always choose manually"
        />

        <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Default Reminder (min before)</label>
        <input
          type="number"
          className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm mb-4"
          value={settings.defaultReminder}
          onChange={(e) => persist({ ...settings, defaultReminder: Number(e.target.value) })}
        />

        <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Reminder Mention Role</label>
        <RoleSelect
          guildId={guildId}
          value={settings.mentionRoleId}
          onChange={(roleId) => persist({ ...settings, mentionRoleId: roleId })}
          placeholder="No role mention — only attendees are pinged"
        />
      </NeonCard>
    </div>
  );
}

function CreateEmbedView({
  guildId,
  onBack,
  initial,
}: {
  guildId: string;
  onBack: () => void;
  initial?: SavedEmbedRow;
}) {
  const prompt = usePrompt();
  const [channelId, setChannelId] = useState<string | null>(null);
  const [content, setContent] = useState(initial?.content ?? "");
  const [embedEnabled, setEmbedEnabled] = useState(initial?.embedEnabled ?? true);
  const [embedTitle, setEmbedTitle] = useState(initial?.embedTitle ?? "");
  const [embedDescription, setEmbedDescription] = useState(initial?.embedDescription ?? "");
  const [embedColor, setEmbedColor] = useState(initial?.embedColor ?? "#00E5FF");
  const [buttons, setButtons] = useState<Array<{ label: string; url: string }>>(initial?.buttons ?? []);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedEmbeds, setSavedEmbeds] = useState<SavedEmbedRow[]>([]);

  useEffect(() => {
    api.getSavedEmbeds(guildId).then(setSavedEmbeds);
  }, [guildId]);

  function applySaved(e: SavedEmbedRow) {
    setContent(e.content ?? "");
    setEmbedEnabled(e.embedEnabled);
    setEmbedTitle(e.embedTitle ?? "");
    setEmbedDescription(e.embedDescription ?? "");
    setEmbedColor(e.embedColor ?? "#00E5FF");
    setButtons(e.buttons);
  }

  async function saveAsPreset() {
    const name = await prompt("Name this embed to save it for reuse:");
    if (!name) return;
    const input: SavedEmbedInput = { name, content, embedEnabled, embedTitle, embedDescription, embedColor, buttons };
    const saved = await api.saveSavedEmbed(guildId, input);
    setSavedEmbeds((prev) => [...prev.filter((e) => e.name !== saved.name), saved].sort((a, b) => a.name.localeCompare(b.name)));
  }

  async function send() {
    if (!channelId) return;
    setSending(true);
    setError(null);
    try {
      await api.sendMessage(guildId, { channelId, content, embedEnabled, embedTitle, embedDescription, embedColor, buttons });
      setSent(true);
      setTimeout(() => setSent(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send");
    }
    setSending(false);
  }

  return (
    <div>
      <PanelHeader title="Create Embed" onBack={onBack} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        <NeonCard>
          {savedEmbeds.length > 0 && (
            <div className="mb-4">
              <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Load Saved Embed</label>
              <select
                className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm"
                defaultValue=""
                onChange={(e) => {
                  const found = savedEmbeds.find((s) => s.id === e.target.value);
                  if (found) applySaved(found);
                }}
              >
                <option value="">Select a saved embed…</option>
                {savedEmbeds.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Channel</label>
          <ChannelSelect guildId={guildId} value={channelId} onChange={setChannelId} placeholder="Select a channel…" />

          <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">
            {embedEnabled ? "Fallback / Embed Description" : "Message"}
          </label>
          <textarea
            className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm mb-4 min-h-20"
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />

          <div className="flex items-center justify-between mb-4 pb-4 border-b border-white/5">
            <span className="text-sm text-slate-300">Use an embed</span>
            <ToggleSwitch enabled={embedEnabled} onChange={setEmbedEnabled} />
          </div>

          {embedEnabled && (
            <div className="mb-4 space-y-3">
              <div>
                <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Embed Title</label>
                <input
                  className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm"
                  value={embedTitle}
                  onChange={(e) => setEmbedTitle(e.target.value)}
                  placeholder="Optional"
                />
              </div>
              <div>
                <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Embed Description</label>
                <textarea
                  className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm min-h-16"
                  value={embedDescription}
                  onChange={(e) => setEmbedDescription(e.target.value)}
                  placeholder="Defaults to the message above if left blank"
                />
              </div>
              <div>
                <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Embed Color</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    className="h-9 w-12 rounded-lg border border-white/10 bg-base-950 cursor-pointer"
                    value={embedColor}
                    onChange={(e) => setEmbedColor(e.target.value)}
                  />
                  <input
                    className="flex-1 bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm font-mono"
                    value={embedColor}
                    onChange={(e) => setEmbedColor(e.target.value)}
                  />
                </div>
              </div>
            </div>
          )}

          <div className="mb-4">
            <ButtonsEditor guildId={guildId} buttons={buttons} onChange={setButtons} />
          </div>

          {error && <p className="text-xs text-rose-400 mb-3">{error}</p>}
          <div className="flex items-center gap-3">
            <button onClick={send} disabled={sending || !channelId} className="neon-button disabled:opacity-50">
              {sending ? "Sending…" : sent ? "Sent ✓" : "Post Now"}
            </button>
            <button onClick={saveAsPreset} className="text-xs text-neon-blue hover:text-neon-purple">
              Save as preset
            </button>
          </div>
        </NeonCard>

        <NeonCard>
          <p className="text-xs uppercase tracking-wide text-slate-500 mb-3">Preview</p>
          <StickyPreview
            content={content}
            embedEnabled={embedEnabled}
            embedTitle={embedTitle}
            embedDescription={embedDescription}
            embedColor={embedColor}
            buttons={buttons}
          />
        </NeonCard>
      </div>
    </div>
  );
}
