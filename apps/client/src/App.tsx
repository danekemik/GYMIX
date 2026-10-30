import { queryReadModel } from './data/local/read-rpc';
import type { DraftSummary } from './lib/session';
import { LibraryScreen } from './screens/LibraryScreen';
import { readBuilderPreferences, saveBuilderPreferences } from './lib/builderPreferences';
import { SyncStatus } from './components/SyncStatus';
import { useEffect, useRef, useState } from 'react';
import { generateWorkout, type GeneratedWorkout } from '@gymix/generator';
import type { GeneratorMuscleGroup, VolumeLevel, WorkoutType } from '@gymix/structures';
import { TabBar } from './components/TabBar';
import { useDb } from './hooks/useDb';
import { isMgs } from './lib/workoutTypes';
import { getCatalog } from './lib/catalog';
import type { Draft } from './lib/draft';
import { createDraft, deleteDraft, type DraftSession, type ResumedSession } from './lib/session';
import { ExecuteScreen, type FinishPayload } from './screens/ExecuteScreen';
import { FinishScreen } from './screens/FinishScreen';
import { ManualScreen } from './screens/ManualScreen';import { MgsGroupScreen } from './screens/MgsGroupScreen';
import { PreviewScreen } from './screens/PreviewScreen';
import { ProgressScreen } from './screens/ProgressScreen';
import { RandomizerScreen } from './screens/RandomizerScreen';
import { RecordScreen } from './screens/RecordScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { TypeScreen } from './screens/TypeScreen';
import { VolumeScreen } from './screens/VolumeScreen';
import { WorkoutsScreen } from './screens/WorkoutsScreen';
import { structureFor } from './lib/draft';
import { useDialogFocus } from './hooks/useDialogFocus';
import { updateTemplate, type TemplateCard } from './lib/templates';

const TABS = [
  { id: 'today', label: 'Сегодня', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m3 10 9-7 9 7v10H3Z" strokeLinejoin="round" /><path d="M9 20v-7h6v7" /></svg> },
  { id: 'workouts', label: 'Тренировки', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M6.5 7.5v9M17.5 7.5v9M3.5 9.5v5M20.5 9.5v5M6.5 12h11" strokeLinecap="round" /></svg> },
  { id: 'progress', label: 'Прогресс', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m4 17 5-5 3 3 7-8" strokeLinecap="round" strokeLinejoin="round" /><path d="M14 7h5v5" strokeLinecap="round" strokeLinejoin="round" /></svg> },
];

type Step = 'home' | 'type' | 'mgs' | 'volume' | 'manual' | 'randomizer' | 'preview' | 'execute' | 'finish';
type Nullable<T> = T | undefined;
type TemplateEdit = { id: string; title: string; };

/** Подэкраны поверх основных разделов. */
type Sub = { kind: 'record'; id: string; } | { kind: 'settings'; };


function randomSeed(): number {
  return Math.floor(Math.random() * 0xffffffff);
}

export function App() {
  const { db } = useDb();
  const mainRef = useRef<HTMLElement>(null);
  const [tab, setTab] = useState('today');

  const [step, setStep] = useState<Step>('home');
  const [stepType, setStepType] = useState<WorkoutType>('Full Body');
  const [stepMgsGroup, setStepMgsGroup] = useState<Nullable<GeneratorMuscleGroup>>(undefined);
  const [stepVolume, setStepVolume] = useState<VolumeLevel>('Стандартная');
  const [seed, setSeed] = useState<number>(randomSeed);
  const [generated, setGenerated] = useState<Nullable<GeneratedWorkout>>(undefined);
  const [finished, setFinished] = useState<Nullable<FinishPayload>>(undefined);
  const [resume, setResume] = useState<Nullable<ResumedSession>>(undefined);
  const [preparedSession, setPreparedSession] = useState<DraftSession>();
  const [finishedDraft, setFinishedDraft] = useState<DraftSession>();
  const [fromTemplate, setFromTemplate] = useState(false);
  const [templateEdit, setTemplateEdit] = useState<Nullable<TemplateEdit>>(undefined);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [templateError, setTemplateError] = useState('');
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [manualSlotKey, setManualSlotKey] = useState<Nullable<string>>(undefined);
  const [manualReturn, setManualReturn] = useState<'volume' | 'template'>('volume');
  const [entryOrder, setEntryOrder] = useState<readonly string[]>([]);
  const [flash, setFlash] = useState<{ text: string; tone: 'ok' | 'error' }>();
  const [pendingChange, setPendingChange] = useState<{ run: () => void; text: string } | null>(null);
  const changeDialog = useRef<HTMLElement>(null);
  useDialogFocus(changeDialog, Boolean(pendingChange), () => setPendingChange(null));
  const [navigationError, setNavigationError] = useState('');
  const [starting, setStarting] = useState(false);
  const [pendingStart, setPendingStart] = useState(false);
  const startDialog = useRef<HTMLElement>(null);
  useDialogFocus(startDialog, pendingStart, () => { if (!starting) setPendingStart(false); });
  const [libraryView, setLibraryView] = useState<'saved' | 'history'>('saved');
  const [sub, setSub] = useState<Nullable<Sub>>(undefined);

  useEffect(() => { mainRef.current?.scrollTo(0, 0); }, [step, tab, sub?.kind]);

  useEffect(() => {
    if (flash === undefined) return;
    const timer = window.setTimeout(() => setFlash(undefined), 4000);
    return () => window.clearTimeout(timer);
  }, [flash]);

  const exitBuilder = () => {
    setStep('home');
    setStepMgsGroup(undefined);
    setStepVolume('Стандартная');
    setGenerated(undefined);
    setFinished(undefined);
    setResume(undefined);
    setPreparedSession(undefined);
    setFinishedDraft(undefined);
    setFromTemplate(false);
    setTemplateEdit(undefined);
    setSelections({});
    setManualSlotKey(undefined);
    setEntryOrder([]);
  };

  const exitTemplateEdit = (message?: string) => {
    setTemplateEdit(undefined);
    setGenerated(undefined);
    setSelections({});
    setEntryOrder([]);
    setManualSlotKey(undefined);
    setManualReturn('volume');
    setFromTemplate(false);
    setTemplateError('');
    setStep('home');
    setTab('workouts');
    setLibraryView('saved');
    if (message) setFlash({ text: message, tone: 'ok' });
  };

  const startBuilder = (type: WorkoutType) => {
    const run = () => {
      if (type !== stepType) {
        setStepType(type); setStepMgsGroup(undefined); setStepVolume('Стандартная');
        setSelections({}); setGenerated(undefined); setFromTemplate(false); setTemplateEdit(undefined); setManualSlotKey(undefined); setEntryOrder([]);
      }
      setStep(isMgs(type) ? 'mgs' : 'volume');
    };
    if (type !== stepType && (generated || Object.keys(selections).length)) setPendingChange({ run, text: 'Другой формат изменит состав. Выбранные упражнения и замены будут сброшены.' });
    else run();
  };

  const draft: Draft = {
    type: stepType,
    volume: stepVolume,
    ...(stepMgsGroup ? { mgsGroup: stepMgsGroup } : {}),
    ...(Object.keys(selections).length > 0 ? { selections } : {}),
  };
  const changeParameter = (run: () => void) => {
    if (generated || Object.keys(selections).length) setPendingChange({ run, text: 'Изменится число или группа упражнений. Текущий состав и замены будут сброшены.' });
    else run();
  };
  const showManualPreview = () => {
    try {
      const plan = generateWorkout(getCatalog(), {
        type: stepType, volume: stepVolume, ...(stepMgsGroup ? { targetGroup: stepMgsGroup } : {}),
        lockedSelections: selections, seed,
      });
      const positions = new Map(entryOrder.map((key, index) => [key, index]));
      setGenerated({ ...plan, entries: [...plan.entries].sort((a, b) => (positions.get(a.slotKey) ?? 999) - (positions.get(b.slotKey) ?? 999)) });
      setStep('preview');
    } catch { setNavigationError('Не удалось собрать состав. Проверь выбранные упражнения.'); setStep('manual'); }
  };
  const editComposition = () => {
    if (generated) {
      setSelections(Object.fromEntries(generated.entries.map(entry => [entry.slotKey, entry.exercise.name])));
      setEntryOrder(generated.entries.map(entry => entry.slotKey));
    }
    setManualSlotKey(undefined); setManualReturn('volume'); setStep('manual');
  };

  const openTab = (id: string) => {
    setTab(id);
    setSub(undefined);
    if (step !== 'home') exitBuilder();
  };

  const openHistory = () => { setSub(undefined); setLibraryView('history'); setTab('workouts'); };
  const openTemplates = () => { setSub(undefined); setLibraryView('saved'); setTab('workouts'); };
  const openSettings = () => setSub({ kind: 'settings' });
  const openRecord = (id: string) => setSub({ kind: 'record', id });

  // Navigation is immediate and never waits for an animated overlay.
  const openFormats = () => {
    setStepType('Full Body'); setStepMgsGroup(undefined); setStepVolume('Стандартная');
    setSelections({}); setGenerated(undefined); setFromTemplate(false); setTemplateEdit(undefined); setManualSlotKey(undefined); setEntryOrder([]);
    setNavigationError(''); setTemplateError(''); setStep('type');
  };
  const closeFormats = () => setStep('home');

  const openTemplate = async (templateId: string) => {
    if (db === undefined) return;
    try {
      const workout = await queryReadModel<GeneratedWorkout>(db, `template:${templateId}`);
      setStepType(workout.type);
      setStepVolume(workout.volume);
      setStepMgsGroup(isMgs(workout.type) ? workout.entries[0]?.groupUsed : undefined);
      setFromTemplate(true);
      setTemplateEdit(undefined);
      setSelections({});
      setEntryOrder([]); setManualSlotKey(undefined);
      setGenerated(workout);
      setStep('preview');
    } catch {
      setNavigationError('Не удалось открыть сохранённую тренировку. Попробуй ещё раз.');
    }
  };

  const openTemplateEdit = async (templateId: string) => {
    if (db === undefined) return;
    try {
      const [templates, workout] = await Promise.all([
        queryReadModel<TemplateCard[]>(db, 'templates'),
        queryReadModel<GeneratedWorkout>(db, `template:${templateId}`),
      ]);
      const card = templates.find((item) => item.id === templateId);
      const next: Record<string, string> = {};
      for (const entry of workout.entries) next[entry.slotKey] = entry.exercise.name;
      setStepType(workout.type);
      setStepVolume(workout.volume);
      setStepMgsGroup(isMgs(workout.type) ? workout.entries[0]?.groupUsed : undefined);
      setSelections(next);
      setEntryOrder(workout.entries.map(entry => entry.slotKey));
      setFromTemplate(true);
      setTemplateEdit({ id: templateId, title: card?.title ?? 'Сохранённая тренировка' });
      setTemplateError('');
      setGenerated(undefined);
      setManualSlotKey(undefined);
      setManualReturn('template');
      setStep('manual');
    } catch {
      setNavigationError('Не удалось открыть сохранённую тренировку. Попробуй ещё раз.');
    }
  };

  const saveTemplateEdit = async () => {
    if (db === undefined || templateEdit === undefined || generated === undefined || savingTemplate) return;
    setSavingTemplate(true);
    setTemplateError('');
    try {
      await updateTemplate(db, templateEdit.id, {
        title: templateEdit.title,
        type: generated.type,
        volume: generated.volume,
        entries: generated.entries.map((entry) => ({
          slotKey: entry.slotKey,
          exerciseName: entry.exercise.name,
        })),
      });
      exitTemplateEdit('Изменения шаблона сохранены.');
    } catch (error) {
      setTemplateError(error instanceof Error ? error.message : 'Не удалось сохранить шаблон. Попробуй ещё раз.');
    } finally {
      setSavingTemplate(false);
    }
  };

  const repeatWorkout = async (sessionId: string) => {
    if (!db) throw new Error('Локальная база ещё открывается');
    const workout = await queryReadModel<GeneratedWorkout>(db, `repeat:${sessionId}`);
    setGenerated(workout);
    setResume(undefined);
    setStepType(workout.type);
    setStepVolume(workout.volume);
    setStepMgsGroup(isMgs(workout.type) ? workout.entries[0]?.groupUsed : undefined);
    setSelections({});
    setEntryOrder([]); setManualSlotKey(undefined);
    setFromTemplate(true);
    setTemplateEdit(undefined);
    setSub(undefined);
    setStep('preview');
  };

  const quickBuildNow = () => {
    if (!db) return;
    const previous = readBuilderPreferences(db.account.userId);
    if (!previous) { openFormats(); return; }
    setStepType(previous.type);
    setStepVolume(previous.volume);
    setStepMgsGroup(previous.mgsGroup);
    setSelections({});
    setEntryOrder([]); setManualSlotKey(undefined);
    setGenerated(undefined);
    setFromTemplate(false);
    setTemplateEdit(undefined);
    setSeed(randomSeed());
    setStep('randomizer');
  };

  const startWorkout = async (replaceDraft = false) => {
    if (!db || !generated || starting) return;
    setStarting(true);
    try {
      const active = await queryReadModel<DraftSummary | null>(db, 'active');
      if (active && !replaceDraft) {
        setPendingStart(true);
        setNavigationError('');
        return;
      }
      if (active) await deleteDraft(db, active.sessionId);
      if (!fromTemplate) saveBuilderPreferences(db.account.userId, draft);
      const created = await createDraft(db, generated);
      setPreparedSession(created);
      setFinishedDraft(undefined);
      setResume(undefined);
      setTemplateEdit(undefined);
      setPendingStart(false);
      setNavigationError('');
      setStep('execute');
    } catch { setNavigationError('Не удалось начать тренировку. Попробуй ещё раз.'); }
    finally { setStarting(false); }
  };

  const retryFinish = () => {
    if (finished === undefined || finishedDraft === undefined) return;
    setResume({
      ...finishedDraft,
      workout: finished.workout,
      sets: finished.sets,
      skipped: finished.skippedExercises ?? [],
      startedAt: finished.startedAt,
      elapsedMs: finished.durationMs ?? finished.endedAt - finished.startedAt,
      running: false,
    });
    setPreparedSession(finishedDraft);
    setFinished(undefined);
    setStep('execute');
  };

  let body;
  if (step === 'type') {
    body = (
      <TypeScreen
        key={pendingChange ? 'confirm-format' : stepType}
        initialType={stepType}
        onSelect={startBuilder}
        onClose={closeFormats}
      />
    );
  } else if (step === 'mgs') {
    body = (
      <MgsGroupScreen
        selectedGroup={stepMgsGroup}
        onBack={() => setStep('type')}
        onGroupSelect={(group) => {
          const run = () => {
            if (group !== stepMgsGroup) { setSelections({}); setGenerated(undefined); setManualSlotKey(undefined); setEntryOrder([]); }
            setStepMgsGroup(group); setStep('volume');
          };
          if (stepMgsGroup && group !== stepMgsGroup) changeParameter(run); else run();
        }}
      />
    );
  } else if (step === 'volume') {
    body = (
      <VolumeScreen
        draft={draft}
        onVolumeChange={volume => {
          if (volume === stepVolume) return;
          changeParameter(() => { setStepVolume(volume); setSelections({}); setGenerated(undefined); setManualSlotKey(undefined); setEntryOrder([]); });
        }}
        hasComposition={Boolean(generated)}
        hasSelection={Object.keys(selections).length > 0}
        onContinue={() => {
          if (generated) { setStep('preview'); return; }
          setSeed(randomSeed());
          setGenerated(undefined);
          setStep('randomizer');
        }}
        onManual={() => {
          if (generated) {
            setSelections(Object.fromEntries(generated.entries.map(entry => [entry.slotKey, entry.exercise.name])));
            setEntryOrder(generated.entries.map(entry => entry.slotKey));
          }
          setManualReturn('volume'); setManualSlotKey(undefined); setStep('manual');
        }}
        onBack={() => setStep(isMgs(stepType) ? 'mgs' : 'type')}
      />
    );
  } else if (step === 'manual') {
    body = (
      <ManualScreen
        draft={draft}
        {...(manualSlotKey !== undefined ? { startSlotKey: manualSlotKey } : {})}
        {...(templateEdit !== undefined ? { templateTitle: templateEdit.title } : {})}
        onSlotChange={setManualSlotKey}
        onSelect={(slotKey, name) => {
          const next = { ...selections };
          if (name === '') delete next[slotKey];
          else next[slotKey] = name;
          setSelections(next);
          setGenerated(undefined);
        }}
        onBack={() => {
          if (manualReturn === 'template') exitTemplateEdit();
          else setStep('volume');
        }}
        onGenerate={() => {
          if (Object.keys(selections).length === structureFor(draft).slots.length) showManualPreview();
          else { setSeed(randomSeed()); setGenerated(undefined); setStep('randomizer'); }
        }}
        onDone={showManualPreview}
      />
    );
  } else if (step === 'randomizer') {
    body = (
      <RandomizerScreen
        draft={draft}
        seed={seed}
        onContinue={(workout) => {
          setGenerated(workout);
          setStep('preview');
        }}
        onRegenerate={() => setSeed(randomSeed())}
        onBack={() => setStep('volume')}
      />
    );
  } else if (step === 'preview' && generated) {
    body = (
      <PreviewScreen
        workout={generated}
        draft={draft}
        onStart={() => void startWorkout()}
        starting={starting}
        regenerable={!fromTemplate}
        {...(templateEdit !== undefined ? {
          templateTitle: templateEdit.title,
          templateMode: true,
          savingTemplate,
          saveError: templateError,
          onSaveTemplate: () => void saveTemplateEdit(),
        } : {})}
        onReplace={(index, exercise) => {
          const replaced = generated.entries[index];
          if (replaced === undefined) return;
          setGenerated({
            ...generated,
            entries: generated.entries.map((entry, i) =>
              i === index
                ? {
                  ...entry,
                  exercise,
                  isRepeat: generated.entries.some(
                    (other, otherIndex) =>
                      otherIndex !== index && other.exercise.name === exercise.name,
                  ),
                }
                : entry,
            ),
          });
        }}
        onReorder={(entries) => setGenerated({ ...generated, entries })}
        onEditParameters={() => setStep('volume')}
        onRegenerate={() => {
          setPendingChange({ text: 'Текущий состав и замены будут заменены новым подбором.', run: () => {
            setSelections({}); setGenerated(undefined); setEntryOrder([]); setSeed(randomSeed()); setStep('randomizer');
          } });
        }}
        onBack={() => {
          if (templateEdit !== undefined) {
            exitTemplateEdit();
          } else if (fromTemplate) {
            setFromTemplate(false);
            setGenerated(undefined);
            setStep('home');
          } else {
            if (Object.keys(selections).length) editComposition();
            else setStep('volume');
          }
        }}
      />
    );
  } else if (step === 'execute' && (generated ?? resume) && (preparedSession ?? resume)) {
    body = (
      <ExecuteScreen
        key={resume !== undefined ? `resume-${resume.sessionId}` : 'new'}
        workout={resume?.workout ?? (generated as GeneratedWorkout)}
        prepared={resume ?? preparedSession!}
        {...(resume !== undefined ? { resume } : {})}
        onFinish={(payload) => {
          setFinished(payload);
          setFinishedDraft(resume ?? preparedSession);
          setResume(undefined);
          setStep('finish');
        }}
        onExit={exitBuilder}
      />
    );
  } else if (step === 'finish' && finished) {
    body = (
      <FinishScreen
        payload={finished}
        onDone={exitBuilder}
        onRetry={retryFinish}
        onOpenHistory={() => {
          exitBuilder();
          openHistory();
        }}
        onOpenTemplates={() => {
          exitBuilder();
          openTemplates();
        }}
      />
    );
  } else if (sub?.kind === 'settings') {
    body = <SettingsScreen onBack={() => setSub(undefined)} />;
  } else if (sub?.kind === 'record') {
    body = <RecordScreen key={sub.id} sessionId={sub.id} onBack={openHistory} />;
  } else if (tab === 'today') {
    body = (
      <WorkoutsScreen
        onSettings={openSettings}
        onQuickBuild={quickBuildNow}
        quickDraft={db ? readBuilderPreferences(db.account.userId) : undefined}
        onCreate={openFormats}
        onRepeat={repeatWorkout}
        onOpenActivity={openHistory}
        onOpenSession={openRecord}
        onResume={(session) => {
          setResume(session);
          setStep('execute');
        }}
      />
    );
  } else if (tab === 'workouts') {
    body = <LibraryScreen view={libraryView} onViewChange={setLibraryView} onSettings={openSettings} onCreate={openFormats} onOpenSession={openRecord} onOpenTemplate={(id) => void openTemplate(id)} onEditTemplate={(id) => void openTemplateEdit(id)} />;
  } else {
    body = <ProgressScreen onSettings={openSettings} onCreate={openFormats} />;
  }

  return (
    <div className="app">
      {step === 'home' && sub === undefined && <TabBar tabs={TABS} active={tab} onChange={openTab} />}
      <main ref={mainRef} className={`app__main${step === 'home' && sub === undefined ? ' app__main--tabs' : ''}`}>
        <SyncStatus />
        {flash !== undefined && <div className={`app-flash app-flash--${flash.tone}`} role={flash.tone === 'error' ? 'alert' : 'status'}>{flash.text}</div>}
        {navigationError && <div className="navigation-error" role="alert"><p>{navigationError}</p><button className="text-action" onClick={() => { setNavigationError(''); exitBuilder(); setSub(undefined); setTab('today'); }}>На экран «Сегодня»</button><button className="text-action" onClick={() => setNavigationError('')}>Закрыть</button></div>}
        {body}
      </main>
      {pendingChange && <div className="overlay"><section ref={changeDialog} className="dialog" role="dialog" aria-modal="true" aria-labelledby="change-composition-title">
        <h2 className="dialog__title" id="change-composition-title">Изменить состав?</h2><p className="dialog__text">{pendingChange.text}</p>
        <div className="dialog__actions"><button className="btn btn--primary" onClick={() => { pendingChange.run(); setPendingChange(null); }}>Изменить</button><button className="btn btn--ghost" onClick={() => setPendingChange(null)} autoFocus>Оставить состав</button></div>
      </section></div>}
      {pendingStart && <div className="overlay"><section ref={startDialog} className="dialog" role="dialog" aria-modal="true" aria-labelledby="start-new-title">
        <h2 className="dialog__title" id="start-new-title">Начать новую тренировку?</h2>
        <p className="dialog__text">У тебя есть начатая тренировка. Если начнёшь новую, черновик с её прогрессом будет удалён.</p>
        <div className="dialog__actions">
          <button className="btn btn--danger" disabled={starting} onClick={() => void startWorkout(true)}>{starting ? 'Удаляем…' : 'Удалить черновик и начать'}</button>
          <button className="btn btn--ghost" disabled={starting} onClick={() => setPendingStart(false)} autoFocus>Отмена</button>
        </div>
      </section></div>}
    </div>
  );
}
