// (좌측 검색 및 목록)
import { LINE_COLORS } from '@/constants/subway';

const Sidebar = ({ state, actions }) => {
  const { 
    selectedMonth, availableMonths, selectedDay, 
    selectedLine, searchTerm, filteredStations, analysisMode,
    selectedStation, compareStations 
  } = state;

  const { 
    setSelectedMonth, setSelectedDay, setSelectedLine, 
    setSearchTerm, handleSelectStation 
  } = actions;

  return (
    <aside className="sidebar">
      <h2 className="logo">Semicolon <span className="point">;</span></h2>
      <div className="filter-box">
        <label>데이터 기준월</label>
        <select value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)}>
          {availableMonths.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        
        <label>분석 기준일</label>
        <select value={selectedDay} onChange={(e) => setSelectedDay(e.target.value)}>
          {Array.from({ length: 31 }, (_, i) => {
            const day = String(i + 1).padStart(2, '0');
            return <option key={day} value={day}>{day}일</option>;
          })}
        </select>

        <label>노선 선택</label>
        <select value={selectedLine} onChange={(e) => setSelectedLine(e.target.value)}>
          <option value="전체">전체 노선</option>
          {Object.keys(LINE_COLORS).map(n => <option key={n} value={n}>{n}호선</option>)}
        </select>
        <input 
          type="text" 
          placeholder="역 검색..." 
          value={searchTerm} 
          onChange={(e) => setSearchTerm(e.target.value)} 
        />
      </div>

      <div className="mini-station-list">
        {filteredStations.map((s) => {
          const isSelected = analysisMode === 'single' 
            ? selectedStation?.역명 === s.역명 && selectedStation?.line === s.line
            : compareStations.some(p => p.역명 === s.역명 && p.line === s.line);

          return (
            <div 
              key={`${s.역명}-${s.line}`} 
              className={`mini-item ${isSelected ? 'active' : ''}`} 
              onClick={() => handleSelectStation(s.역명, s.line)}
            >
              <span className="dot" style={{backgroundColor: LINE_COLORS[s.line]}}></span>
              {s.역명} <small>({s.line}호선)</small>
            </div>
          );
        })}
      </div>
    </aside>
  );
};

export default Sidebar;