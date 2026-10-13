import { useState } from 'react';
import { generateWorkout, type GeneratedWorkout } from '@gymix/generator';
import type { GeneratorMuscleGroup, VolumeLevel, WorkoutType } from '@gymix/structures';
import { TabBar } from './components/TabBar';
import { useDb } from './hooks/useDb';
import { isMgs } from './lib/workoutTypes';
import { getCatalog } from './lib/catalog';
import type { Draft } from './lib/draft';
import type { ResumedSession } from './lib/session';
import { workoutFromTemplate } from './lib/templates';
import { withViewTransition } from './lib/viewTransition';
import { ExecuteScreen, type FinishPayload } from './screens/ExecuteScreen';
import { FinishScreen } from './screens/FinishScreen';
import { HistoryScreen } from './screens/HistoryScreen';
import { ManualScreen } from './screens/ManualScreen';
import { MgsGroupScreen } from './screens/MgsGroupScreen';
import { PreviewScreen } from './screens/PreviewScreen';
import { ProgressScreen } from './screens/ProgressScreen';
import { RandomizerScreen } from './screens/RandomizerScreen';
import { RecordScreen } from './screens/RecordScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { StructureScreen } from './screens/StructureScreen';
import { TemplatesScreen } from './screens/TemplatesScreen';
import { TypeScreen } from './screens/TypeScreen';
import { VolumeScreen } from './screens/VolumeScreen';
import { WorkoutsScreen } from './screens/WorkoutsScreen';

const TABS = [
  {
    id: 'workouts',
    label: 'Тренировки',
    icon: <span className="tabbar__glyph tabbar__glyph--dumbbell" />,
  },
  {
    id: 'progress',
    label: 'Прогресс',
    icon: <span className="tabbar__glyph tabbar__glyph--rise" />,
  },
  {
    id: 'profile',
    label: 'Профиль',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <circle cx="12" cy="8" r="3.5" />
        <path d="M5 19c0-3.6 3.1-5.5 7-5.5s7 1.9 7 5.5" strokeLinecap="round" />
      </svg>
    ),
  },
];

type Step = 'home' | 'type' | 'mgs' | 'volume' | 'structure' | 'manual' | 'randomizer' | 'preview' | 'execute' | 'finish';
type Nullable<T> = T | undefined;

/** Подэкраны поверх вкладок: история, запись тренировки, шаблоны. */
type Sub = { kind: 'history' } | { kind: 'record'; id: string } | { kind: 'templates' };

function randomSeed(): number {
  return Math.floor(Math.random() * 0xffffffff);
}

export function App() {
  const { db } = useDb();
  const [tab, setTab] = useState('workouts');

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
  const [sub, setSub] = useState<Nullable<Sub>>(undefined);

  const exitBuilder = () => {
    setStep('home');
    setStepMgsGroup(undefined);
    setStepVolume('Стандартная');
    setGenerated(undefined);
    setFinished(undefined);
    setResume(undefined);
    setFromTemplate(false);
    setSelections({});
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

  const openHistory = () => setSub({ kind: 'history' });
  const openTemplates = () => setSub({ kind: 'templates' });
  const openRecord = (id: string) => setSub({ kind: 'record', id });

  // «Главная → Формат»: лаймовая кнопка перелетает в нижнюю «Продолжить»,
  // остальной экран мягко перекрёстно затухает (View Transitions API).
  const openFormats = () => withViewTransition(() => setStep('type'));
  const closeFormats = () => withViewTransition(() => setStep('home'));

  const openTemplate = async (templateId: string) => {
    if (db === undefined) return;
    try {
      const workout = await workoutFromTemplate(db, templateId);
      setFromTemplate(true);
      setGenerated(workout);
      setStep('preview');
    } catch {
      // Безобидный фолбэк: остаёмся на главной при сбое чтения шаблона.
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
      setStep('manual');
    } catch {
      // Безобидный фолбэк: остаёмся на главной при сбое чтения шаблона.
    }
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
          setStep('structure');
        }}
        onBack={() => setStep(isMgs(stepType) ? 'mgs' : 'type')}
      />
    );
  } else if (step === 'structure') {
    body = (
      <StructureScreen
        draft={draft}
        onBackVolume={() => setStep('volume')}
        onBack={() => setStep('volume')}
        onManual={() => setStep('manual')}
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
        onBack={() => setStep('structure')}
      />
    );
  } else if (step === 'preview' && generated) {
    body = (
      <PreviewScreen
        workout={generated}
        draft={draft}
        onStart={() => setStep('execute')}
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
        onEditSelection={() => {
          const next: Record<string, string> = {};
          for (const entry of generated.entries) next[entry.slotKey] = entry.exercise.name;
          setSelections(next);
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
            setStep('randomizer');
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
  } else if (sub?.kind === 'templates') {
    body = (
      <TemplatesScreen
        onBack={() => setSub(undefined)}
        onOpenTemplate={(templateId) => void openTemplate(templateId)}
        onEditTemplate={(templateId) => void openTemplateEdit(templateId)}
        onCreate={() => {
          setSub(undefined);
          setStep('type');
        }}
      />
    );
  } else if (sub?.kind === 'record') {
    body = <RecordScreen sessionId={sub.id} onBack={openHistory} />;
  } else if (sub?.kind === 'history') {
    body = <HistoryScreen onBack={() => setSub(undefined)} onOpen={openRecord} />;
  } else if (tab === 'workouts') {
    body = (
      <WorkoutsScreen
        onCreate={openFormats}
        onOpenActivity={openHistory}
        onOpenSession={openRecord}
        onResume={(session) => {
          setResume(session);
          setStep('execute');
        }}
      />
    );
  } else if (tab === 'profile') {
    body = <SettingsScreen onOpenHistory={openHistory} onOpenTemplates={openTemplates} />;
  } else if (tab === 'progress') {
    body = <ProgressScreen />;
  } else {
    body = <SoonScreen tab={tab} />;
  }

  return (
    <div className="app">
      <main className={`app__main${step === 'home' && sub === undefined ? ' app__main--tabs' : ''}`}>{body}</main>
      {step === 'home' && sub === undefined && <TabBar tabs={TABS} active={tab} onChange={openTab} />}
    </div>
  );
}

function SoonScreen({ tab }: { tab: string }) {
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