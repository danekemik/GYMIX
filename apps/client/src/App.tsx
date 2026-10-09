import { useState } from 'react';
import type { GeneratorMuscleGroup, VolumeLevel, WorkoutType } from '@gymix/structures';
import type { GeneratedWorkout } from '@gymix/generator';
import { TabBar } from './components/TabBar';
import { DbProvider } from './hooks/useDb';
import { isMgs } from './lib/workoutTypes';
import type { Draft } from './lib/draft';
import { ExecuteScreen } from './screens/ExecuteScreen';
import { MgsGroupScreen } from './screens/MgsGroupScreen';
import { PreviewScreen } from './screens/PreviewScreen';
import { RandomizerScreen } from './screens/RandomizerScreen';
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

type Step = 'home' | 'type' | 'mgs' | 'volume' | 'structure' | 'randomizer' | 'preview' | 'execute';
type Nullable<T> = T | undefined;

function randomSeed(): number {
  return Math.floor(Math.random() * 0xffffffff);
}

export function App() {
  const [tab, setTab] = useState('workouts');

  const [step, setStep] = useState<Step>('home');
  const [stepType, setStepType] = useState<WorkoutType>('Full Body');
  const [stepMgsGroup, setStepMgsGroup] = useState<Nullable<GeneratorMuscleGroup>>(undefined);
  const [stepVolume, setStepVolume] = useState<VolumeLevel>('Стандартная');
  const [seed, setSeed] = useState<number>(randomSeed);
  const [generated, setGenerated] = useState<Nullable<GeneratedWorkout>>(undefined);

  const exitBuilder = () => {
    setStep('home');
    setStepMgsGroup(undefined);
    setStepVolume('Стандартная');
    setGenerated(undefined);
  };

  const startBuilder = (type: WorkoutType) => {
    setStepType(type);
    setStepMgsGroup(undefined);
    setStepVolume('Стандартная');
    setStep(isMgs(type) ? 'mgs' : 'volume');
  };

  const draft: Draft = {
    type: stepType,
    volume: stepVolume,
    ...(stepMgsGroup ? { mgsGroup: stepMgsGroup } : {}),
  };

  const openTab = (id: string) => {
    setTab(id);
    if (step !== 'home') exitBuilder();
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
        onContinue={() => setStep('structure')}
        onBack={() => setStep(isMgs(stepType) ? 'mgs' : 'type')}
      />
    );
  } else if (step === 'structure') {
    body = (
      <StructureScreen
        draft={draft}
        onBackVolume={() => setStep('volume')}
        onBack={() => setStep('volume')}
        onGenerate={() => {
          setSeed(randomSeed());
          setGenerated(undefined);
          setStep('randomizer');
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
        onStart={() => setStep('execute')}
        onRegenerate={() => {
          setSeed(randomSeed());
          setStep('randomizer');
        }}
        onBack={() => setStep('randomizer')}
      />
    );
  } else if (step === 'execute' && generated) {
    body = <ExecuteScreen workout={generated} onFinish={exitBuilder} onExit={exitBuilder} />;
  } else if (tab === 'workouts') {
    body = (
      <WorkoutsScreen
        onStart={startBuilder}
        onCreate={() => setStep('type')}
        onOpenProfile={() => openTab('profile')}
      />
    );
  } else {
    body = <SoonScreen tab={tab} />;
  }

  return (
    <DbProvider>
      <div className="app">
        <main className="app__main">{body}</main>
        {step === 'home' && <TabBar tabs={TABS} active={tab} onChange={openTab} />}
      </div>
    </DbProvider>
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