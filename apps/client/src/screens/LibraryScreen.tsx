import { Segmented } from '../components/Segmented';
import { SettingsButton } from '../components/SettingsButton';
import { HistoryScreen } from './HistoryScreen';
import { TemplatesScreen } from './TemplatesScreen';

interface Props {
  onSettings: () => void;
  onCreate: () => void;
  onOpenSession: (id: string) => void;
  onOpenTemplate: (id: string) => void;
  onEditTemplate: (id: string) => void;
  view: 'saved' | 'history';
  onViewChange: (value: 'saved' | 'history') => void;
}
export function LibraryScreen({ onSettings, onCreate, onOpenSession, onOpenTemplate, onEditTemplate, view, onViewChange }: Props) {
  return <div className="screen library">
    <header className="topbar"><h1 className="topbar__title">Тренировки</h1><SettingsButton onClick={onSettings} /></header>
    <div className="library__switch"><Segmented label="Тренировки" value={view} onChange={onViewChange} options={[{ value: 'saved', label: 'Сохранённые' }, { value: 'history', label: 'История' }]} /></div>
    {view === 'saved' ? <TemplatesScreen onOpenTemplate={onOpenTemplate} onEditTemplate={onEditTemplate} onCreate={onCreate} /> : <HistoryScreen onOpen={onOpenSession} onStart={onCreate} />}
  </div>;
}
