import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { Line, Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement,
  BarElement, Title, Tooltip, Legend, Filler, RadialLinearScale
} from 'chart.js';

import api from '@/api/config';
import { LINE_COLORS, TIME_LABELS } from '@/constants/subway';
import '@/styles/App.css'; // 제공해주신 CSS가 저장된 파일명

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

  const [fixedCompareStations, setFixedCompareStations] = useState([]);

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
  if (!detailData?.hourly_pattern || !Array.isArray(detailData.hourly_pattern) || detailData.hourly_pattern.length === 0) {
    return { labels: [], datasets: [] };
  }

  const sortedData = [...detailData.hourly_pattern].sort((a, b) => a.hour - b.hour);

  const labels = sortedData.map(d => `${d.hour}시`);
  const onData = sortedData.map(d => d.avg_on ?? 0);
  const offData = sortedData.map(d => d.avg_off ?? 0);

  return {
    labels,
    datasets: [
      { 
        label: '평균 승차', 
        data: onData, 
        borderColor: '#1890ff', 
        backgroundColor: 'rgba(24, 144, 255, 0.1)', 
        fill: true, 
        tension: 0.4,
        pointRadius: 2
      },
      { 
        label: '평균 하차', 
        data: offData, 
        borderColor: '#ff4d4f', 
        backgroundColor: 'rgba(255, 77, 79, 0.1)', 
        fill: true, 
        tension: 0.4,
        pointRadius: 2
      }
    ]
  };
}, [detailData]);

  // --- [히트맵 렌더링 엔진] ---
  const renderHeatmapContent = useCallback(() => {
  if (!detailData?.heatmap || detailData.heatmap.length === 0) {
    return <div className="placeholder-chart-msg">데이터 대기 중...</div>;
  }

  const data = detailData.heatmap;
  const maxFlow = Math.max(...data.map(d => d.count || 0));
  
  // 💡 시작 요일 계산: 1일이 무슨 요일인지 계산하여 앞에 빈 칸(blanks) 생성
  const firstDate = new Date(data[0].date);
  let firstDayShift = firstDate.getDay(); // 0(일) ~ 6(토)
  // 월요일 시작 기준으로 맞추기 (일요일이 0이므로 조정)
  firstDayShift = firstDayShift === 0 ? 6 : firstDayShift - 1;

  const blanks = Array.from({ length: firstDayShift }, (_, i) => (
    <div key={`blank-${i}`} style={{ height: '55px', backgroundColor: '#f9f9f9', borderRadius: '4px' }} />
  ));

  return (
    <div style={{ width: '100%' }}>
      {/* 요일 헤더 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', textAlign: 'center', fontWeight: 'bold', fontSize: '12px', color: '#888', marginBottom: '8px' }}>
        {['월', '화', '수', '목', '금', '토', '일'].map(day => <div key={day}>{day}</div>)}
      </div>

      <div className="heatmap-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px' }}>
        {blanks}
        {data.map((item) => {
          const currentDate = new Date(item.date);
          const dayNum = currentDate.getDate();
          const ratio = item.count / (maxFlow || 1);
          const bgColor = `rgba(24, 144, 255, ${Math.max(0.1, ratio)})`;
          
          // 💡 공휴일/주말 판단 (백엔드에서 준 day_label 활용)
          const isRedDay = item.day_label === '주말' || item.day_label === '공휴일';

          return (
            <div 
              key={item.date} 
              style={{ 
                height: '55px', background: bgColor, borderRadius: '6px', 
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', 
                fontSize: '13px', border: '1px solid #eee', position: 'relative'
              }} 
              title={`${item.date} (${item.day_label}): ${item.count?.toLocaleString()}명`}
            >
              <span style={{ color: '#333', fontWeight: 'bold' }}>{dayNum}</span>
              {/* 💡 날짜 아래에 label 표시 */}
              <span style={{ fontSize: '9px', color: '#6e6b6b', marginTop: '2px' }}>
                {item.day_label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}, [detailData]);

  // --- [분석 실행 API] ---
const handleRunAnalysis = useCallback(async () => {
  if (!tempSelectedStation || !selectedMonth) return;
  try {
    setIsLoading(true);

    // 1. 세 가지 API를 동시에 호출 (히트맵 포함)
    const stnName = tempSelectedStation.display_name;
    const lineNum = tempSelectedStation.line_num;
    const targetMonth = selectedMonth.substring(0, 7); // "2021-12-01" -> "2021-12"
    const targetYear = targetMonth.split('-')[0];    // "2021"
    const [metricsRes, chartRes, heatmapRes] = await Promise.all([
      api.get('station/metrics', {
        params: { station_name: stnName, line_num: lineNum, target_year: targetYear }
      }),
      api.get('station/chart-data', {
        params: { station_name: stnName, line_num: lineNum, target_month: targetMonth  }
      }),
      api.get('station/heatmap', { 
        params: { station_name: stnName, target_month: targetMonth } // YYYY-MM 전달
      })
    ]);

    const m = metricsRes.data;
    const c = chartRes.data;
    const h = heatmapRes.data;

    if (m.error) {
      alert(m.error);
      return;
    }

    // [수정] 백엔드 응답 필드와 프론트엔드 변수명을 정확히 매칭
    const formattedDetail = {
      stationInfo: tempSelectedStation,
      metrics: {
        weekday_avg: m.weekday_avg,
        growth_rate: m.growth_rate,
        diff_amount: m.diff_amount,
        volatility: m.volatility,
        market_maturity: m.market_maturity,
        v2019: m.v2019 || 0, 
        v2020: m.v2020 || 0, 
        recovery_rate: m.recovery_rate || 0
      },
      insight: {
        score: m.analysis_score,
        grade: m.location_grade,
        type: m.commercial_type,
        insight_text: m.insight_text,
        // 추천 업종 데이터가 없을 경우를 대비한 기본값
        recommendations: m.recommendations || [
          { category: "분석 중", desc: "업종 데이터를 불러오는 중입니다." }
        ]
      },
      hourly_pattern: chartRes.data,
      heatmap: Array.isArray(heatmapRes.data) ? heatmapRes.data : []
    };

    setDetailData(formattedDetail);

  } catch (error) {
    console.error("Analysis Error:", error);
    alert("데이터 분석 로딩 중 오류가 발생했습니다.");
  } finally {
    setIsLoading(false);
  }
}, [tempSelectedStation, selectedMonth]);

  const startComparison = useCallback(() => {
    if (tempCompareStations.length < 2) return alert("비교할 역을 2개 이상 선택해주세요.");
    setIsLoading(true);
    setFixedCompareStations([...tempCompareStations]);
    const requests = tempCompareStations.map(s => api.get('station/metrics', { params: { station_name: s.display_name, line_num: s.line } }));
    Promise.all(requests)
      .then(res => setCompareResults(res.map(r => r.data)))
      .catch(err => console.error("Comparison Error:", err))
      .finally(() => setIsLoading(false));
  }, [tempCompareStations]);

  // --- [초기 데이터 로드] ---
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

// --- [초기 데이터 로드: 역 목록] ---
  useEffect(() => {
    if (!selectedMonth) return;
    setIsLoading(true);

    api.get('stations')
      .then(res => {
        // 1. 데이터가 res.data에 배열로 바로 들어있으므로 이를 사용합니다.
        const stationsArray = Array.isArray(res.data) ? res.data : (res.data.data || []);
        
        const grouped = {};
        stationsArray.forEach(s => {
          // 2. 콘솔 확인 결과 키 값이 'line_num'입니다. 이를 문자열로 변환합니다.
          if (s.line_num) {
            const l = String(s.line_num);
            if (!grouped[l]) grouped[l] = [];
            
            // 데이터 구조를 프론트엔드 형식에 맞춰 push
            grouped[l].push({
              ...s,
              line: l // 필터링에서 사용하는 'line' 키값 생성
            });
          }
        });
        
        // console.log("그룹화된 데이터:", grouped); // 확인용
        setLineData(grouped);
      })
      .catch(err => {
        console.error("역 목록 로드 실패:", err);
      })
      .finally(() => setIsLoading(false));
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

  // --- [지도 마커 업데이트] ---
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
          <div className="loader-content">
            <div className="spinner"></div>
            <p>{loadingMessage}</p>
          </div>
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
              {s.display_name} <small style={{marginLeft: '5px', fontSize: '11px', opacity: 0.8}}>({s.line}호선)</small>
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

        {/* Top Visual Section */}
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
                    <span className="dot" style={{ backgroundColor: LINE_COLORS[tempSelectedStation.line], display: 'inline-block', width: '10px', height: '10px', borderRadius: '50%', marginRight: '8px' }}></span>
                    <strong style={{fontSize: '18px'}}>{tempSelectedStation.display_name} 입지 리포트</strong>
                    
                    <div className="kpi-summary-box" style={{marginTop: '20px'}}>
                      <div className="recommend-box">
                        상권 성격: <strong>{detailData?.insight?.type || '분석 대기'}</strong>
                      </div>
                      <p style={{fontSize: '14px', color: '#666', marginBottom: '15px'}}>
                        위기 방어 지수 (Recovery): <strong>{detailData?.metrics?.recovery_rate ? `${(detailData.metrics.recovery_rate * 100).toFixed(1)}%` : '-'}</strong>
                      </p>
                      
                      <div style={{fontWeight: '700', marginBottom: '10px', color: '#1c2a48'}}>🚀 상권 추천 업종</div>
                      <div className="recommendation-list" style={{display: 'flex', gap: '10px', marginBottom: '20px'}}>
                        {detailData?.insight?.recommendations?.slice(0, 2).map((rec, idx) => (
                          <div key={idx} style={{flex: 1, padding: '10px', background: '#f8f9fa', borderRadius: '8px', fontSize: '12px', borderLeft: '3px solid #1890ff'}}>
                            <strong>{rec.category}</strong>
                            <p style={{margin: '4px 0 0', color: '#888'}}>{rec.desc}</p>
                          </div>
                        ))}
                      </div>
                      <button className="start-btn" onClick={handleRunAnalysis}>상권 구조 분석 시작</button>
                    </div>
                  </div>
                ) : <div className="placeholder-guide" style={{textAlign: 'center', padding: '40px', color: '#a0aec0'}}>좌측에서 역을 선택하면 상세 리포트가 생성됩니다.</div>
              ) : (
                <div className="compare-setup-panel">
                  <h4 style={{marginBottom: '15px'}}>분석 후보지 (최대 3개)</h4>
                  <div className="compare-stations-list">
                    {tempCompareStations.map((s, i) => (
                      <div key={i} className="comp-item-tag">
                        <span className="idx" style={{ backgroundColor: LINE_COLORS[s.line] }}>{i + 1}</span>
                        {s.display_name} <button onClick={() => setTempCompareStations(p => p.filter((_, idx) => idx !== i))}>×</button>
                      </div>
                    ))}
                    {tempCompareStations.length === 0 && <p style={{color: '#a0aec0', fontSize: '13px'}}>지도의 마커를 클릭하여 후보지를 추가하세요.</p>}
                  </div>
                  {tempCompareStations.length >= 2 && <button className="start-btn" onClick={startComparison}>비교 분석 시작</button>}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Dashboard Content Area */}
        <section className="report-content-area">
          {analysisMode === 'single' && detailData && (
            <div className="dashboard-rows">
              {/* 핵심 KPI 그리드 */}
              <div style={{display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '15px', marginBottom: '25px'}}>
                {[
                  { label: "입지 등급", val: detailData.insight.grade },
                  { label: "평일 유동량", val: detailData.metrics.weekday_avg?.toLocaleString() + "명" },
                  { 
                    label: "전년 대비 성장", 
                    val: `${detailData.metrics.growth_rate > 0 ? '▲' : '▼'} ${Math.abs(detailData.metrics.growth_rate)}%`,
                    color: detailData.metrics.growth_rate >= 0 ? '#ff4d4f' : '#1890ff' // 상승 빨강, 하락 파랑
                  },
                  { label: "증감 수치", val: `${detailData.metrics.diff_amount?.toLocaleString()}명` },
                  { label: "상권 성숙도", val: detailData.metrics.market_maturity }
                ].map((kpi, i) => (
                  <div key={i} className="card" style={{height: 'auto', padding: '20px', textAlign: 'center'}}>
                    <span style={{fontSize: '12px', color: '#718096', display: 'block', marginBottom: '8px'}}>{kpi.label}</span>
                    <strong style={{fontSize: '18px', color: kpi.color || '#2d3748'}}>{kpi.val}</strong>
                  </div>
                ))}
              </div>

              {/* 히트맵 및 인사이트 */}
              <div className="grid-2">
                <div className="card" style={{height: 'auto'}}>
                  <h3>📅 일별 활성도 추이 (Heatmap)</h3>
                  {renderHeatmapContent()}
                </div>
                <div className="card" style={{height: 'auto'}}>
                  <h3>💡 분석 포인트</h3>
                  {/* 백엔드에서 가공해준 문장을 그대로 출력 */}
                  <div className="insight-message" style={{ backgroundColor: '#f0f7ff', padding: '15px', borderRadius: '8px', lineHeight: '1.6' }}>
                    {detailData.insight.insight_text}
                  </div>
                  <div style={{marginTop: '20px'}}>
                    <p style={{fontSize: '13px', marginBottom: '10px'}}>
                      <strong>추천 전략:</strong> {detailData.metrics.market_maturity === '정체/쇠퇴기' 
                        ? '신규 확장보다는 기존 고객 유지 및 효율화 전략이 필요합니다.' 
                        : '적극적인 마케팅을 통한 시장 점유율 확보를 권장합니다.'}
                    </p>
                  </div>
                </div>
              </div>

              {/* 시간대별 패턴 차트 및 코로나 충격 분석 */}
              <div className="grid-2" style={{marginTop: '24px'}}>
                <div className="card" style={{height: '400px'}}>
                  <h3>🔍 시간대별 평균 활성도 패턴</h3>
                  <div className="chart-h">
                    <Line 
                        data={processedChartData} 
                        options={{ 
                          responsive: true, 
                          maintainAspectRatio: false,
                          scales: {
                            y: {
                              beginAtZero: true, // 0부터 시작

                              ticks: {
                                callback: (value) => value.toLocaleString() // 천단위 콤마
                              }
                            }
                          },
                          plugins: {
                            legend: { position: 'top', align: 'end' }
                          }
                        }} 
                      />
                  </div>
                </div>
                <div className="card" style={{height: '400px'}}>
                  <h3>🛡️ 위기 대응력 (COVID 데이터)</h3>
                  <h6>연간 일평균 유동인구 : 명</h6>
                  <div className="chart-h" style={{height: '200px'}}>
                    <Line 
                      data={{ 
                        labels: ['Pre-COVID (19)', 'Shock (20)'], 
                        datasets: [{ 
                          data: [detailData.metrics.v2019, detailData.metrics.v2020], 
                          borderColor: '#ff4d4f', 
                          backgroundColor: 'rgba(255, 77, 79, 0.1)', 
                          fill: true, 
                          tension: 0.4 
                        }] 
                      }} 
                      options={{ 
                        responsive: true, 
                        maintainAspectRatio: false, 
                        plugins: { 
                          legend: { display: false } 
                        },
                        scales: {
                          y: {
                            min: 0,       // Y축 최소값
                            max: 200000   // Y축 최대값
                          }
                        }
                      }} 
                    />
                  </div>
                  <div style={{ marginTop: '20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '12px', color: '#888' }}>
                      <span>Shock Defense Level</span>
                      <span>{Math.round((detailData.metrics.recovery_rate || 0) * 100)}%</span>
                    </div>
                    <div style={{ width: '100%', height: '8px', background: '#eee', borderRadius: '4px', overflow: 'hidden' }}>
                      <div style={{ 
                        width: `${Math.min((detailData.metrics.recovery_rate || 0) * 100, 100)}%`, 
                        height: '100%', background: detailData.metrics.recovery_rate > 0.8 ? '#52c41a' : '#faad14'
                      }} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 비교 분석 모드 대시보드 */}
          {analysisMode === 'compare' && compareResults.length > 0 && (
            <div className="compare-dashboard">
              <div style={{fontWeight: '700', fontSize: '20px', marginBottom: '20px', color: '#1c2a48'}}>⚖️ 후보지별 비교 분석</div>
              <div className="row" style={{display: 'flex', gap: '20px'}}>
                {compareResults.map((data, idx) => (
                  <div key={idx} className="card half" style={{height: 'auto'}}>
                    <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px'}}>
                      <h3 style={{margin: 0}}>{tempCompareStations[idx]?.display_name}</h3>
                      <span style={{ padding: '4px 10px', background: LINE_COLORS[tempCompareStations[idx]?.line], color: 'white', borderRadius: '12px', fontSize: '10px' }}>{tempCompareStations[idx]?.line}호선</span>
                    </div>
                    <div style={{fontSize: '14px', color: '#444'}}>
                      <p>입지 등급: <strong>{data.location_grade}</strong></p>
                      <p>방어력: <strong>{(data.recovery_rate * 100).toFixed(1)}%</strong></p>
                    </div>
                    <div style={{ height: '150px', marginTop: '15px' }}>
                      <Bar 
                        data={{ 
                          labels: ['17년','18년','19년', '20년', '21년'], 
                          datasets: [{ 
                            label: '유동량',
                            data: [data.v2017,data.v2018,data.v2019, data.v2020, data.v2021], 
                            backgroundColor: LINE_COLORS[tempCompareStations[idx]?.line] 
                          }] 
                        }} 
                        options={{ maintainAspectRatio: false, plugins: { legend: { display: false } } }} 
                      />
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