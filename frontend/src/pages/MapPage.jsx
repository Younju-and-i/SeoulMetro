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
  const [growthData, setGrowthData] = useState([]); // 연도별 추이 데이터
  const [compareResults, setCompareResults] = useState([]);

  const mapRef = useRef(null);
  const overlaysRef = useRef([]);

  // --- [로딩 메시지] ---
  const loadingMessage = useMemo(() => {
    if (analysisMode === 'compare') return "복수 역 데이터 분석 중...";
    if (analysisMode === 'single' && tempSelectedStation && !detailData) return "상권 핵심 지표 산출 중...";
    return "데이터 로드 중...";
  }, [analysisMode, tempSelectedStation, detailData]);

  // --- [데이터 가공: 시간대별 패턴] ---
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

  // --- [데이터 가공: 성장 추이 그래프] ---
  const growthChartData = useMemo(() => {
    if (!growthData || growthData.length === 0) return { labels: [], datasets: [] };
    return {
      labels: growthData.map(d => d.month),
      datasets: [
        {
          label: '월간 유동인구',
          data: growthData.map(d => d.passengers),
          borderColor: '#1890ff',
          backgroundColor: 'rgba(24, 144, 255, 0.1)',
          fill: true,
          tension: 0.3,
          yAxisID: 'y',
        },
        {
          label: 'Shock Defense (%)',
          data: growthData.map(d => d.recovery),
          borderColor: '#52c41a',
          borderDash: [5, 5],
          pointRadius: 2,
          fill: false,
          yAxisID: 'y1',
        }
      ]
    };
  }, [growthData]);

  // --- [히트맵 렌더링 엔진] ---
  const renderHeatmapContent = useCallback(() => {
    if (!detailData?.heatmap || detailData.heatmap.length === 0) {
      return <div className="placeholder-chart-msg">데이터 대기 중...</div>;
    }
    const data = detailData.heatmap;
    const maxFlow = Math.max(...data.map(d => d.daily_total || 0));
    const firstDayShift = data[0].day_of_week; 
    const blanks = Array.from({ length: firstDayShift }, (_, i) => (
      <div key={`blank-${i}`} style={{ height: '55px' }} />
    ));

    return (
      <div style={{ width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '8px', marginBottom: '12px', fontSize: '11px', color: '#666' }}>
          <span>낮음</span>
          <div style={{ display: 'flex', gap: '2px' }}>
            {[0.1, 0.3, 0.6, 0.9].map(op => (
              <div key={op} style={{ width: '12px', height: '12px', background: `rgba(24, 144, 255, ${op})`, borderRadius: '2px' }} />
            ))}
          </div>
          <span>높음</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', marginBottom: '8px', textAlign: 'center', fontWeight: 'bold', fontSize: '12px', color: '#888' }}>
          {['월', '화', '수', '목', '금', '토', '일'].map(day => <div key={day}>{day}</div>)}
        </div>
        <div className="heatmap-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px' }}>
          {blanks}
          {data.map((item) => {
            const ratio = item.daily_total / (maxFlow || 1);
            const bgColor = `rgba(24, 144, 255, ${Math.max(0.05, ratio)})`;
            const holidayName = item.holiday_name && String(item.holiday_name).trim() !== "" ? item.holiday_name : null;
            const isRedDay = item.day_of_week >= 5 || !!holidayName;
            return (
              <div key={item.day} style={{ height: '55px', background: bgColor, borderRadius: '6px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontSize: '13px', border: isRedDay ? '1px solid rgba(255, 77, 79, 0.4)' : '1px solid #f0f0f0', position: 'relative', cursor: 'default', padding: '4px 0' }} title={holidayName ? `[${holidayName}] 유동량: ${item.daily_total?.toLocaleString()}명` : `${item.day}일 유동량: ${item.daily_total?.toLocaleString()}명`}>
                <span style={{ color: '#333', fontWeight: isRedDay ? 'bold' : '500', lineHeight: '1.2' }}>{parseInt(item.day)}</span>
                {holidayName && <span style={{ fontSize: '9px', fontWeight: 'bold', marginTop: '2px', textAlign: 'center', transform: 'scale(0.9)', whiteSpace: 'nowrap' }}>{holidayName}</span>}
              </div>
            );
          })}
        </div>
      </div>
    );
  }, [detailData]);

  // --- [분석 로직: 백엔드 통합 호출] ---
  const handleRunAnalysis = useCallback(() => {
    if (!tempSelectedStation) return;
    setIsLoading(true);
    
    Promise.all([
      api.get('station/metrics', { params: { station_name: tempSelectedStation.display_name, line_num: tempSelectedStation.line } }),
      api.get('station/hourly', { params: { station_name: tempSelectedStation.display_name, target_month: selectedMonth, line_num: tempSelectedStation.line } }),
      api.get('station/heatmap', { params: { station_name: tempSelectedStation.display_name, target_month: selectedMonth, line_num: tempSelectedStation.line } }),
      api.get('station/growth', { params: { station_name: tempSelectedStation.display_name } }) // ★ 성장 데이터 추가
    ])
      .then(([resMetrics, resHourly, resHeatmap, resGrowth]) => {
        const m = resMetrics.data;
        setGrowthData(resGrowth.data || []);
        setDetailData({
          stationInfo: tempSelectedStation,
          metrics: m,
          hourly_pattern: resHourly.data,
          heatmap: resHeatmap.data,
          insight: {
            score: m.analysis_score || 0,
            grade: m.location_grade || 'B',
            type: m.commercial_type || '분석 중',
            recommendations: m.recommendations || [],
            maturity: m.growth_status || '성장형'
          }
        });
      })
      .catch(err => console.error("Analysis Error:", err))
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

  // --- [초기 로드 및 노선 데이터] ---
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
    }).catch(err => {
      console.error(err);
      setIsLoading(false);
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
            grouped[l].push({ ...s, line: l, display_name: s.display_name });
          });
        }
      });
      setLineData(grouped);
    }).finally(() => setIsLoading(false));
  }, [selectedMonth]);

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

  const filteredStations = useMemo(() => {
    const all = selectedLine === '전체' ? Object.values(lineData).flat() : (lineData[selectedLine] || []);
    return all.filter(s => (s.display_name || '').includes(searchTerm))
              .sort((a, b) => a.display_name.localeCompare(b.display_name) || a.line.localeCompare(b.line));
  }, [lineData, selectedLine, searchTerm]);

  useEffect(() => {
    if (mapLoaded && !mapRef.current) {
      const container = document.getElementById('map');
      if (container) {
        mapRef.current = new window.kakao.maps.Map(container, { center: new window.kakao.maps.LatLng(37.5665, 127.02), level: 7 });
      }
    }
    if (!mapRef.current) return;
    overlaysRef.current.forEach(ol => ol.setMap(null));
    overlaysRef.current = [];
    filteredStations.forEach(s => {
      const isSelected = analysisMode === 'single' 
        ? (tempSelectedStation?.display_name === s.display_name && String(tempSelectedStation?.line) === String(s.line))
        : tempCompareStations.some(p => p.display_name === s.display_name && String(p.line) === String(s.line));
      const color = LINE_COLORS[s.line] || '#333';
      const content = document.createElement('div');
      content.style.cssText = `width: ${isSelected ? '20px' : '12px'}; height: ${isSelected ? '20px' : '12px'}; background: ${isSelected ? color : 'white'}; border: 2px solid ${color}; border-radius: 50%; cursor: pointer; transition: all 0.2s; z-index: ${isSelected ? 10 : 1};`;
      content.onclick = () => handleSelectStation(s.display_name, s.line);
      const overlay = new window.kakao.maps.CustomOverlay({ position: new window.kakao.maps.LatLng(s.lat, s.lng), content, yAnchor: 0.5 });
      overlay.setMap(mapRef.current);
      overlaysRef.current.push(overlay);
    });
  }, [filteredStations, tempSelectedStation, tempCompareStations, mapLoaded, handleSelectStation, analysisMode]);

  return (
    <div className={`consulting-layout ${isLoading ? 'is-loading' : ''}`}>
      {isLoading && <div className="loading-overlay"><div className="spinner"></div><p>{loadingMessage}</p></div>}

      <aside className="sidebar">
        <h2 className="logo">Semicolon <span className="point">;</span></h2>
        <div className="filter-box">
          <label>데이터 기준월</label>
          <select value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)}>{availableMonths.map(m => <option key={m} value={m}>{m}</option>)}</select>
          <label>노선 선택</label>
          <select value={selectedLine} onChange={(e) => setSelectedLine(e.target.value)}><option value="전체">전체 노선</option>{Object.keys(LINE_COLORS).map(n => <option key={n} value={n}>{n}호선</option>)}</select>
          <input type="text" placeholder="역 검색..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
        </div>
        <div className="mini-station-list">
          {filteredStations.map((s) => (
            <div key={`${s.display_name}-${s.line}`} className={`mini-item ${(analysisMode === 'single' ? tempSelectedStation : tempCompareStations.find(p => p.display_name === s.display_name && p.line === s.line)) ? 'active' : ''}`} onClick={() => handleSelectStation(s.display_name, s.line)}>
              <span className="dot" style={{ backgroundColor: LINE_COLORS[s.line] }}></span>{s.display_name} <small>({s.line}호선)</small>
            </div>
          ))}
        </div>
      </aside>

      <main className="report-main">
        <header className="main-header">
          <div className="header-title-group"><h1>Franchise Location Strategy Report</h1><div className="header-info">지하철 유동인구 기반 상권 컨설팅 리포트 ({selectedMonth})</div></div>
          {analysisMode === 'single' && detailData && (
            <div className="score-summary-card"><div className="score-item"><span className="label">상권 분석 점수</span><span className="value">{detailData.insight.score}<small>/100</small></span></div><div className="grade-badge">Grade {detailData.insight.grade}</div></div>
          )}
        </header>

        <section className="top-visual-row">
          <div id="map" className="map-card" />
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
                    <h2>{tempSelectedStation.display_name} 입지 리포트</h2>
                    <div className="kpi-summary-box">
                      <div className="kpi-item"><span>상권 성격</span><strong>{detailData?.insight?.type || '분석 대기'}</strong></div>
                      <div className="kpi-item"><span>Shock Defense</span><strong>{detailData?.metrics?.shock_defense ? `${detailData.metrics.shock_defense}%` : '-'}</strong></div>
                      <div className="kpi-section-title">🚀 상권 추천 업종</div>
                      <div className="recommendation-row">
                        {detailData?.insight?.recommendations?.map((rec, idx) => (
                          <div key={idx} className={`rec-card ${idx === 0 ? 'gold' : ''}`}><div className="rank">{rec.rank}</div><div className="info"><strong>{rec.category}</strong><p>{rec.desc}</p></div></div>
                        )) || <div className="placeholder-text">분석 버튼을 누르면 추천 업종이 산출됩니다.</div>}
                      </div>
                      <button className="start-btn" onClick={handleRunAnalysis} style={{ width: '100%', marginTop: '15px' }}>상권 구조 분석 시작</button>
                    </div>
                  </div>
                ) : <div className="placeholder-guide">지도의 마커나 리스트에서 역을 선택해 주세요.</div>
              ) : (
                <div className="compare-setup-panel">
                  <h4>분석 후보지 (최대 3개)</h4>
                  <div className="compare-stations-list">{tempCompareStations.map((s, i) => (<div key={i} className="comp-item-tag"><span className="idx" style={{ backgroundColor: LINE_COLORS[s.line] }}>{i + 1}</span>{s.display_name} <button onClick={() => setTempCompareStations(p => p.filter((_, idx) => idx !== i))}>×</button></div>))}</div>
                  {tempCompareStations.length >= 2 && <button className="start-btn" onClick={startComparison}>비교 분석 시작</button>}
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="report-content-area">
          {analysisMode === 'single' && detailData && (
            <div className="consulting-dashboard">
              <div className="kpi-section-title">📊 {detailData.stationInfo.display_name} 핵심 지표</div>
              <div className="core-kpi-grid">
                <div className="card"><span>전체 입지 등급</span><strong>{detailData.insight.grade}</strong></div>
                <div className="card"><span>평일 평균 유동량</span><strong>{detailData.metrics.weekday_avg?.toLocaleString()}명</strong></div>
                <div className="card highlight"><span>유동성(Volatility)</span><strong>{detailData.metrics.volatility?.toFixed(3)}</strong></div>
                <div className="card"><span>상권 타입</span><strong>{detailData.insight.type}</strong></div>
                <div className="card"><span>상권 성숙도</span><strong>{detailData.insight.maturity}</strong></div>
              </div>

              <div className="kpi-section-title">📅 일별 활성도 추이 (Heatmap)</div>
              <div className="pattern-row">
                <div className="card wide">{renderHeatmapContent()}</div>
                <div className="card side-summary"><h4>💡 분석 포인트</h4><div className="insight-message"><p>{detailData.stationInfo.display_name} 분석 결과, 이 상권은 {detailData.metrics.holiday_ratio < 100 ? '평일 집객력' : '주말 집객력'}이 더 우수한 것으로 판단됩니다.</p></div></div>
              </div>

              <div className="kpi-section-title">🔍 시간대별 평균 활성도 패턴</div>
              <div className="pattern-row">
                <div className="card"><h4>🕒 운영 가이드</h4><div className="mini-stats"><p>피크 시간: <strong>{detailData.metrics.peak_time}</strong></p><p>상권 유형: <strong>{detailData.insight.type}</strong></p></div></div>
                <div className="card wide"><div className="chart-container-small"><Line data={processedChartData} options={{ responsive: true, maintainAspectRatio: false }} /></div></div>
              </div>

              {/* 상권 성장 추이 섹션 (Shock Index 위로 이동) */}
              <div className="kpi-section-title">📈 상권 성장 및 유동인구 추이 (Growth Trend)</div>
              <div className="pattern-row">
                <div className="card wide">
                  <div className="chart-container-medium">
                    <Line data={growthChartData} options={{ responsive: true, maintainAspectRatio: false, scales: { y: { position: 'left' }, y1: { position: 'right', grid: { drawOnChartArea: false } } } }} />
                  </div>
                </div>
                <div className="card side-summary">
                  <h4>💡 성장성 진단</h4>
                  <div className="insight-message"><p>본 상권은 현재 <strong>{detailData.insight.maturity}</strong> 양상을 띠고 있으며, Shock Defense 수치는 <strong>{detailData.metrics.shock_defense}%</strong>로 측정되었습니다.</p></div>
                </div>
              </div>

              {/* 코로나19 충격 지표 섹션 */}
              <div className="kpi-section-title">🛡️ 코로나19 유동인구 충격 지표 (COVID19 Shock Index)</div>
              <div className="covid-analysis-row">
                <div className="card wide">
                  <div className="chart-container-medium">
                    <Bar 
                      data={{ 
                        labels: growthData.slice(-3).map(d => d.month), 
                        datasets: [{ label: '연도별 유동량', data: growthData.slice(-3).map(d => d.passengers), backgroundColor: '#ff4d4f' }] 
                      }} 
                      options={{ responsive: true, maintainAspectRatio: false }} 
                    />
                  </div>
                </div>
                <div className="card side-summary">
                  <h4>💡 구조적 충격 해석</h4>
                  <div className="insight-message">코로나19 충격 대비 방어력은 약 <strong>{detailData.metrics.shock_defense}%</strong> 수준입니다. {detailData.metrics.shock_defense >= 100 ? "위기에 매우 강한 구조입니다." : "외부 변화에 주의가 필요합니다."}</div>
                  <div className="shock-status" style={{ marginTop: '20px' }}>
                    <div style={{ width: '100%', height: '8px', background: '#eee', borderRadius: '4px', overflow: 'hidden' }}>
                      <div style={{ width: `${detailData.metrics.shock_defense}%`, height: '100%', background: detailData.metrics.shock_defense >= 100 ? '#52c41a' : '#faad14', transition: 'width 1s ease-in-out' }} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {analysisMode === 'compare' && compareResults.length > 0 && (
            <div className="compare-dashboard">
              <div className="kpi-section-title">⚖️ 후보지별 핵심 지표 비교 분석</div>
              <div className="compare-row" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
                {compareResults.map((data, idx) => (
                  <div key={idx} className="card" style={{ padding: '20px' }}>
                    <span className="comp-label" style={{ backgroundColor: LINE_COLORS[tempCompareStations[idx]?.line], color: '#fff', padding: '2px 8px', borderRadius: '4px', fontSize: '11px' }}>후보 {idx + 1}</span>
                    <h3 style={{ marginTop: '10px' }}>{tempCompareStations[idx]?.display_name}</h3>
                    <div className="compare-kpi-list" style={{ margin: '15px 0', fontSize: '14px' }}>
                      <p>📍 등급: <strong>{data.location_grade}</strong></p>
                      <p>📈 Shock Defense: <strong>{data.shock_defense}%</strong></p>
                    </div>
                    <div style={{ height: '150px' }}>
                      <Bar data={{ labels: ['분석지표'], datasets: [{ label: '점수', data: [data.analysis_score], backgroundColor: LINE_COLORS[tempCompareStations[idx]?.line] }] }} options={{ maintainAspectRatio: false }} />
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