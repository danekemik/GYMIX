import { useState } from 'react';
import type { GeneratorMuscleGroup, VolumeLevel, WorkoutType } from '@gymix/structures';
import { TabBar } from './components/TabBar';
import { DbProvider } from './hooks/useDb';
import { isMgs } from './lib/workoutTypes';
import type { Draft } from './lib/draft';
import { MgsGroupScreen } from './screens/MgsGroupScreen';
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

type Step = 'home' | 'type' | 'mgs' | 'volume' | 'structure';
type Nullable<T> = T | undefined;

export function App() {
  const [tab, setTab] = useState('workouts');

  const [step, setStep] = useState<Step>('home');
  const [stepType, setStepType] = useState<WorkoutType>('Full Body');
  const [stepMgsGroup, setStepMgsGroup] = useState<Nullable<GeneratorMuscleGroup>>(undefined);
  const [stepVolume, setStepVolume] = useState<VolumeLevel>('Стандартная');

  const exitBuilder = () => {
    setStep('home');
    setStepMgsGroup(undefined);
    setStepVolume('Стандартная');
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
      />
    );
  } else {
    body = (
      <WorkoutsScreen
        onStart={startBuilder}
        onCreate={() => setStep('type')}
      />
    );
  }

  return (
    <DbProvider>
      <div className="app">
        <main className="app__main">{body}</main>
        {step === 'home' && <TabBar tabs={TABS} active={tab} onChange={setTab} />}
      </div>
    </DbProvider>
  );
}