import React from 'react';
import { Line, Bar } from 'react-chartjs-2';
// 중요: Chart.js 구성 요소들을 여기서 다시 한번 명확히 등록합니다.
import { 
  Chart as ChartJS, 
  CategoryScale, 
  LinearScale, 
  PointElement, 
  LineElement, 
  BarElement, 
  Title, 
  Tooltip, 
  Legend, 
  Filler 
} from 'chart.js';
import { LINE_COLORS, TIME_LABELS } from '@/constants/subway';

// 차트 구성 요소 등록
ChartJS.register(
  CategoryScale, 
  LinearScale, 
  PointElement, 
  LineElement, 
  BarElement, 
  Title, 
  Tooltip, 
  Legend, 
  Filler
);

const Dashboard = ({ state }) => {
  const { 
    analysisMode, 
    selectedStation, 
    detailData, 
    isComparing, 
    compareResults, 
    compareStations 
  } = state;

  // 공통 차트 옵션 (중복 생성 에러 방지용 설정 포함)
  const commonOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false, // 애니메이션을 끄면 렌더링 충돌이 줄어듭니다.
    plugins: {
      legend: { display: false },
    },
  };

  const renderSingleDashboard = () => {
    if (!selectedStation || !detailData) return <div className="placeholder-guide">역을 선택하여 상세 분석을 확인하세요.</div>;

    return (
      <div className="consulting-dashboard">
        <div className="kpi-section-title">📊 핵심 입지 지표 (Core KPI)</div>
        <div className="core-kpi-grid">
          <div className="card"><span>입지</span><strong>A+</strong></div>
          <div className="card"><span>일 유동량</span><strong>약 {(selectedStation.on_total / 30 / 10000).toFixed(1)}만</strong></div>
          <div className="card highlight">
            <span>오전 순유입</span>
            <strong style={{ color: (detailData.on_hourly?.[3] - detailData.off_hourly?.[3]) > 0 ? '#ff4d4f' : '#1890ff' }}>
               {(detailData.on_hourly?.[3] - detailData.off_hourly?.[3] || 0).toLocaleString()}
            </strong>
          </div>
          <div className="card"><span>경쟁 강도</span><strong>{detailData.insight?.competition || '보통'}</strong></div>
        </div>

        <div className="kpi-section-title">🔍 상권 운영 패턴 분석</div>
        <div className="pattern-row">
          <div className="card wide">
            <h4>📈 실시간 상권 활성도</h4>
            <div className="chart-container-small" style={{ height: '200px' }}>
              <Line 
                data={{ 
                  labels: TIME_LABELS, 
                  datasets: [{ 
                    label: '유동량', 
                    data: (detailData.on_hourly || []).map((v, i) => v + (detailData.off_hourly?.[i] || 0)), 
                    borderColor: LINE_COLORS[selectedStation.line], 
                    backgroundColor: `${LINE_COLORS[selectedStation.line]}11`,
                    fill: true, 
                    tension: 0.4
                  }] 
                }} 
                options={commonOptions} 
              />
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderCompareDashboard = () => {
    if (!isComparing || compareResults.length === 0) return <div className="placeholder-guide">비교 분석 시작 버튼을 눌러주세요.</div>;

    return (
      <div className="compare-dashboard">
        <div className="compare-row three-column">
          {compareStations.map((station, idx) => {
            const data = compareResults[idx];
            if (!data) return null;
            return (
              <div key={`${station.역명}-${idx}`} className="compare-result-card card">
                <h3>{station.역명} <small>({station.line}호선)</small></h3>
                <div className="mini-chart" style={{ height: '150px' }}>
                  <Bar 
                    data={{ 
                      labels: ['평일', '주말'], 
                      datasets: [{ 
                        data: [data.comparison?.weekday || 0, data.comparison?.holiday || 0], 
                        backgroundColor: LINE_COLORS[station.line] 
                      }] 
                    }} 
                    options={commonOptions}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <section className="report-content-area">
      {analysisMode === 'single' ? renderSingleDashboard() : renderCompareDashboard()}
    </section>
  );
};

export default Dashboard;