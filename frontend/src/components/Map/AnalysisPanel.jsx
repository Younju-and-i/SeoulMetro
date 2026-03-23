// (지도 옆 상단 요약창)
import { LINE_COLORS } from '@/constants/subway';

const AnalysisPanel = ({ state, actions }) => {
  const { analysisMode, selectedStation, detailData, compareStations } = state;
  const { setAnalysisMode, setCompareStations, setIsComparing, setCompareResults, startComparison } = actions;

  return (
    <div className="summary-overlay-card">
      <div className="analysis-tabs">
        <button className={`tab-btn ${analysisMode === 'single' ? 'active' : ''}`} onClick={() => setAnalysisMode('single')}>단일 분석</button>
        <button className={`tab-btn ${analysisMode === 'compare' ? 'active' : ''}`} onClick={() => setAnalysisMode('compare')}>복수 비교</button>
      </div>
      <div className="tab-content">
        {analysisMode === 'single' ? (
          selectedStation ? (
            <div className="summary-content">
              <span className="line-tag" style={{backgroundColor: LINE_COLORS[selectedStation.line]}}>{selectedStation.line}호선</span>
              <h2>{selectedStation.역명}역 입지 리포트</h2>
              <div className="kpi-summary-box">
                  <div className="kpi-item"><span>상권 유형</span><strong>{detailData?.insight?.type || '오피스형'}</strong></div>
                  <div className="kpi-item"><span>성장성</span><strong>{detailData?.insight?.growth || 'High'}</strong></div>
                  {/* ... 추천 결과 UI 생략 ... */}
              </div>
            </div>
          ) : <div className="placeholder-guide">역을 선택하세요.</div>
        ) : (
          <div className="compare-setup-panel">
            <h4>분석 후보지 (최대 3개)</h4>
            <div className="compare-stations-list">
              {compareStations.map((s, i) => (
                <div key={`${s.역명}-${i}`} className="comp-item-tag">
                  <span className="idx" style={{backgroundColor: LINE_COLORS[s.line]}}>{i+1}</span> 
                  {s.역명} <button onClick={() => {
                    setCompareStations(p => p.filter((_, idx) => idx !== i));
                    setIsComparing(false); 
                    setCompareResults([]); 
                  }}>×</button>
                </div>
              ))}
            </div>
            {compareStations.length >= 2 && <button className="start-btn" onClick={startComparison}>비교 분석 시작</button>}
          </div>
        )}
      </div>
    </div>
  );
};

export default AnalysisPanel;