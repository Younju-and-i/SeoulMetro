import TotalFlowChart from "./TotalFlowChart";
import TopStationsChart from "./TopStationsChart";
import TimeChart from "./TimeChart";
import HolidayChart from "./HolidayChart";
import StationChart from "./StationChart";

function App() {
  return (
    <div>
      <h1>🚇 지하철 대시보드</h1>

      <TotalFlowChart />
      <TopStationsChart />
      <TimeChart />
      <HolidayChart />
      <StationChart />
    </div>
  );
}

export default App;