import { JetonBreakdownEntry } from '@/types';

interface JetonBreakdownListProps {
  breakdown: JetonBreakdownEntry[];
  unassigned: { count: number; eur: number } | null;
  emptyLabel?: string;
}

export function JetonBreakdownList({ breakdown, unassigned, emptyLabel = 'Keine Jetons' }: JetonBreakdownListProps) {
  if (breakdown.length === 0 && !unassigned) {
    return <div className="text-slate-400 text-sm">{emptyLabel}</div>;
  }
  return (
    <div className="flex flex-col gap-1.5">
      {breakdown.map(b => (
        <div key={b.jeton_type_id} className="flex items-center justify-between py-1">
          <span className="flex items-center gap-2">
            <span className="w-4 h-4 rounded-full inline-block border border-slate-200" style={{ background: b.color }} />
            {b.name}
          </span>
          <span className="font-bold text-lg tabular-nums">{b.count}x</span>
        </div>
      ))}
      {unassigned && (
        <div className="text-xs text-amber-700 mt-1">
          {unassigned.count} Position(en) ohne Jeton-Zuordnung ({unassigned.eur.toFixed(2).replace('.', ',')} &euro;)
        </div>
      )}
    </div>
  );
}
