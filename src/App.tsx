import { useStore } from './state/store';
import { CityMap } from './ui/CityMap';
import { CrewRoom } from './ui/CrewRoom';
import { Execution } from './ui/Execution';
import { PlanningBoard } from './ui/PlanningBoard';
import { NewsRoom, Report } from './ui/Report';
import { TargetBoard } from './ui/TargetBoard';
import { Title } from './ui/Title';

/** One screen at a time. The store owns which one. */
export function App() {
  const { screen, campaign } = useStore();

  if (!campaign || screen === 'title') {
    return (
      <div className="app">
        <Title />
      </div>
    );
  }

  return (
    <div className="app">
      {screen === 'city' ? <CityMap /> : null}
      {screen === 'target' ? <TargetBoard /> : null}
      {screen === 'crew' ? <CrewRoom /> : null}
      {screen === 'plan' ? <PlanningBoard /> : null}
      {screen === 'execute' ? <Execution /> : null}
      {screen === 'report' ? <Report /> : null}
      {screen === 'news' ? <NewsRoom /> : null}
    </div>
  );
}
