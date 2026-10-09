interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

interface SegmentedProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  label?: string;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: SegmentedProps<T>) {
  return (
    <div className="segmented" role="tablist" aria-label={label}>
      {options.map((opt) => (
        <button
          key={opt.value}
          role="tab"
          aria-selected={value === opt.value}
          className={`segmented__item ${value === opt.value ? 'segmented__item--on' : ''}`}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}