import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { Line, Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement,
  BarElement, Title, Tooltip, Legend, Filler, RadialLinearScale
} from 'chart.js';

import api from '@/api/config';
import { LINE_COLORS, TIME_LABELS } from '@/constants/subway';
import '@/styles/App.css';

ChartJS.register(
  CategoryScale, LinearScale, PointElement, LineElement, 
  BarElement, Title, Tooltip, Legend, Filler, RadialLinearScale
);

const Map = () => {
  const [mapLoaded, setMapLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [analysisMode, setAnalysisMode] = useState('single'); 
  const [lineData, setLineData] = useState({});
  const [availableMonths, setAvailableMonths] = useState([]);
  const [selectedLine, setSelectedLine] = useState('전체');
  const [selectedMonth, setSelectedMonth] = useState('');
  const [tempSelectedStation, setTempSelectedStation] = useState(null);
  const [tempCompareStations, setTempCompareStations] = useState([]);
  const [detailData, setDetailData] = useState(null); 
  const [compareResults, setCompareResults] = useState([]);
  const mapRef = useRef(null);
  const overlaysRef = useRef([]);

  const loadingMessage = useMemo(() => {
    if (analysisMode === 'compare') return "복수 역 데이터 분석 중...";
    if (analysisMode === 'single' && tempSelectedStation && !detailData) return "상권 핵심 지표 산출 중...";
    return "데이터 로드 중...";
  }, [analysisMode, tempSelectedStation, detailData]);

  const processedChartData = useMemo(() => {
    if (!detailData?.hourly_pattern || !Array.isArray(detailData.hourly_pattern) || detailData.hourly_pattern.length === 0) {
      return { labels: [], datasets: [] };
    }
    const sortedData = [...detailData.hourly_pattern].sort((a, b) => a.hour - b.hour);
    return {
      labels: sortedData.map(d => `${d.hour}시`),
      datasets: [
        { 
          label: '평균 승차', 
          data: sortedData.map(d => d.avg_on ?? 0), 
          borderColor: '#1890ff', 
          backgroundColor: 'rgba(24, 144, 255, 0.1)', 
          fill: true, tension: 0.4, pointRadius: 2
        },
        { 
          label: '평균 하차', 
          data: sortedData.map(d => d.avg_off ?? 0), 
          borderColor: '#ff4d4f', 
          backgroundColor: 'rgba(255, 77, 79, 0.1)', 
          fill: true, tension: 0.4, pointRadius: 2
        }
      ]
    };
  }, [detailData]);

  const renderHeatmapContent = useCallback(() => {
    if (!detailData?.heatmap || detailData.heatmap.length === 0) {
      return <div className="placeholder-chart-msg">데이터 대기 중...</div>;
    }
    const data = detailData.heatmap;
    const maxFlow = Math.max(...data.map(d => d.count || 0));
    const firstDate = new Date(data[0].date);
    let firstDayShift = firstDate.getDay();
    firstDayShift = firstDayShift === 0 ? 6 : firstDayShift - 1;

    const blanks = Array.from({ length: firstDayShift }, (_, i) => (
      <div key={`blank-${i}`} className="heatmap-blank" />
    ));

    return (
      <div className="heatmap-container">
        <div className="heatmap-header">
          {['월', '화', '수', '목', '금', '토', '일'].map(day => <div key={day}>{day}</div>)}
        </div>
        <div className="heatmap-grid">
          {blanks}
          {data.map((item) => {
            const ratio = item.count / (maxFlow || 1);
            return (
              <div 
                key={item.date} 
                className="heatmap-cell"
                style={{ background: `rgba(24, 144, 255, ${Math.max(0.1, ratio)})` }}
                title={`${item.date} (${item.day_label}): ${item.count?.toLocaleString()}명`}
              >
                <span className="heatmap-date">{new Date(item.date).getDate()}</span>
                <span className="heatmap-label">{item.day_label}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }, [detailData]);

  const handleRunAnalysis = useCallback(async () => {
    if (!tempSelectedStation || !selectedMonth) return;
    try {
      setIsLoading(true);
      const stnName = tempSelectedStation.display_name;
      const lineNum = tempSelectedStation.line_num;
      const targetMonth = selectedMonth.substring(0, 7);
      const targetYear = targetMonth.split('-')[0];
      const [metricsRes, chartRes, heatmapRes] = await Promise.all([
        api.get('station/metrics', { params: { station_name: stnName, line_num: lineNum, target_year: targetYear } }),
        api.get('station/chart-data', { params: { station_name: stnName, line_num: lineNum, target_month: targetMonth } }),
        api.get('station/heatmap', { params: { station_name: stnName, target_month: targetMonth } })
      ]);
      const m = metricsRes.data;
      if (m.error) return alert(m.error);

      setDetailData({
        stationInfo: tempSelectedStation,
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
      setIsLoading(false);
    }
  }, [tempSelectedStation, selectedMonth]);

  const startComparison = useCallback(() => {
    if (tempCompareStations.length < 2) return alert("비교할 역을 2개 이상 선택해주세요.");
    setIsLoading(true);
    const requests = tempCompareStations.map(s => api.get('station/metrics', { params: { station_name: s.display_name, line_num: s.line } }));
    Promise.all(requests)
      .then(res => setCompareResults(res.map(r => r.data)))
      .catch(err => console.error(err))
      .finally(() => setIsLoading(false));
  }, [tempCompareStations]);

  useEffect(() => {
    const KAKAO_MAP_KEY = import.meta.env.VITE_KAKAO_MAP_KEY;
    if (!window.kakao) {
      const script = document.createElement('script');
      script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_MAP_KEY}&autoload=false`;
      script.onload = () => window.kakao.maps.load(() => setMapLoaded(true));
      document.head.appendChild(script);
    } else { setMapLoaded(true); }

    api.get('available-dates').then(res => {
      const dates = Array.isArray(res.data) ? res.data : [];
      setAvailableMonths(dates);
      if (dates.length > 0) setSelectedMonth(dates[0]);
    });
  }, []);

  useEffect(() => {
    if (!selectedMonth) return;
    setIsLoading(true);
    api.get('stations').then(res => {
      const stationsArray = Array.isArray(res.data) ? res.data : (res.data.data || []);
      const grouped = {};
      stationsArray.forEach(s => {
        const l = String(s.line_num);
        if (!grouped[l]) grouped[l] = [];
        grouped[l].push({ ...s, line: l });
      });
      setLineData(grouped);
    }).finally(() => setIsLoading(false));
  }, [selectedMonth]);

  const filteredStations = useMemo(() => {
    const all = selectedLine === '전체' ? Object.values(lineData).flat() : (lineData[selectedLine] || []);
    return all
      .filter(s => (s.display_name || '').includes(searchTerm))
      .sort((a, b) => a.display_name.localeCompare(b.display_name));
  }, [lineData, selectedLine, searchTerm]);

  const handleSelectStation = useCallback((name, line) => {
    const target = Object.values(lineData).flat().find(s => s.display_name === name && s.line === line);
    if (!target) return;
    if (analysisMode === 'single') { setTempSelectedStation(target); setDetailData(null); }
    else {
      setTempCompareStations(prev => {
        const isExist = prev.find(p => p.display_name === name && p.line === line);
        if (isExist) return prev.filter(p => p.display_name !== name || p.line !== line);
        return prev.length >= 3 ? [...prev.slice(1), target] : [...prev, target];
      });
    }
  }, [lineData, analysisMode]);

  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;
    overlaysRef.current.forEach(ol => ol.setMap(null));
    overlaysRef.current = [];
    filteredStations.forEach(s => {
      const isSelected = analysisMode === 'single' 
        ? (tempSelectedStation?.display_name === s.display_name && tempSelectedStation?.line === s.line) 
        : tempCompareStations.some(p => p.display_name === s.display_name && p.line === s.line);
      const color = LINE_COLORS[s.line] || '#333';
      const content = document.createElement('div');
      content.className = 'map-marker'; // CSS에서 스타일 정의 가능
      content.style.cssText = `width: ${isSelected ? '20px' : '12px'}; height: ${isSelected ? '20px' : '12px'}; background: ${isSelected ? color : 'white'}; border: 2px solid ${color}; border-radius: 50%; cursor: pointer; z-index: ${isSelected ? 10 : 1};`;
      content.onclick = () => handleSelectStation(s.display_name, s.line);
      const overlay = new window.kakao.maps.CustomOverlay({ position: new window.kakao.maps.LatLng(s.lat, s.lng), content, yAnchor: 0.5 });
      overlay.setMap(mapRef.current);
      overlaysRef.current.push(overlay);
    });
  }, [filteredStations, tempSelectedStation, tempCompareStations, mapLoaded, analysisMode, handleSelectStation]);

  return (
    <div className={`consulting-layout ${isLoading ? 'is-loading' : ''}`}>
      {isLoading && (
        <div className="loading-overlay">
          <div className="loader-content">
            <div className="spinner"></div>
            <p>{loadingMessage}</p>
          </div>
        </div>
      )}

      <aside className="sidebar">
        <h2 className="logo">Semicolon <span className="point">;</span></h2>
        <div className="filter-box">
          <label>데이터 기준월</label>
          <select value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)}>
            {availableMonths.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <label>노선 선택</label>
          <select value={selectedLine} onChange={(e) => setSelectedLine(e.target.value)}>
            <option value="전체">전체 노선</option>
            {Object.keys(LINE_COLORS).map(n => <option key={n} value={n}>{n}호선</option>)}
          </select>
          <input type="text" placeholder="역 검색..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
        </div>
        <div className="mini-station-list">
          {filteredStations.map((s) => (
            <div key={`${s.display_name}-${s.line}`} 
                 className={`mini-item ${ (analysisMode==='single' ? tempSelectedStation?.display_name===s.display_name && tempSelectedStation?.line===s.line : tempCompareStations.some(p=>p.display_name===s.display_name && p.line===s.line)) ? 'active' : ''}`}
                 onClick={() => handleSelectStation(s.display_name, s.line)}>
              <span className="dot" style={{ backgroundColor: LINE_COLORS[s.line] }}></span>
              {s.display_name} <small>({s.line}호선)</small>
            </div>
          ))}
        </div>
      </aside>

      <main className="report-main">
        <header className="main-header">
          <div className="header-title-group">
            <h1>Franchise Location Strategy Report</h1>
            <div className="header-info">상권 컨설팅 데이터 리포트 ({selectedMonth})</div>
          </div>
          {analysisMode === 'single' && detailData && (
            <div className="score-summary-card">
              <div className="score-item">
                <span className="label">상권 분석 점수</span>
                <span className="value">{detailData.insight.score}<small>/100</small></span>
              </div>
              <div className="grade-badge">Grade {detailData.insight.grade}</div>
            </div>
          )}
        </header>

        <section className="top-visual-row">
          <div id="map" className="map-card" ref={(el) => {
            if (el && mapLoaded && !mapRef.current) {
              mapRef.current = new window.kakao.maps.Map(el, { center: new window.kakao.maps.LatLng(37.5665, 127.02), level: 7 });
            }
          }} />
          <div className="summary-overlay-card">
            <div className="analysis-tabs">
              <button className={`tab-btn ${analysisMode === 'single' ? 'active' : ''}`} onClick={() => setAnalysisMode('single')}>단일 분석</button>
              <button className={`tab-btn ${analysisMode === 'compare' ? 'active' : ''}`} onClick={() => setAnalysisMode('compare')}>복수 비교</button>
            </div>
            <div className="tab-content">
              {analysisMode === 'single' ? (
                tempSelectedStation ? (
                  <div className="summary-content">
                    <span className="dot" style={{ backgroundColor: LINE_COLORS[tempSelectedStation.line] }}></span>
                    <strong className="summary-title">{tempSelectedStation.display_name} 입지 리포트</strong>
                    <div className="kpi-summary-box">
                      <div className="recommend-box">상권 성격: <strong>{detailData?.insight?.type || '분석 대기'}</strong></div>
                      <p className="recovery-text">위기 방어 지수 (Recovery): <strong>{detailData?.metrics?.recovery_rate ? `${(detailData.metrics.recovery_rate * 100).toFixed(1)}%` : '-'}</strong></p>
                      <div className="recommend-title">🚀 상권 추천 업종</div>
                      <div className="recommendation-list">
                        {detailData?.insight?.recommendations?.slice(0, 2).map((rec, idx) => (
                          <div key={idx} className="recommend-card">
                            <strong>{rec.category}</strong>
                            <p>{rec.desc}</p>
                          </div>
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
                    {tempCompareStations.map((s, i) => (
                      <div key={i} className="comp-item-tag">
                        <span className="idx" style={{ backgroundColor: LINE_COLORS[s.line] }}>{i + 1}</span>
                        {s.display_name} <button onClick={() => setTempCompareStations(p => p.filter((_, idx) => idx !== i))}>×</button>
                      </div>
                    ))}
                    {tempCompareStations.length === 0 && <p className="placeholder-guide">지도의 마커를 클릭하여 후보지를 추가하세요.</p>}
                  </div>
                  {tempCompareStations.length >= 2 && <button className="start-btn" onClick={startComparison}>비교 분석 시작</button>}
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="report-content-area">
          {analysisMode === 'single' && detailData && (
            <div className="dashboard-rows">
              <div className="kpi-grid">
                {[
                  { label: "입지 등급", val: detailData.insight.grade },
                  { label: "평일 유동량", val: detailData.metrics.weekday_avg?.toLocaleString() + "명" },
                  { label: "전년 대비 성장", val: `${detailData.metrics.growth_rate > 0 ? '▲' : '▼'} ${Math.abs(detailData.metrics.growth_rate)}%`, color: detailData.metrics.growth_rate >= 0 ? '#ff4d4f' : '#1890ff' },
                  { label: "증감 수치", val: `${detailData.metrics.diff_amount?.toLocaleString()}명` },
                  { label: "상권 성숙도", val: detailData.metrics.market_maturity }
                ].map((kpi, i) => (
                  <div key={i} className="card kpi-card">
                    <span className="kpi-label">{kpi.label}</span>
                    <strong className="kpi-value" style={{ color: kpi.color }}>{kpi.val}</strong>
                  </div>
                ))}
              </div>

              <div className="grid-2">
                <div className="card h-auto">
                  <h3>📅 일별 활성도 추이 (Heatmap)</h3>
                  {renderHeatmapContent()}
                </div>
                <div className="card h-auto">
                  <h3>💡 분석 포인트</h3>
                  <div className="insight-message">{detailData.insight.insight_text}</div>
                  <div style={{marginTop: '20px'}}>
                    <p style={{fontSize: '13px'}}><strong>추천 전략:</strong> {detailData.metrics.market_maturity === '정체/쇠퇴기' ? '기존 고객 유지 및 효율화 전략' : '적극적인 마케팅 권장'}</p>
                  </div>
                </div>
              </div>

              <div className="grid-2">
                <div className="card">
                  <h3>🔍 시간대별 평균 활성도 패턴</h3>
                  <div className="chart-h">
                    <Line data={processedChartData} options={{ responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, ticks: { callback: v => v.toLocaleString() } } } }} />
                  </div>
                </div>
                <div className="card">
                  <h3>🛡️ 위기 대응력 (COVID 데이터)</h3>
                  <div className="chart-h" style={{height: '200px'}}>
                    <Line data={{ labels: ['Pre-COVID (19)', 'Shock (20)'], datasets: [{ data: [detailData.metrics.v2019, detailData.metrics.v2020], borderColor: '#ff4d4f', backgroundColor: 'rgba(255, 77, 79, 0.1)', fill: true }] }} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { min: 0, max: 200000 } } }} />
                  </div>
                  <div className="recovery-progress-container">
                    <div className="progress-info"><span>Shock Defense Level</span><span>{Math.round((detailData.metrics.recovery_rate || 0) * 100)}%</span></div>
                    <div className="progress-bar-bg">
                      <div className="progress-bar-fill" style={{ width: `${Math.min((detailData.metrics.recovery_rate || 0) * 100, 100)}%`, background: detailData.metrics.recovery_rate > 0.8 ? '#52c41a' : '#faad14' }} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {analysisMode === 'compare' && compareResults.length > 0 && (
            <div className="compare-dashboard">
              <div className="compare-title">⚖️ 후보지별 비교 분석</div>
              <div className="row">
                {compareResults.map((data, idx) => (
                  <div key={idx} className="card half h-auto">
                    <div className="compare-header-row">
                      <h3>{tempCompareStations[idx]?.display_name}</h3>
                      <span className="line-badge" style={{ background: LINE_COLORS[tempCompareStations[idx]?.line] }}>{tempCompareStations[idx]?.line}호선</span>
                    </div>
                    <div className="compare-info">
                      <p>입지 등급: <strong>{data.location_grade}</strong></p>
                      <p>방어력: <strong>{(data.recovery_rate * 100).toFixed(1)}%</strong></p>
                    </div>
                    <div className="compare-chart-wrapper">
                      <Bar data={{ labels: ['17','18','19', '20', '21'], datasets: [{ data: [data.v2017,data.v2018,data.v2019, data.v2020, data.v2021], backgroundColor: LINE_COLORS[tempCompareStations[idx]?.line] }] }} options={{ maintainAspectRatio: false, plugins: { legend: { display: false } } }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
};

export default Map;