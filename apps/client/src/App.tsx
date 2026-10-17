import { LibraryScreen } from './screens/LibraryScreen';
import { readBuilderPreferences, saveBuilderPreferences } from './lib/builderPreferences';
import { activeDraft } from './lib/session';
import { workoutFromHistory } from './lib/reuseWorkout';
import { SyncStatus } from './components/SyncStatus';
import { useEffect, useRef, useState } from 'react';
import { generateWorkout, type GeneratedWorkout } from '@gymix/generator';
import type { GeneratorMuscleGroup, VolumeLevel, WorkoutType } from '@gymix/structures';
import { TabBar } from './components/TabBar';
import { useDb } from './hooks/useDb';
import { isMgs } from './lib/workoutTypes';
import { getCatalog } from './lib/catalog';
import type { Draft } from './lib/draft';
import type { ResumedSession } from './lib/session';
import { workoutFromTemplate } from './lib/templates';
import { ExecuteScreen, type FinishPayload } from './screens/ExecuteScreen';
import { FinishScreen } from './screens/FinishScreen';
import { ManualScreen } from './screens/ManualScreen';
import { MgsGroupScreen } from './screens/MgsGroupScreen';
import { PreviewScreen } from './screens/PreviewScreen';
import { ProgressScreen } from './screens/ProgressScreen';
import { RandomizerScreen } from './screens/RandomizerScreen';
import { RecordScreen } from './screens/RecordScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { StructureScreen } from './screens/StructureScreen';
import { TypeScreen } from './screens/TypeScreen';
import { VolumeScreen } from './screens/VolumeScreen';
import { WorkoutsScreen } from './screens/WorkoutsScreen';

const TABS = [
  { id: 'today', label: 'Сегодня', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m3 10 9-7 9 7v10H3Z" strokeLinejoin="round" /><path d="M9 20v-7h6v7" /></svg> },
  { id: 'workouts', label: 'Тренировки', icon: <span className="tabbar__glyph tabbar__glyph--dumbbell" /> },
  { id: 'progress', label: 'Прогресс', icon: <span className="tabbar__glyph tabbar__glyph--rise" /> },
];

type Step = 'home' | 'type' | 'mgs' | 'volume' | 'structure' | 'manual' | 'randomizer' | 'preview' | 'execute' | 'finish';
type Nullable<T> = T | undefined;

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
  const [fromTemplate, setFromTemplate] = useState(false);
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [manualSlotKey, setManualSlotKey] = useState<Nullable<string>>(undefined);
  const [navigationError, setNavigationError] = useState('');
  const [starting, setStarting] = useState(false);
  const [libraryView, setLibraryView] = useState<'saved' | 'history'>('saved');
  const [sub, setSub] = useState<Nullable<Sub>>(undefined);

  useEffect(() => { mainRef.current?.scrollTo(0, 0); }, [step, tab, sub?.kind]);

  const exitBuilder = () => {
    setStep('home');
    setStepMgsGroup(undefined);
    setStepVolume('Стандартная');
    setGenerated(undefined);
    setFinished(undefined);
    setResume(undefined);
    setFromTemplate(false);
    setSelections({});
    setManualSlotKey(undefined);
  };

  const startBuilder = (type: WorkoutType) => {
    setStepType(type);
    setStepMgsGroup(undefined);
    setStepVolume('Стандартная');
    setSelections({});
    setStep(isMgs(type) ? 'mgs' : 'volume');
  };

  const draft: Draft = {
    type: stepType,
    volume: stepVolume,
    ...(stepMgsGroup ? { mgsGroup: stepMgsGroup } : {}),
    ...(Object.keys(selections).length > 0 ? { selections } : {}),
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
  const openFormats = () => setStep('type');
  const closeFormats = () => setStep('home');

  const openTemplate = async (templateId: string) => {
    if (db === undefined) return;
    try {
      const workout = await workoutFromTemplate(db, templateId);
      setStepType(workout.type);
      setStepVolume(workout.volume);
      setStepMgsGroup(isMgs(workout.type) ? workout.entries[0]?.groupUsed : undefined);
      setFromTemplate(true);
      setGenerated(workout);
      setStep('preview');
    } catch {
      setNavigationError('Не удалось открыть сохранённую тренировку. Попробуй ещё раз.');
    }
  };

  const openTemplateEdit = async (templateId: string) => {
    if (db === undefined) return;
    try {
      const workout = await workoutFromTemplate(db, templateId);
      const next: Record<string, string> = {};
      for (const entry of workout.entries) next[entry.slotKey] = entry.exercise.name;
      setStepType(workout.type);
      setStepVolume(workout.volume);
      setStepMgsGroup(isMgs(workout.type) ? workout.entries[0]?.groupUsed : undefined);
      setSelections(next);
      setFromTemplate(false);
      setGenerated(undefined);
      setManualSlotKey(undefined);
      setStep('manual');
    } catch {
      setNavigationError('Не удалось открыть сохранённую тренировку. Попробуй ещё раз.');
    }
  };

  const repeatWorkout = async (sessionId: string) => {
    if (!db) throw new Error('Локальная база ещё открывается');
    const workout = await workoutFromHistory(db, sessionId);
    setGenerated(workout);
    setResume(undefined);
    setStepType(workout.type);
    setStepVolume(workout.volume);
    setFromTemplate(true);
    setSub(undefined);
    setStep('preview');
  };

  const quickBuild = () => {
    if (!db) return;
    const previous = readBuilderPreferences(db.account.userId);
    if (!previous) { openFormats(); return; }
    setStepType(previous.type);
    setStepVolume(previous.volume);
    setStepMgsGroup(previous.mgsGroup);
    setSelections({});
    setGenerated(undefined);
    setFromTemplate(false);
    setSeed(randomSeed());
    setStep('randomizer');
  };

  const startWorkout = async () => {
    if (!db || starting) return;
    setStarting(true);
    try {
      if (await activeDraft(db)) {
        setNavigationError('У тебя уже есть начатая тренировка. Продолжи или удали её на экране «Сегодня».');
        return;
      }
      if (!fromTemplate) saveBuilderPreferences(db.account.userId, draft);
      setNavigationError('');
      setStep('execute');
    } catch { setNavigationError('Не удалось начать тренировку. Попробуй ещё раз.'); }
    finally { setStarting(false); }
  };

  let body;
  if (step === 'type') {
    body = (
      <TypeScreen
        onSelect={startBuilder}
        onClose={closeFormats}
      />
    );
  } else if (step === 'mgs') {
    body = (
      <MgsGroupScreen
        onBack={exitBuilder}
        onGroupSelect={(group) => {
          setStepMgsGroup(group);
          setStep('volume');
        }}
      />
    );
  } else if (step === 'volume') {
    body = (
      <VolumeScreen
        draft={draft}
        onVolumeChange={setStepVolume}
        onContinue={() => {
          setSelections({});
          setSeed(randomSeed());
          setGenerated(undefined);
          setStep('randomizer');
        }}
        onManual={() => { setSelections({}); setManualSlotKey(undefined); setStep('manual'); }}
        onBack={() => setStep(isMgs(stepType) ? 'mgs' : 'type')}
      />
    );
  } else if (step === 'structure') {
    body = (
      <StructureScreen
        draft={draft}
        onBack={() => setStep('volume')}
        onManual={() => {
          setManualSlotKey(undefined);
          setStep('manual');
        }}
        onOpenSlot={(slotKey) => {
          setManualSlotKey(slotKey);
          setStep('manual');
        }}
        onGenerate={() => {
          setSeed(randomSeed());
          setGenerated(undefined);
          setStep('randomizer');
        }}
      />
    );
  } else if (step === 'manual') {
    body = (
      <ManualScreen
        draft={draft}
        {...(manualSlotKey !== undefined ? { startSlotKey: manualSlotKey } : {})}
        onSelect={(slotKey, name) => {
          const next = { ...selections };
          if (name === '') delete next[slotKey];
          else next[slotKey] = name;
          setSelections(next);
        }}
        onBack={() => setStep('structure')}
        onToStructure={() => setStep('structure')}
        onDone={() => {
          try {
            setGenerated(
              generateWorkout(getCatalog(), {
                type: stepType,
                volume: stepVolume,
                ...(stepMgsGroup ? { targetGroup: stepMgsGroup } : {}),
                lockedSelections: draft.selections ?? {},
                seed,
              }),
            );
            setStep('preview');
          } catch {
            setStep('structure');
          }
        }}
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
        onEditSelection={() => {
          const next: Record<string, string> = {};
          for (const entry of generated.entries) next[entry.slotKey] = entry.exercise.name;
          setSelections(next);
          setManualSlotKey(undefined);
          setStep('manual');
        }}
        onRegenerate={() => {
          setSeed(randomSeed());
          setStep('randomizer');
        }}
        onBack={() => {
          if (fromTemplate) {
            setFromTemplate(false);
            setGenerated(undefined);
            setStep('home');
          } else {
            setStep(Object.keys(selections).length ? 'manual' : 'volume');
          }
        }}
      />
    );
  } else if (step === 'execute' && (generated ?? resume)) {
    body = (
      <ExecuteScreen
        key={resume !== undefined ? `resume-${resume.sessionId}` : 'new'}
        workout={resume?.workout ?? (generated as GeneratedWorkout)}
        {...(resume !== undefined ? { resume } : {})}
        onFinish={(payload) => {
          setFinished(payload);
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
    body = <RecordScreen sessionId={sub.id} onBack={openHistory} />;
  } else if (tab === 'today') {
    body = (
      <WorkoutsScreen
        onSettings={openSettings}
        onQuickBuild={quickBuild}
        quickDraft={db ? readBuilderPreferences(db.account.userId) : undefined}
        onCreate={openFormats}
        onOpenTemplates={openTemplates}
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
  } else if (tab === 'progress') {
    body = <ProgressScreen onSettings={openSettings} />;
  } else {
    body = <SoonScreen tab={tab} />;
  }

  return (
    <div className="app">
      <main ref={mainRef} className={`app__main${step === 'home' && sub === undefined ? ' app__main--tabs' : ''}`}><SyncStatus />{navigationError && <div className="navigation-error" role="alert"><p>{navigationError}</p><button className="text-action" onClick={() => { setNavigationError(''); exitBuilder(); setSub(undefined); setTab('today'); }}>На экран «Сегодня»</button><button className="text-action" onClick={() => setNavigationError('')}>Закрыть</button></div>}{body}</main>
      {step === 'home' && sub === undefined && <TabBar tabs={TABS} active={tab} onChange={openTab} />}
    </div>
  );
}

function SoonScreen({ tab }: { tab: string; }) {
  const label = TABS.find((t) => t.id === tab)?.label ?? 'Раздел';
  return (
    <div className="screen">
      <header className="topbar">
        <h1 className="topbar__title">{label}</h1>
      </header>
      <div className="screen__body">
        <p className="body-muted">Раздел «{label}» появится в ближайших шагах.</p>
      </div>
    </div>
  );
}