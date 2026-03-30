import React, { useEffect, useCallback, useMemo } from 'react';
import { Line } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, Filler, RadialLinearScale } from 'chart.js';
import api from '@api/config.js';
import { LINE_COLORS } from '@constants/subway.js';
import { useSubwayData } from '@hooks/useMapData.js';
import Sidebar from '@components/Map/Sidebar.jsx';
import Heatmap from '@components/Map/Heatmap.jsx';
import ComparisonReport from '@components/Map/ComparisonReport.jsx'; // 분리된 컴포넌트 임포트
import '@styles/App.css';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, Filler, RadialLinearScale);

const MapPage = () => {
  const { state, actions, refs } = useSubwayData();

  // 1. 역 선택 핸들러 (지도 중심 이동 로직 추가)
  const handleSelectStation = useCallback((name, line) => {
    const target = Object.values(state.lineData).flat().find(s => s.display_name === name && s.line === line);
    if (!target) return;

    // --- 지도 중심 이동 추가 ---
    if (refs.mapRef.current) {
      const moveLatLon = new window.kakao.maps.LatLng(target.lat, target.lng);
      refs.mapRef.current.setCenter(moveLatLon);
    }

    if (state.analysisMode === 'single') {
      actions.setTempSelectedStation(target);
      actions.setDetailData(null);
    } else {
      actions.setTempCompareStations(prev => {
        const isExist = prev.find(p => p.display_name === name && p.line === line);
        if (isExist) return prev.filter(p => p.display_name !== name || p.line !== line);
        return prev.length >= 3 ? [...prev.slice(1), target] : [...prev, target];
      });
    }
  }, [state.lineData, state.analysisMode, actions, refs]);

  // 2. 단일 역 분석 실행
  const handleRunAnalysis = useCallback(async () => {
    if (!state.tempSelectedStation || !state.selectedMonth) return;
    try {
      actions.setIsLoading(true);
      const stnName = state.tempSelectedStation.display_name;
      const lineNum = state.tempSelectedStation.line_num;
      const targetMonth = state.selectedMonth.substring(0, 7);
      const targetYear = targetMonth.split('-')[0];
      
      const [metricsRes, chartRes, heatmapRes] = await Promise.all([
        api.get('station/metrics', { params: { station_name: stnName, line_num: lineNum, target_year: targetYear } }),
        api.get('station/chart-data', { params: { station_name: stnName, line_num: lineNum, target_month: targetMonth } }),
        api.get('station/heatmap', { params: { station_name: stnName, target_month: targetMonth } })
      ]);
      
      const m = metricsRes.data;
      if (m.error) return alert(m.error);

      actions.setDetailData({
        stationInfo: state.tempSelectedStation,
        metrics: { ...m, v2019: m.v2019 || 0, v2020: m.v2020 || 0, recovery_rate: m.recovery_rate || 0 },
        insight: {
          score: m.analysis_score, grade: m.location_grade, type: m.commercial_type, insight_text: m.insight_text,
          recommendations: m.recommendations || [{ category: "분석 중", desc: "데이터 로딩 중..." }]
        },
        hourly_pattern: chartRes.data,
        heatmap: Array.isArray(heatmapRes.data) ? heatmapRes.data : []
      });
    } catch (error) { 
      alert("데이터 분석 중 오류가 발생했습니다."); 
    } finally { 
      actions.setIsLoading(false); 
    }
  }, [state.tempSelectedStation, state.selectedMonth, actions]);

  // 3. 비교 분석 실행 (데이터 박제 로직 적용)
  const startComparison = useCallback(() => {
    if (state.tempCompareStations.length < 2) return alert("비교할 역을 2개 이상 선택해주세요.");
    actions.setIsLoading(true);
    const targetYear = state.selectedMonth.split('-')[0];
    const requests = state.tempCompareStations.map(s => 
    api.get('station/metrics', { 
      params: { 
        station_name: s.display_name, 
        line_num: s.line,
        target_year: targetYear } })
    );

    Promise.all(requests)
      .then(responses => {
        // 분석 버튼을 누른 '그 시점'의 역 정보를 박제하여 저장
        const resultsWithInfo = responses.map((res, idx) => ({
          ...res.data,
          stationInfo: state.tempCompareStations[idx] 
        }));
        actions.setCompareResults(resultsWithInfo);
      })
      .catch(err => console.error(err))
      .finally(() => actions.setIsLoading(false));
  }, [state.tempCompareStations, state.selectedMonth, actions]);

  // 4. 지도 마커 업데이트
  useEffect(() => {
    if (!refs.mapRef.current || !state.mapLoaded) return;
    refs.overlaysRef.current.forEach(ol => ol.setMap(null));
    refs.overlaysRef.current = [];

    state.filteredStations.forEach(s => {
      const isSelected = state.analysisMode === 'single' 
        ? (state.tempSelectedStation?.display_name === s.display_name && state.tempSelectedStation?.line === s.line) 
        : state.tempCompareStations.some(p => p.display_name === s.display_name && p.line === s.line);
      
      const color = LINE_COLORS[s.line] || '#333';
      const content = document.createElement('div');
      content.className = 'map-marker';
      content.style.cssText = `width: ${isSelected ? '20px' : '12px'}; height: ${isSelected ? '20px' : '12px'}; background: ${isSelected ? color : 'white'}; border: 2px solid ${color}; border-radius: 50%; cursor: pointer; z-index: ${isSelected ? 10 : 1};`;
      
      content.onclick = () => handleSelectStation(s.display_name, s.line);
      
      const overlay = new window.kakao.maps.CustomOverlay({ 
        position: new window.kakao.maps.LatLng(s.lat, s.lng), 
        content, 
        yAnchor: 0.5 
      });
      overlay.setMap(refs.mapRef.current);
      refs.overlaysRef.current.push(overlay);
    });
  }, [state.filteredStations, state.tempSelectedStation, state.tempCompareStations, state.mapLoaded, state.analysisMode, handleSelectStation, refs]);

  // 5. 시간대별 차트 데이터 처리
  const processedChartData = useMemo(() => {
    if (!state.detailData?.hourly_pattern || !Array.isArray(state.detailData.hourly_pattern) || state.detailData.hourly_pattern.length === 0) return { labels: [], datasets: [] };
    const sortedData = [...state.detailData.hourly_pattern].sort((a, b) => a.hour - b.hour);
    return {
      labels: sortedData.map(d => `${d.hour}시`),
      datasets: [
        { label: '평균 승차', data: sortedData.map(d => d.avg_on ?? 0), borderColor: '#1890ff', backgroundColor: 'rgba(24, 144, 255, 0.1)', fill: true, tension: 0.4, pointRadius: 2 },
        { label: '평균 하차', data: sortedData.map(d => d.avg_off ?? 0), borderColor: '#ff4d4f', backgroundColor: 'rgba(255, 77, 79, 0.1)', fill: true, tension: 0.4, pointRadius: 2 }
      ]
    };
  }, [state.detailData]);

  return (
    <div className={`consulting-layout ${state.isLoading ? 'is-loading' : ''}`}>
      {state.isLoading && (
        <div className="loading-overlay">
          <div className="loader-content"><div className="spinner"></div><p>데이터 로딩 중...</p></div>
        </div>
      )}

      <Sidebar state={state} actions={actions} onSelectStation={handleSelectStation} />

      <main className="report-main">
        <header className="main-header">
          <div className="header-title-group">
            <h1>Franchise Location Strategy Report</h1>
            <div className="header-info">상권 컨설팅 데이터 리포트 ({state.selectedMonth})</div>
          </div>
          {state.analysisMode === 'single' && state.detailData && (
            <div className="score-summary-card">
              <div className="score-item"><span className="label">상권 분석 점수</span><span className="value">{state.detailData.insight.score}<small>/100</small></span></div>
              <div className="grade-badge">Grade {state.detailData.insight.grade}</div>
            </div>
          )}
        </header>

        <section className="top-visual-row">
          <div id="map" className="map-card" ref={(el) => { 
            if (el && state.mapLoaded && !refs.mapRef.current) { 
              refs.mapRef.current = new window.kakao.maps.Map(el, { center: new window.kakao.maps.LatLng(37.5665, 127.02), level: 7 }); 
            } 
          }} />
          <div className="summary-overlay-card">
            <div className="analysis-tabs">
              <button className={`tab-btn ${state.analysisMode === 'single' ? 'active' : ''}`} onClick={() => actions.setAnalysisMode('single')}>단일 분석</button>
              <button className={`tab-btn ${state.analysisMode === 'compare' ? 'active' : ''}`} onClick={() => actions.setAnalysisMode('compare')}>복수 비교</button>
            </div>
            <div className="tab-content">
              {state.analysisMode === 'single' ? (
                state.tempSelectedStation ? (
                  <div className="summary-content">
                    <span className="dot" style={{ backgroundColor: LINE_COLORS[state.tempSelectedStation.line] }}></span>
                    <strong className="summary-title">{state.tempSelectedStation.display_name} 입지 리포트</strong>
                    <div className="kpi-summary-box">
                      <div className="recommend-box">상권 성격: <strong>{state.detailData?.insight?.type || '분석 대기'}</strong></div>
                      <p className="recovery-text">위기 방어 지수 (Recovery): <strong>{state.detailData?.metrics?.recovery_rate ? `${(state.detailData.metrics.recovery_rate * 100).toFixed(1)}%` : '-'}</strong></p>
                      <div className="recommend-title">🚀 상권 추천 업종</div>
                      <div className="recommendation-list">
                        {state.detailData?.insight?.recommendations?.slice(0, 2).map((rec, idx) => (
                          <div key={idx} className="recommend-card"><strong>{rec.category}</strong><p>{rec.desc}</p></div>
                        ))}
                      </div>
                      <button className="start-btn" onClick={handleRunAnalysis}>상권 구조 분석 시작</button>
                    </div>
                  </div>
                ) : <div className="placeholder-guide">좌측에서 역을 선택하면 상세 리포트가 생성됩니다.</div>
              ) : (
                <div className="compare-setup-panel">
                  <h4>분석 후보지 (최대 3개)</h4>
                  <div className="compare-stations-list">
                    {state.tempCompareStations.map((s, i) => (
                      <div key={i} className="comp-item-tag">
                        <span className="idx" style={{ backgroundColor: LINE_COLORS[s.line] }}>{i + 1}</span>
                        {s.display_name} <button onClick={() => actions.setTempCompareStations(p => p.filter((_, idx) => idx !== i))}>×</button>
                      </div>
                    ))}
                    {state.tempCompareStations.length === 0 && <p className="placeholder-guide">지도의 마커를 클릭하여 후보지를 추가하세요.</p>}
                  </div>
                  {state.tempCompareStations.length >= 2 && <button className="start-btn" onClick={startComparison}>비교 분석 시작</button>}
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="report-content-area">
          {state.analysisMode === 'single' && state.detailData && (
            <div className="dashboard-rows">
              <div className="kpi-grid">
                {[
                  { label: "입지 등급", val: state.detailData.insight.grade },
                  { label: "평일 유동량", val: state.detailData.metrics.weekday_avg?.toLocaleString() + "명" },
                  { label: "전년 대비 성장", val: `${state.detailData.metrics.growth_rate > 0 ? '▲' : '▼'} ${Math.abs(state.detailData.metrics.growth_rate)}%`, color: state.detailData.metrics.growth_rate >= 0 ? '#ff4d4f' : '#1890ff' },
                  { label: "증감 수치", val: `${state.detailData.metrics.diff_amount?.toLocaleString()}명` },
                  { label: "상권 성숙도", val: state.detailData.metrics.market_maturity }
                ].map((kpi, i) => (
                  <div key={i} className="card kpi-card"><span className="kpi-label">{kpi.label}</span><strong className="kpi-value" style={{ color: kpi.color }}>{kpi.val}</strong></div>
                ))}
              </div>
              <div className="grid-2">
                <div className="card h-auto"><h3>📅 일별 활성도 추이 (Heatmap)</h3><Heatmap data={state.detailData.heatmap} /></div>
                <div className="card h-auto">
                  <h3>💡 분석 포인트</h3>
                  <div className="insight-message">{state.detailData.insight.insight_text}</div>
                  <div style={{marginTop: '20px'}}><p style={{fontSize: '13px'}}><strong>추천 전략:</strong> {state.detailData.metrics.market_maturity === '정체/쇠퇴기' ? '기존 고객 유지 및 효율화 전략' : '적극적인 마케팅 권장'}</p></div>
                </div>
              </div>
              <div className="grid-2">
                <div className="card"><h3>🔍 시간대별 평균 활성도 패턴</h3><div className="chart-h"><Line data={processedChartData} options={{ responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, ticks: { callback: v => v.toLocaleString() } } } }} /></div></div>
                <div className="card">
                  <h3>🛡️ 위기 대응력 (COVID 데이터)</h3>
                  <div className="chart-h" style={{height: '200px'}}><Line data={{ labels: ['Pre-COVID (19)', 'Shock (20)'], datasets: [{ data: [state.detailData.metrics.v2019, state.detailData.metrics.v2020], borderColor: '#ff4d4f', backgroundColor: 'rgba(255, 77, 79, 0.1)', fill: true }] }} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { min: 0, max: 210000 } } }} /></div>
                  <div className="recovery-progress-container">
                    <div className="progress-info"><span>Shock Defense Level</span><span>{Math.round((state.detailData.metrics.recovery_rate || 0) * 100)}%</span></div>
                    <div className="progress-bar-bg"><div className="progress-bar-fill" style={{ width: `${Math.min((state.detailData.metrics.recovery_rate || 0) * 100, 100)}%`, background: state.detailData.metrics.recovery_rate > 0.8 ? '#52c41a' : '#faad14' }} /></div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 6. 비교 분석 리포트 (수정된 컴포넌트 호출) */}
          {state.analysisMode === 'compare' && state.compareResults.length > 0 && (
            <ComparisonReport results={state.compareResults} />
          )}
        </section>
      </main>
    </div>
  );
};

export default MapPage;