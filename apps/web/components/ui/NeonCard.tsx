export function NeonCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`neon-card ${className}`}>{children}</div>;
}
