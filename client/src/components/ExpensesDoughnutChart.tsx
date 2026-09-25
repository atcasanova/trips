import React, { useState, useMemo } from 'react';
import { PieChart, LucideIcon } from 'lucide-react';

export interface DoughnutCategoryItem {
  key: string;
  label: string;
  color: string;
  bg: string;
  icon: LucideIcon;
  amount: number;
  percentage: number;
}

interface ExpensesDoughnutChartProps {
  data: DoughnutCategoryItem[];
  currency: string;
  totalAmount: number;
  filterLabel?: string;
}

export const ExpensesDoughnutChart: React.FC<ExpensesDoughnutChartProps> = ({
  data,
  currency,
  totalAmount,
  filterLabel,
}) => {
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  // SVG dimensions & radius
  const size = 260;
  const strokeWidthDefault = 28;
  const strokeWidthHover = 34;
  const radius = 80;
  const center = size / 2;
  const circumference = 2 * Math.PI * radius;

  const hoveredItem = useMemo(() => {
    return data.find((d) => d.key === hoveredKey) || null;
  }, [data, hoveredKey]);

  // Compute stroke-dasharray and offsets
  const slices = useMemo(() => {
    let accumulatedOffset = 0;
    const hasMultiple = data.length > 1;
    const gap = hasMultiple ? 3 : 0;

    return data.map((item) => {
      const sliceLength = (item.percentage / 100) * circumference;
      const dashLength = Math.max(1, sliceLength - gap);
      const dashArray = `${dashLength} ${circumference - dashLength}`;
      const dashOffset = -accumulatedOffset;

      accumulatedOffset += sliceLength;

      return {
        ...item,
        dashArray,
        dashOffset,
      };
    });
  }, [data, circumference]);

  if (data.length === 0 || totalAmount <= 0) {
    return (
      <div className="py-12 px-4 text-center">
        <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
          <PieChart className="w-6 h-6" />
        </div>
        <p className="text-xs font-semibold text-slate-600">Nenhum gasto registrado nesta moeda</p>
        <p className="text-[11px] text-slate-400 mt-1">Altere o filtro de viajante ou selecione outra moeda acima.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center pt-2">
      {/* 1. DOUGHNUT CHART SVG */}
      <div className="lg:col-span-5 flex flex-col items-center justify-center">
        <div className="relative w-[240px] h-[240px] sm:w-[260px] sm:h-[260px] flex items-center justify-center">
          <svg
            width="100%"
            height="100%"
            viewBox={`0 0 ${size} ${size}`}
            className="transform -rotate-90 select-none overflow-visible"
          >
            {/* Background ring track */}
            <circle
              cx={center}
              cy={center}
              r={radius}
              fill="transparent"
              stroke="#f1f5f9"
              strokeWidth={strokeWidthDefault}
            />

            {/* Slices */}
            {slices.map((slice) => {
              const isHovered = hoveredKey === slice.key;
              const isOtherHovered = hoveredKey !== null && !isHovered;

              return (
                <circle
                  key={slice.key}
                  cx={center}
                  cy={center}
                  r={radius}
                  fill="transparent"
                  stroke={slice.color}
                  strokeWidth={isHovered ? strokeWidthHover : strokeWidthDefault}
                  strokeDasharray={slice.dashArray}
                  strokeDashoffset={slice.dashOffset}
                  strokeLinecap="round"
                  className="cursor-pointer transition-all duration-300"
                  style={{
                    opacity: isOtherHovered ? 0.35 : 1,
                    filter: isHovered ? 'drop-shadow(0 4px 8px rgba(0, 0, 0, 0.15))' : 'none',
                  }}
                  onMouseEnter={() => setHoveredKey(slice.key)}
                  onMouseLeave={() => setHoveredKey(null)}
                />
              );
            })}
          </svg>

          {/* DOUGHNUT CENTER CONTENT */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none p-6 text-center">
            {hoveredItem ? (
              <div className="animate-fade-in space-y-0.5">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block truncate max-w-[140px] mx-auto">
                  {hoveredItem.label}
                </span>
                <div className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
                  <span className="text-xs font-semibold text-slate-500 mr-1">{currency}</span>
                  {hoveredItem.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div
                  className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold shadow-2xs"
                  style={{ backgroundColor: `${hoveredItem.color}20`, color: hoveredItem.color }}
                >
                  {hoveredItem.percentage.toFixed(1)}% do total
                </div>
              </div>
            ) : (
              <div className="space-y-0.5">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Total {filterLabel ? `(${filterLabel})` : ''}
                </span>
                <div className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
                  <span className="text-xs font-semibold text-slate-500 mr-1">{currency}</span>
                  {totalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <span className="text-[11px] font-medium text-slate-500 block">
                  {data.length} {data.length === 1 ? 'categoria' : 'categorias'}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 2. CATEGORY LEGEND & BREAKDOWN LIST */}
      <div className="lg:col-span-7 space-y-2.5">
        <div className="flex items-center justify-between text-xs pb-1 border-b border-slate-100">
          <span className="font-semibold text-slate-500 uppercase tracking-wider text-[10px]">
            Distribuição por Categoria
          </span>
          <span className="text-[10px] text-slate-400">Passe o mouse para destacar</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[300px] overflow-y-auto pr-1">
          {data.map((cat) => {
            const Icon = cat.icon;
            const isHovered = hoveredKey === cat.key;
            const isOtherHovered = hoveredKey !== null && !isHovered;

            return (
              <div
                key={cat.key}
                onMouseEnter={() => setHoveredKey(cat.key)}
                onMouseLeave={() => setHoveredKey(null)}
                className={`p-3 rounded-xl border transition-all duration-200 cursor-pointer flex items-center justify-between gap-3 ${
                  isHovered
                    ? 'border-purple-300 bg-purple-50/50 shadow-sm scale-[1.02]'
                    : isOtherHovered
                    ? 'border-slate-100 bg-white opacity-40'
                    : 'border-slate-100 bg-slate-50/60 hover:bg-slate-50 hover:border-slate-200'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 shadow-2xs"
                    style={{ backgroundColor: `${cat.color}20`, color: cat.color }}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-xs font-semibold text-slate-800 block truncate" title={cat.label}>
                      {cat.label}
                    </span>
                    <span className="text-[10px] text-slate-400 font-medium">
                      {cat.percentage.toFixed(1)}%
                    </span>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <span className="text-xs font-bold text-slate-900 block font-mono">
                    {currency} {cat.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
