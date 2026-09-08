import { NeonCard } from "../../../components/ui/NeonCard";

export default function OverviewPage({ params }: { params: { guildId: string } }) {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Overview</h1>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <NeonCard>
          <p className="text-slate-400 text-sm">Server ID</p>
          <p className="text-lg font-semibold mt-1">{params.guildId}</p>
        </NeonCard>
        <NeonCard>
          <p className="text-slate-400 text-sm">Active Modules</p>
          <p className="text-lg font-semibold mt-1">See Modules tab</p>
        </NeonCard>
        <NeonCard>
          <p className="text-slate-400 text-sm">Bot Status</p>
          <p className="text-lg font-semibold mt-1 text-neon-blue">Online</p>
        </NeonCard>
      </div>
    </div>
  );
}
