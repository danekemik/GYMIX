import { useEffect, useRef, useState } from 'react';
import {
  InsufficientCatalogError,
  generateWorkout,
  type GeneratedWorkout,
} from '@gymix/generator';
import { plural, structureFor, type Draft } from '../lib/draft';
import { getCatalog } from '../lib/catalog';

interface RandomizerScreenProps {
  draft: Draft;
  seed: number;
  onContinue: (workout: GeneratedWorkout) => void;
  onRegenerate: () => void;
  onBack: () => void;
}

type Status = 'running' | 'done' | 'error';

/* Ступени индикатора подбора. Короткая задержка нужна, чтобы состояние
 * читалось, но не превращалось в бесконечный спиннер. */
const STEPS = ['Подбор', 'Проверка', 'Готово'] as const;
const RUN_MS = 420;

export function RandomizerScreen({
  draft,
  seed,
  onContinue,
  onRegenerate,
  onBack,
}: RandomizerScreenProps) {
  const [status, setStatus] = useState<Status>('running');
  const [workout, setWorkout] = useState<GeneratedWorkout | undefined>(undefined);
  const [missing, setMissing] = useState<readonly string[]>([]);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    setStatus('running');
    setWorkout(undefined);
    setMissing([]);

    timer.current = window.setTimeout(() => {
      try {
        const result = generateWorkout(getCatalog(), {
          type: draft.type,
          volume: draft.volume,
          ...(draft.mgsGroup ? { targetGroup: draft.mgsGroup } : {}),
          seed,
        });
        setWorkout(result);
        setStatus('done');
      } catch (error) {
        if (error instanceof InsufficientCatalogError) {
          setMissing(error.missing.map((slot) => slot.allowed.join(' / ')));
        } else {
          setMissing([String(error)]);
        }
        setStatus('error');
      }
    }, RUN_MS);

    return () => {
      if (timer.current !== undefined) window.clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.type, draft.volume, draft.mgsGroup, seed]);

  const activeStep = status === 'running' ? 0 : status === 'error' ? 1 : 2;

  return (
    <div className="screen">
      <header className="topbar">
        <button className="topbar__back" onClick={onBack} aria-label="Назад">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <h1 className="topbar__title topbar__title--step">Генерация</h1>
      </header>

      <div className="screen__body">
        <div className="volume-head">
          <span className="context__type">{draft.type}</span>
          <span className="volume-head__meta">
            {draft.volume} · {plural(structureFor(draft).exerciseCount, ['упражнение', 'упражнения', 'упражнений'])}
          </span>
        </div>

        <div className="gen-center">
          <ol className="gen-steps" aria-label="Ход генерации">
            {STEPS.map((label, index) => {
              const state =
                status === 'done' || index < activeStep
                  ? 'done'
                  : index === activeStep
                    ? status === 'error'
                      ? 'error'
                      : 'active'
                    : 'idle';
              return (
                <li key={label} className={`gen-step gen-step--${state}`}>
                  <span className="gen-step__dot" aria-hidden>
                    {state === 'done' ? (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                        <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    ) : null}
                  </span>
                  <span className="gen-step__label">{label}</span>
                </li>
              );
            })}
          </ol>

          {status === 'running' && <p className="note">Подбираем упражнения по структуре и совместимости…</p>}

          {status === 'error' && (
            <div className="note note--error" role="alert">
              <p className="note__title">Каталога не хватило для сборки</p>
              <p>{missing.join('; ')}</p>
              <button className="btn btn--ghost note__action" onClick={onBack}>
                Вернуться к выбору
              </button>
            </div>
          )}

          {status === 'done' && workout && (
            <div className="gen-result">
              <span className="gen-result__count">
                {plural(workout.entries.length, ['упражнение', 'упражнения', 'упражнений'])}
              </span>
              <span className="gen-result__hint">Готово к предпросмотру</span>
            </div>
          )}
        </div>

        <div className="screen__cta">
          {status === 'done' && workout ? (
            <>
              <button className="btn btn--primary" onClick={() => onContinue(workout)}>
                Продолжить
              </button>
              <button className="btn btn--ghost cta-row__second" onClick={onRegenerate}>
                Перегенерировать
              </button>
            </>
          ) : status === 'running' ? (
            <button className="btn btn--ghost" disabled>
              Генерируем…
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
