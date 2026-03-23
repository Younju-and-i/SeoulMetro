import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { Line, Bar } from 'react-chartjs-2';
import { 
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, 
  BarElement, Title, Tooltip, Legend, Filler, RadialLinearScale 
} from 'chart.js';

import api from '@/api/config'; 
import { LINE_COLORS, TIME_LABELS } from '@/constants/subway'; 
import { processHourlyData } from '@/utils/dataProcessor';
import '@styles/App.css';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, Filler, RadialLinearScale);

const Map = () => {
  // --- [상태 관리] ---
  const [mapLoaded, setMapLoaded] = useState(false);
  const [lineData, setLineData] = useState({});
  const [availableMonths, setAvailableMonths] = useState([]);
  const [selectedLine, setSelectedLine] = useState('전체');
  const [selectedMonth, setSelectedMonth] = useState(''); 
  const [selectedDay, setSelectedDay] = useState('01'); // 기본값 01일
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [analysisMode, setAnalysisMode] = useState('single'); 
  const [selectedStation, setSelectedStation] = useState(null); 
  const [compareStations, setCompareStations] = useState([]); 
  const [isComparing, setIsComparing] = useState(false);
  const [detailData, setDetailData] = useState(null); 
  const [covidData, setCovidData] = useState([]); 
  const [compareResults, setCompareResults] = useState([]); 

  const mapRef = useRef(null);
  const overlaysRef = useRef([]);

  // 1. 카카오맵 로드
  useEffect(() => {
    const KAKAO_MAP_KEY = import.meta.env.VITE_KAKAO_MAP_KEY;
    if (!window.kakao) {
      const script = document.createElement('script');
      script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_MAP_KEY}&autoload=false`;
      script.onload = () => window.kakao.maps.load(() => setMapLoaded(true));
      document.head.appendChild(script);
    } else { setMapLoaded(true); }
  }, []);

  // 2. 가용 날짜 로드
  useEffect(() => {
    api.get('available-dates').then(res => {
      setAvailableMonths(res.data);
      if (res.data.length > 0) setSelectedMonth(res.data[0]);
    }).catch(() => {
      const fallback = ['2019-01', '2019-02', '2019-03', '2019-04', '2019-05', '2019-06'];
      setAvailableMonths(fallback);
      setSelectedMonth(fallback[0]);
    });
  }, []);

  // 3. 노선 데이터 로드
  useEffect(() => {
    if (!selectedMonth) return;
    setIsLoading(true);
    api.get('stations', { params: { month: selectedMonth } }).then(res => {
      const grouped = res.data.reduce((acc, s) => {
        const line = String(s.호선 || '1');
        if (!acc[line]) acc[line] = [];
        acc[line].push({ ...s, line });
        return acc;
      }, {});
      setLineData(grouped);
    }).finally(() => setIsLoading(false));
  }, [selectedMonth]);

  // 4. 상세 데이터 로드 (단일 분석)
  useEffect(() => {
    if (analysisMode === 'single' && selectedStation && selectedMonth) {
      const fullDate = `${selectedMonth}-${selectedDay.padStart(2, '0')}`;
      setIsLoading(true);
      const detailReq = api.get('station-detail', { params: { station: selectedStation.역명, date: fullDate, line: selectedStation.line } });
      const covidReq = api.get('station-covid', { params: { station: selectedStation.역명 } });
      Promise.all([detailReq, covidReq]).then(([detailRes, covidRes]) => {
        setDetailData(detailRes.data);
        setCovidData(covidRes.data);
      }).finally(() => setIsLoading(false));
    }
  }, [selectedDay, selectedStation, selectedMonth, analysisMode]);

  // 5. 복수 비교 실행
  const startComparison = useCallback(() => {
    if (compareStations.length < 2) return alert("비교할 역을 2개 이상 선택해주세요.");
    setIsLoading(true);
    setIsComparing(true);
    const fullDate = `${selectedMonth}-${selectedDay.padStart(2, '0')}`;
    const requests = compareStations.map(s => api.get('station-detail', { params: { station: s.역명, date: fullDate, line: s.line } }));
    Promise.all(requests).then(res => setCompareResults(res.map(r => r.data))).finally(() => setIsLoading(false));
  }, [compareStations, selectedMonth, selectedDay]);

  // 6. 역 선택 핸들러
  const handleSelectStation = useCallback((name, line) => {
    if (isLoading) return;
    const target = Object.values(lineData).flat().find(s => s.역명 === name && s.line === line);
    if (!target) return;
    if (analysisMode === 'single') { setSelectedStation(target); } 
    else {
      setIsComparing(false);
      setCompareStations(prev => {
        const isExist = prev.find(p => p.역명 === name && p.line === line);
        if (isExist) return prev.filter(p => p.역명 !== name || p.line !== line);
        return prev.length >= 3 ? [...prev.slice(1), target] : [...prev, target];
      });
    }
  }, [lineData, isLoading, analysisMode]);

  // 검색 필터링
  const filteredStations = useMemo(() => {
    const all = selectedLine === '전체' ? Object.values(lineData).flat() : (lineData[selectedLine] || []);
    return all.filter(s => s.역명.includes(searchTerm)).sort((a, b) => a.역명.localeCompare(b.역명));
  }, [lineData, selectedLine, searchTerm]);

  // 지도 업데이트
  useEffect(() => {
    if (!mapRef.current && mapLoaded) {
      mapRef.current = new window.kakao.maps.Map(document.getElementById('map'), { center: new window.kakao.maps.LatLng(37.5665, 127.02), level: 7 });
    }
    if (!mapRef.current) return;
    overlaysRef.current.forEach(ol => ol.setMap(null));
    overlaysRef.current = [];
    filteredStations.forEach(s => {
      const isSelected = analysisMode === 'single' ? (selectedStation?.역명 === s.역명 && selectedStation?.line === s.line) : compareStations.some(p => p.역명 === s.역명 && p.line === s.line);
      const color = LINE_COLORS[s.line] || '#333';
      const content = document.createElement('div');
      content.style.cssText = `width:${isSelected?'20px':'12px'};height:${isSelected?'20px':'12px'};background:${isSelected?color:'white'};border:2px solid ${color};border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:8px;color:white;`;
      if (isSelected && analysisMode === 'compare') {
          const idx = compareStations.findIndex(p => p.역명 === s.역명 && p.line === s.line);
          if (idx !== -1) { content.innerHTML = `<b>${idx + 1}</b>`; content.style.backgroundColor = color; }
      }
      content.onclick = (e) => { e.stopPropagation(); handleSelectStation(s.역명, s.line); };
      const overlay = new window.kakao.maps.CustomOverlay({ position: new window.kakao.maps.LatLng(s.lat, s.lng), content, yAnchor: 0.5 });
      overlay.setMap(mapRef.current);
      overlaysRef.current.push(overlay);
    });
  }, [filteredStations, selectedStation, compareStations, mapLoaded, handleSelectStation, analysisMode]);

  return (
    <div className={`consulting-layout ${isLoading ? 'is-loading' : ''}`}>
      {isLoading && <div className="loading-overlay"><div className="spinner"></div><p>분석 중...</p></div>}

      <aside className="sidebar">
        <h2 className="logo">Semicolon <span className="point">;</span></h2>
        <div className="filter-box">
          <label>데이터 기준월</label>
          <select value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)}>
            {availableMonths.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          
          {/* [추가 포인트] 분석 기준일 선택창 추가 */}
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
          <input type="text" placeholder="역 검색..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
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

      <main className="report-main">
        <header className="main-header">
          <div className="header-title-group">
            <h1>Franchise Location Strategy Report</h1>
            <div className="header-info">지하철 유동인구 기반 상권 컨설팅 리포트 ({selectedMonth}-{selectedDay})</div>
          </div>
          {analysisMode === 'single' && selectedStation && (
            <div className="score-summary-card">
              <div className="score-item">
                <span className="label">추천 점수</span>
                <span className="value">{detailData?.insight?.score || '87'}<small>/100</small></span>
              </div>
              <div className="grade-badge">Grade A</div>
            </div>
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
                selectedStation ? (
                  <div className="summary-content">
                    <span className="line-tag" style={{backgroundColor: LINE_COLORS[selectedStation.line]}}>{selectedStation.line}호선</span>
                    <h2>{selectedStation.역명}역 입지 리포트</h2>
                    <div className="kpi-summary-box">
                        <div className="kpi-item"><span>상권 유형</span><strong>{detailData?.insight?.type || '오피스형'}</strong></div>
                        <div className="kpi-item"><span>성장성</span><strong>{detailData?.insight?.growth || 'High'}</strong></div>
                         <div className="kpi-section-title">🚀 추천 결과</div>
                         <div className="recommendation-row">
                           <div className="rec-card gold">
                               <div className="rank">1st</div>
                               <div className="info">
                                 <strong>주점/요리주점 (95점)</strong>
                                 <p>퇴근 시간대 유입 집중 + 높은 체류성</p>
                               </div>
                           </div>
                           <div className="rec-card">
                               <div className="rank">2nd</div>
                               <div className="info">
                                 <strong>커피전문점 (92점)</strong>
                                 <p>오전 순유입 기반 테이크아웃 수요 높음</p>
                               </div>
                           </div>
                         </div>
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
                        {s.역명} <small>({s.line}호선)</small>
                        <button onClick={() => {
                          setCompareStations(p => p.filter((_, idx) => idx !== i));
                          setIsComparing(false); 
                          setCompareResults([]); 
                        }}>×</button>
                      </div>
                    ))}
                  </div>
                  {compareStations.length >= 2 && <button className="start-btn" onClick={startComparison}>선택 항목 비교 분석 시작</button>}
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="report-content-area">
          {analysisMode === 'single' && selectedStation && detailData && (
            <div className="consulting-dashboard">
              <div className="kpi-section-title">📊 핵심 입지 지표 (Core KPI)</div>
              <div className="core-kpi-grid">
                <div className="card"><span>입지</span><strong>A+</strong></div>
                <div className="card"><span>일 유동량</span><strong>약 {(selectedStation.on_total/30/10000).toFixed(1)}만</strong></div>
                
                <div className="card highlight">
                  <span>오전 순유입</span>
                  <strong style={{color: (detailData.on_hourly?.[3] - detailData.off_hourly?.[3]) > 0 ? '#ff4d4f' : '#1890ff'}}>
                    {(detailData.on_hourly?.[3] - detailData.off_hourly?.[3]) > 0 ? '+' : ''}
                    {(detailData.on_hourly?.[3] - detailData.off_hourly?.[3] || 0).toLocaleString()}
                  </strong>
                </div>
                
                <div className="card"><span>경쟁 강도</span><strong>{detailData.insight?.competition || '보통'}</strong></div>
                <div className="card"><span>소비 성향</span><strong>{detailData.insight?.consumer || '직장인'}</strong></div>
              </div>

              <div className="kpi-section-title">🔍 상권 운영 패턴 분석</div>
              <div className="pattern-row">
                 <div className="card">
                    <h4>🕒 시간 특성 및 패턴</h4>
                    <div className="mini-stats">
                        <p>점심/저녁 비율: <strong>55:45</strong></p>
                        <p>골든 타임: <strong>11:30~13:30</strong></p>
                        <p>요일 편향성: <strong>평일 집중형</strong></p>
                    </div>
                 </div>
                 <div className="card wide">
                    <h4>📈 실시간 상권 활성도 (Market Activity Pattern)</h4>
                    <div className="chart-container-small">
                        <Line data={{ 
                          labels: TIME_LABELS, 
                          datasets: [{ 
                            label: '시간대별 유동량 (승차+하차)', 
                            data: (detailData.on_hourly || []).map((v, i) => v + (detailData.off_hourly?.[i] || 0)), 
                            borderColor: LINE_COLORS[selectedStation.line], 
                            fill: true, 
                            backgroundColor: `${LINE_COLORS[selectedStation.line]}11`,
                            tension: 0.4
                          }] 
                        }} options={{ responsive: true, maintainAspectRatio: false, animation: false, plugins: { legend: { display: false } } }} />
                    </div>
                 </div>
              </div>
            </div>
          )}
          
          {analysisMode === 'compare' && isComparing && compareResults.length > 0 && (
            <div className="compare-dashboard">
              <div className="compare-row three-column">
                {compareStations.map((station, idx) => {
                  const data = compareResults[idx];
                  if (!data) return null;

                  return (
                    <div key={`${station.역명}-${idx}`} className="compare-result-card card">
                      <span className="comp-label">후보 {idx + 1}</span>
                      <h3>{station.역명} <small>({station.line}호선)</small></h3>
                      <div className="compare-kpi-list">
                          <p>📍 상권: <strong>{data.insight?.type || '분석 중'}</strong></p>
                          <p>👥 유동: <strong>{(station.on_total / 30 / 10000).toFixed(1)}만</strong></p>
                      </div>
                      <div className="mini-chart">
                        <Bar 
                          data={{ 
                            labels: ['평일', '주말'], 
                            datasets: [{ 
                              label: '일일 평균 이용객', 
                              data: [data.comparison?.weekday || 0, data.comparison?.holiday || 0], 
                              backgroundColor: LINE_COLORS[station.line] 
                            }] 
                          }} 
                          options={{ maintainAspectRatio: false, plugins: { legend: { display: false } } }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
};

export default Map;