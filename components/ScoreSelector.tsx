'use client';

interface Props {
  value: number | null;
  onChange: (score: number) => void;
  disabled?: boolean;
}

export default function ScoreSelector({ value, onChange, disabled }: Props) {
  return (
    <div className="flex gap-2" role="group" aria-label="Score 1 to 5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={disabled}
          aria-pressed={value === n}
          onClick={() => onChange(n)}
          className={`w-11 h-11 rounded-lg text-sm font-semibold border-2 transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500
            ${value === n
              ? 'bg-indigo-600 border-indigo-600 text-white shadow-md scale-105'
              : 'bg-white border-gray-300 text-gray-700 hover:border-indigo-400 hover:text-indigo-600'
            }
            ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
          `}
        >
          {n}
        </button>
      ))}
    </div>
  );
}
