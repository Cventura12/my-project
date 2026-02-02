import { StatsBarProps } from "@/lib/types";

/**
 * StatsBar Component - Mint & Black Theme
 *
 * Displays key metrics in white cards with dark borders:
 * - Total: Black text
 * - Urgent: Red accent
 * - Blocking: Amber accent
 * - Avg Score: Green accent
 */

export default function StatsBar({ stats }: StatsBarProps) {
  return (
    <div className="bg-white border-2 border-gray-800 rounded-xl p-3 shadow-md">
      {/*
        Responsive grid:
        - Mobile: 2 columns
        - Tablet: 4 columns
      */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Total */}
        <StatCard
          label="Total"
          value={stats.total}
          color="default"
        />

        {/* Urgent - Red when > 0 */}
        <StatCard
          label="Urgent"
          value={stats.urgent}
          color={stats.urgent > 0 ? "red" : "default"}
        />

        {/* Blocking - Amber when > 0 */}
        <StatCard
          label="Blocking"
          value={stats.blocking}
          color={stats.blocking > 0 ? "amber" : "default"}
        />

        {/* Avg Score - Always green */}
        <StatCard
          label="Avg Score"
          value={Math.round(stats.avgScore)}
          color="green"
        />
      </div>
    </div>
  );
}

/**
 * Individual stat card component
 */
interface StatCardProps {
  label: string;
  value: number;
  color: "default" | "red" | "amber" | "green";
}

function StatCard({ label, value, color }: StatCardProps) {
  // Color mappings for the stat value
  const colorClasses = {
    default: "text-gray-900",
    red: "text-red-500",
    amber: "text-amber-500",
    green: "text-emerald-500",
  };

  // Background tint based on color
  const bgClasses = {
    default: "bg-gray-50 border-gray-200",
    red: "bg-red-50 border-red-200",
    amber: "bg-amber-50 border-amber-200",
    green: "bg-emerald-50 border-emerald-200",
  };

  return (
    <div className={`rounded-lg p-3 border-2 ${bgClasses[color]} text-center`}>
      {/* Large number */}
      <p className={`text-3xl font-bold ${colorClasses[color]}`}>
        {value}
      </p>
      {/* Label */}
      <p className="text-[11px] text-gray-500 uppercase tracking-wider font-semibold mt-1">
        {label}
      </p>
    </div>
  );
}
