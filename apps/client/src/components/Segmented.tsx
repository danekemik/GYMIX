import { useRef, type KeyboardEvent } from 'react';

interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

interface SegmentedProps<T extends string> {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  label?: string;
}

/**
 * Компактный переключатель фильтра. Это не вкладки с панелями,
 * поэтому используется группа радио с одной точкой табуляции и стрелками.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: SegmentedProps<T>) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);

  const move = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const keys = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'];
    if (!keys.includes(event.key)) return;
    event.preventDefault();
    const last = options.length - 1;
    const next = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? last
        : event.key === 'ArrowRight' || event.key === 'ArrowDown'
          ? (index + 1) % options.length
          : (index - 1 + options.length) % options.length;
    const option = options[next];
    if (option === undefined) return;
    onChange(option.value);
    buttons.current[next]?.focus();
  };

  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((opt, index) => {
        const selected = value === opt.value;
        return (
          <button
            key={opt.value}
            ref={(element) => {
              buttons.current[index] = element;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            className={`segmented__item ${selected ? 'segmented__item--on' : ''}`}
            onClick={() => onChange(opt.value)}
            onKeyDown={(event) => move(event, index)}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
