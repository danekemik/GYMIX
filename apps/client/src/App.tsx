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
import { ExecuteScreen, type FinishPayload } from './screens/ExecuteScreen';
import { FinishScreen } from './screens/FinishScreen';
import { HistoryScreen } from './screens/HistoryScreen';
import { ManualScreen } from './screens/ManualScreen';
import { MgsGroupScreen } from './screens/MgsGroupScreen';
import { PreviewScreen } from './screens/PreviewScreen';
import { RandomizerScreen } from './screens/RandomizerScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { StructureScreen } from './screens/StructureScreen';
import { TypeScreen } from './screens/TypeScreen';
import { VolumeScreen } from './screens/VolumeScreen';
import { WorkoutsScreen } from './screens/WorkoutsScreen';

const TABS = [
  {
    id: 'workouts',
    label: 'Тренировки',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M4 8v8M6 6v12M8.5 8.5v7M15.5 8.5v7M18 6v12M20 8v8" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: 'progress',
    label: 'Прогресс',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: 'history',
    label: 'История',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3.5 2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
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
    if (step !== 'home') exitBuilder();
  };

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

  let body;
  if (step === 'type') {
    body = (
      <TypeScreen
        onSelect={startBuilder}
        onClose={() => setStep('home')}
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
        onOpenHistory={() => openTab('history')}
        onOpenTemplates={() => {
          localStorage.setItem('gymix:home-segment', 'mine');
          setTab('workouts');
          setStep('home');
        }}
      />
    );
  } else if (tab === 'workouts') {
    body = (
      <WorkoutsScreen
        onStart={startBuilder}
        onCreate={() => setStep('type')}
        onOpenProfile={() => openTab('profile')}
        onOpenActivity={() => openTab('history')}
        onOpenTemplate={(templateId) => void openTemplate(templateId)}
        onResume={(session) => {
          setResume(session);
          setStep('execute');
        }}
      />
    );
  } else if (tab === 'history') {
    body = <HistoryScreen />;
  } else if (tab === 'profile') {
    body = <SettingsScreen />;
  } else {
    body = <SoonScreen tab={tab} />;
  }

  return (
    <div className="app">
      <main className="app__main">{body}</main>
      {step === 'home' && <TabBar tabs={TABS} active={tab} onChange={openTab} />}
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