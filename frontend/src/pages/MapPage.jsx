import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { Line, Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement,
  BarElement, Title, Tooltip, Legend, Filler, RadialLinearScale
} from 'chart.js';

import api from '@/api/config';
import { LINE_COLORS, TIME_LABELS } from '@/constants/subway';
import '@styles/App.css';

ChartJS.register(
  CategoryScale, LinearScale, PointElement, LineElement, 
  BarElement, Title, Tooltip, Legend, Filler, RadialLinearScale
);

const Map = () => {
  // --- [상태 관리] ---
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

  // --- [로딩 메시지 커스터마이징] ---
  const loadingMessage = useMemo(() => {
    if (analysisMode === 'compare') return "복수 역 데이터 분석 중...";
    if (analysisMode === 'single' && tempSelectedStation && !detailData) return "상권 핵심 지표 산출 중...";
    return "데이터 로드 중...";
  }, [analysisMode, tempSelectedStation, detailData]);

  // --- [데이터 가공: 시간대별 패턴 차트] ---
  const processedChartData = useMemo(() => {
    if (!detailData?.hourly_pattern) return { labels: TIME_LABELS, datasets: [] };
    const onData = detailData.hourly_pattern.map(d => d.avg_on);
    const offData = detailData.hourly_pattern.map(d => d.avg_off);
    return {
      labels: TIME_LABELS,
      datasets: [
        { label: '평균 승차', data: onData, borderColor: '#1890ff', backgroundColor: 'rgba(24, 144, 255, 0.1)', fill: true, tension: 0.4 },
        { label: '평균 하차', data: offData, borderColor: '#ff4d4f', backgroundColor: 'rgba(255, 77, 79, 0.1)', fill: true, tension: 0.4 }
      ]
    };
  }, [detailData]);

  // --- [히트맵 렌더링 엔진] ---
 const renderHeatmapContent = useCallback(() => {
  if (!detailData?.heatmap || detailData.heatmap.length === 0) {
    return <div className="placeholder-chart-msg">데이터 대기 중...</div>;
  }

  const data = detailData.heatmap;
  
  // 1. 최대 유동량 계산 (색상 진하기 결정용)
  const maxFlow = Math.max(...data.map(d => d.count || 0));

  // 2. 첫 날의 요일을 계산하여 앞부분 빈칸(blanks) 생성
  // 백엔드에서 받은 첫 데이터의 date('2021-12-01') 기준
  const firstDate = new Date(data[0].date);
  // getDay()는 일(0) ~ 토(6). 우리 그리드는 월(0)부터 시작하므로 조정
  let firstDayShift = firstDate.getDay() - 1; 
  if (firstDayShift === -1) firstDayShift = 6; // 일요일 처리

  const blanks = Array.from({ length: firstDayShift }, (_, i) => (
    <div key={`blank-${i}`} style={{ height: '55px', backgroundColor: '#f9f9f9', borderRadius: '4px' }} />
  ));

  return (
    <div style={{ width: '100%' }}>
      {/* 범례 (Legend) */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '8px', marginBottom: '12px', fontSize: '11px', color: '#666' }}>
        <span>유동량 낮음</span>
        <div style={{ display: 'flex', gap: '2px' }}>
          {[0.1, 0.3, 0.6, 0.9].map(op => (
            <div key={op} style={{ width: '12px', height: '12px', background: `rgba(24, 144, 255, ${op})`, borderRadius: '2px' }} />
          ))}
        </div>
        <span>높음</span>
      </div>

      {/* 요일 헤더 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', marginBottom: '8px', textAlign: 'center', fontWeight: 'bold', fontSize: '12px', color: '#888' }}>
        {['월', '화', '수', '목', '금', '토', '일'].map(day => <div key={day}>{day}</div>)}
      </div>

      {/* 히트맵 그리드 */}
      <div className="heatmap-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px' }}>
        {blanks}
        {data.map((item) => {
          const currentDate = new Date(item.date);
          const dayNum = currentDate.getDate();
          const dayOfWeek = currentDate.getDay(); // 0(일) ~ 6(토)
          
          const ratio = item.count / (maxFlow || 1);
          const bgColor = `rgba(24, 144, 255, ${Math.max(0.05, ratio)})`;
          
          // 주말 체크 (토: 6, 일: 0)
          const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

          return (
            <div 
              key={item.date} 
              style={{ 
                height: '55px', 
                background: bgColor, 
                borderRadius: '6px', 
                display: 'flex', 
                flexDirection: 'column', 
                alignItems: 'center', 
                justifyContent: 'center', 
                fontSize: '13px', 
                border: isWeekend ? '1px solid rgba(255, 77, 79, 0.3)' : '1px solid #eee',
                position: 'relative',
                cursor: 'pointer'
              }} 
              title={`${item.date} 유동량: ${item.count?.toLocaleString()}명`}
            >
              <span style={{ color: isWeekend ? '#ff4d4f' : '#333', fontWeight: isWeekend ? 'bold' : '500' }}>
                {dayNum}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}, [detailData]);

// --- [분석 실행: 백엔드 API 연동] ---
const handleRunAnalysis = useCallback(() => {
  if (!tempSelectedStation) return;
  setIsLoading(true);
  
  Promise.all([
    api.get('station/metrics', { params: { station_name: tempSelectedStation.display_name, line_num: tempSelectedStation.line } }),
    api.get('station/hourly', { params: { station_name: tempSelectedStation.display_name, target_month: selectedMonth, line_num: tempSelectedStation.line } }),
    api.get('station/heatmap', { params: { station_name: tempSelectedStation.display_name, target_month: selectedMonth, line_num: tempSelectedStation.line } })
  ])
    .then(([resMetrics, resHourly, resHeatmap]) => {
      const m = resMetrics.data;
      
      setDetailData({
        stationInfo: tempSelectedStation,
        metrics: m, // 백엔드 전체 데이터를 담음
        hourly_pattern: resHourly.data,
        heatmap: resHeatmap.data,
        insight: {
          score: m.analysis_score || 0,
          grade: m.location_grade || 'B',
          type: m.commercial_type || '분석 중',
          recommendations: m.recommendations || [],
          // 백엔드에 maturity_level이 없으므로 m.commercial_type 등으로 대체하거나 기본값 설정
          maturity: m.commercial_type ? "데이터 기반" : "Normal" 
        }
      });
    })
    .catch(err => {
      console.error("Analysis Error:", err);
      alert("데이터 분석 중 오류가 발생했습니다.");
    })
    .finally(() => setIsLoading(false));
}, [tempSelectedStation, selectedMonth]);

  const startComparison = useCallback(() => {
    if (tempCompareStations.length < 2) return alert("비교할 역을 2개 이상 선택해주세요.");
    setIsLoading(true);
    const requests = tempCompareStations.map(s => api.get('station/metrics', { params: { station_name: s.display_name, line_num: s.line } }));
    Promise.all(requests)
      .then(res => setCompareResults(res.map(r => r.data)))
      .catch(err => console.error("Comparison Error:", err))
      .finally(() => setIsLoading(false));
  }, [tempCompareStations]);

  // --- [데이터 초기 로드 및 필터링] ---
  useEffect(() => {
    const KAKAO_MAP_KEY = import.meta.env.VITE_KAKAO_MAP_KEY;
    if (!window.kakao) {
      const script = document.createElement('script');
      script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_MAP_KEY}&autoload=false`;
      script.onload = () => window.kakao.maps.load(() => setMapLoaded(true));
      document.head.appendChild(script);
    } else {
      setMapLoaded(true);
    }

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
      const stationsArray = res.data.data || [];
      const grouped = {};
      stationsArray.forEach(s => {
        if (Array.isArray(s.lines)) {
          s.lines.forEach(lineNum => {
            const l = String(lineNum);
            if (!grouped[l]) grouped[l] = [];
            grouped[l].push({ ...s, line: l });
          });
        }
      });
      setLineData(grouped);
    }).finally(() => setIsLoading(false));
  }, [selectedMonth]);

  const filteredStations = useMemo(() => {
    const all = selectedLine === '전체' ? Object.values(lineData).flat() : (lineData[selectedLine] || []);
    return all
      .filter(s => (s.display_name || '').includes(searchTerm))
      .sort((a, b) => a.display_name === b.display_name ? a.line.localeCompare(b.line) : a.display_name.localeCompare(b.display_name));
  }, [lineData, selectedLine, searchTerm]);

  const handleSelectStation = useCallback((name, line) => {
    const target = Object.values(lineData).flat().find(s => s.display_name === name && s.line === line);
    if (!target) return;
    if (analysisMode === 'single') {
      setTempSelectedStation(target);
      setDetailData(null);
    } else {
      setTempCompareStations(prev => {
        const isExist = prev.find(p => p.display_name === name && p.line === line);
        if (isExist) return prev.filter(p => p.display_name !== name || p.line !== line);
        return prev.length >= 3 ? [...prev.slice(1), target] : [...prev, target];
      });
    }
  }, [lineData, analysisMode]);

  // --- [지도 마커 렌더링] ---
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
      content.style.cssText = `width: ${isSelected ? '20px' : '12px'}; height: ${isSelected ? '20px' : '12px'}; background: ${isSelected ? color : 'white'}; border: 2px solid ${color}; border-radius: 50%; cursor: pointer; transition: all 0.2s; z-index: ${isSelected ? 10 : 1};`;
      content.onclick = () => handleSelectStation(s.display_name, s.line);

      const overlay = new window.kakao.maps.CustomOverlay({
        position: new window.kakao.maps.LatLng(s.lat, s.lng),
        content,
        yAnchor: 0.5
      });
      overlay.setMap(mapRef.current);
      overlaysRef.current.push(overlay);
    });
  }, [filteredStations, tempSelectedStation, tempCompareStations, mapLoaded, analysisMode, handleSelectStation]);

  return (
    <div className={`consulting-layout ${isLoading ? 'is-loading' : ''}`}>
      {isLoading && (
        <div className="loading-overlay">
          <div className="spinner"></div>
          <p>{loadingMessage}</p>
        </div>
      )}

      {/* 1. Sidebar */}
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
            <div 
              key={`${s.display_name}-${s.line}`} 
              className={`mini-item ${ (analysisMode==='single' ? tempSelectedStation?.display_name===s.display_name && tempSelectedStation?.line===s.line : tempCompareStations.some(p=>p.display_name===s.display_name && p.line===s.line)) ? 'active' : ''}`}
              onClick={() => handleSelectStation(s.display_name, s.line)}
            >
              <span className="dot" style={{ backgroundColor: LINE_COLORS[s.line] }}></span>
              {s.display_name} <small>({s.line}호선)</small>
            </div>
          ))}
        </div>
      </aside>

      {/* 2. Main Area */}
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

        {/* Top Section: Map & Summary */}
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
                    <span className="line-tag" style={{ backgroundColor: LINE_COLORS[tempSelectedStation.line] }}>{tempSelectedStation.line}호선</span>
                    <h2>{tempSelectedStation.display_name}역 입지 리포트</h2>
                    <div className="kpi-summary-box">
                      <div className="kpi-item"><span>상권 성격</span><strong>{detailData?.insight?.type || '분석 대기'}</strong></div>
                      <div className="kpi-item"><span>Shock Defense : </span><strong>{detailData?.metrics?.recovery_rate ? `${(detailData.metrics.recovery_rate * 100).toFixed(1)}%` : '-'}</strong></div>
                      <div className="kpi-section-title">🚀 상권 추천 업종</div>
                      <div className="recommendation-row">
                        {detailData?.insight?.recommendations?.map((rec, idx) => (
                          <div key={idx} className={`rec-card ${idx === 0 ? 'gold' : ''}`}>
                            <div className="rank">{rec.rank}</div>
                            <div className="info"><strong>{rec.category}</strong><p>{rec.desc}</p></div>
                          </div>
                        ))}
                      </div>
                      <button className="start-btn" onClick={handleRunAnalysis}>상권 구조 분석 시작</button>
                    </div>
                  </div>
                ) : <div className="placeholder-guide">역을 선택하면 상세 리포트가 생성됩니다.</div>
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
                  </div>
                  {tempCompareStations.length >= 2 && <button className="start-btn" onClick={startComparison}>비교 분석 시작</button>}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Bottom Section: Dashboard */}
        <section className="report-content-area">
          {analysisMode === 'single' && detailData && (
            <div className="consulting-dashboard">
              <div className="kpi-section-title">📊 {detailData.stationInfo.display_name} 핵심 지표</div>
              <div className="core-kpi-grid">
                <div className="card"><span>전체 입지 등급</span><strong>{detailData.insight.grade}</strong></div>
                <div className="card"><span>평일 평균 유동량</span><strong>{detailData.metrics.weekday_avg?.toLocaleString()}명</strong></div>
                <div className="card highlight"><span>유동성(Volatility)</span><strong>{detailData.metrics.volatility?.toFixed(3)}</strong></div>
                <div className="card"><span>주말 유동 변화</span><strong>{detailData.metrics.holiday_sensitivity < 0 ? '하락형' : '상승형'}</strong></div>
                <div className="card"><span>상권 성숙도</span><strong>{detailData.insight.maturity}</strong></div>
              </div>

              <div className="kpi-section-title">📅 일별 활성도 추이 (Heatmap)</div>
              <div className="pattern-row">
                <div className="card wide">{renderHeatmapContent()}</div>
                <div className="card side-summary">
                  <h4>💡 분석 포인트</h4>
                  <div className="insight-message">
                    {detailData.stationInfo.display_name}역은 {detailData.metrics.holiday_sensitivity < 0 ? '전형적인 오피스/출퇴근형' : '주말 유입이 많은 중심상권형'} 입지입니다.
                  </div>
                </div>
              </div>

              <div className="kpi-section-title">🔍 시간대별 평균 활성도 패턴</div>
              <div className="pattern-row">
                <div className="card">
                  <h4>🕒 운영 가이드</h4>
                  <p>피크 시간: <strong>{detailData.insight.type === '오피스형' ? '08:00, 18:00' : '12:00 ~ 15:00'}</strong></p>
                  <p>수요 집중도: <strong>{detailData.metrics.recovery_rate > 0.8 ? '매우 높음' : '보통'}</strong></p>
                </div>
                <div className="card wide">
                  <div className="chart-container-small">
                    <Line data={processedChartData} options={{ responsive: true, maintainAspectRatio: false }} />
                  </div>
                </div>
              </div>
              <div className="kpi-section-title">🛡️ 코로나19 유동인구 충격 지표 (COVID19 Shock Index)</div>
                <div className="covid-analysis-row">
                  <div className="card wide">
                    <div className="chart-container-medium">
                      <Line 
                        data={{ 
                          // 2020년 데이터가 없다면 2021년으로 라벨을 변경하는 것이 좋습니다.
                          labels: ['2019년 (Pre-COVID)', '2021년 (Recovery)'], 
                          datasets: [{ 
                            label: '연평균 유동량', 
                            // 백엔드에서 준 v2019, v2021 매핑
                            data: [detailData.metrics.v2019, detailData.metrics.v2021], 
                            borderColor: '#ff4d4f',
                            backgroundColor: 'rgba(255, 77, 79, 0.1)', 
                            fill: true, 
                            tension: 0.4,
                            pointRadius: 6,
                            pointBackgroundColor: '#ff4d4f'
                          }] 
                        }} 
                        options={{ 
                          responsive: true, 
                          maintainAspectRatio: false,
                          plugins: { legend: { display: false } },
                          scales: { 
                            y: { 
                              beginAtZero: false, // 0부터 시작하면 변화 폭이 너무 작아 보일 수 있음
                              ticks: { callback: (v) => v.toLocaleString() + '명' } 
                            } 
                          }
                        }} 
                      />
                    </div>
                  </div>
                  <div className="card side-summary">
                    <h4>💡 구조적 충격 해석</h4>
                    <div className="insight-message" style={{ lineHeight: '1.7', color: '#444', fontSize: '14px' }}>
                      {/* 백엔드에서 계산된 recovery_rate 활용 */}
                      코로나19 전후 회복률은 약 <strong>{Math.round((detailData.metrics.recovery_rate || 0) * 100)}%</strong> 수준입니다. 
                      {detailData.metrics.recovery_rate > 0.8 
                        ? " 위기에 강한 수요 방어력을 보유하고 있습니다." 
                        : " 외부 환경 변화에 민감한 구조를 띄고 있습니다."}
                    </div>
                    <div className="shock-status" style={{ marginTop: '20px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '12px', color: '#888' }}>
                        <span>Shock Defense Level (회복률)</span>
                        <span>{Math.round((detailData.metrics.recovery_rate || 0) * 100)}%</span>
                      </div>
                      <div style={{ width: '100%', height: '8px', background: '#eee', borderRadius: '4px', overflow: 'hidden' }}>
                        <div style={{ 
                          width: `${Math.min((detailData.metrics.recovery_rate || 0) * 100, 100)}%`, 
                          height: '100%', 
                          background: detailData.metrics.recovery_rate > 0.8 ? '#52c41a' : '#faad14',
                          transition: 'width 1s ease-in-out'
                        }} />
                      </div>
                    </div>
                  </div>
                </div>
        </div>
          )}

          {analysisMode === 'compare' && compareResults.length > 0 && (
            <div className="compare-dashboard">
              <div className="kpi-section-title">⚖️ 후보지별 비교 분석</div>
              <div className="compare-row">
                {compareResults.map((data, idx) => (
                  <div key={idx} className="card">
                    <span className="comp-tag" style={{ background: LINE_COLORS[tempCompareStations[idx]?.line] }}>{tempCompareStations[idx]?.line}호선</span>
                    <h3>{tempCompareStations[idx]?.display_name}</h3>
                    <p>등급: <strong>{data.location_grade}</strong></p>
                    <p>방어력: <strong>{(data.recovery_rate * 100).toFixed(1)}%</strong></p>
                    <div style={{ height: '120px' }}>
                      <Bar data={{ labels: ['19', '20', '21'], datasets: [{ data: [data.v2019, data.v2020, data.v2021], backgroundColor: LINE_COLORS[tempCompareStations[idx]?.line] }] }} options={{ maintainAspectRatio: false }} />
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