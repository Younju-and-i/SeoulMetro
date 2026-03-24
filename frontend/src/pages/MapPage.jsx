import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { Line, Radar } from 'react-chartjs-2';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement,
  BarElement, Title, Tooltip, Legend, Filler, RadialLinearScale, ArcElement
} from 'chart.js';

import api from '@/api/config';
import { LINE_COLORS, TIME_LABELS } from '@/constants/subway';
import '@styles/App.css';

ChartJS.register(
  CategoryScale, LinearScale, PointElement, LineElement, 
  BarElement, Title, Tooltip, Legend, Filler, RadialLinearScale, ArcElement
);

const Map = () => {
  // --- [상태 관리] ---
  const [mapLoaded, setMapLoaded] = useState(false); // SDK 로드 여부
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [analysisMode, setAnalysisMode] = useState('single'); 

  const [lineData, setLineData] = useState({});
  const [availableMonths, setAvailableMonths] = useState([]);
  const [selectedLine, setSelectedLine] = useState('전체');
  const [selectedMonth, setSelectedMonth] = useState('');
  
  const [tempSelectedStation, setTempSelectedStation] = useState(null);
  const [detailData, setDetailData] = useState(null); 

  // --- [카카오 맵 참조] ---
  const mapInstance = useRef(null); 
  const markerInstance = useRef(null); 

  // --- [1. 카카오 맵 SDK 동적 로드 및 지도 초기화] ---
  useEffect(() => {
    const KAKAO_MAP_KEY = import.meta.env.VITE_KAKAO_MAP_KEY;
    const container = document.getElementById('map');

    const initMap = () => {
      // autoload=false 옵션을 사용했으므로 maps.load() 콜백 사용 필수
      window.kakao.maps.load(() => {
        if (!mapInstance.current && container) {
          const options = {
            center: new window.kakao.maps.LatLng(37.5665, 126.9780),
            level: 4
          };
          mapInstance.current = new window.kakao.maps.Map(container, options);
          setMapLoaded(true);
        }
      });
    };

    if (window.kakao && window.kakao.maps) {
      initMap();
    } else {
      const script = document.createElement('script');
      script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_MAP_KEY}&autoload=false`;
      script.async = true;
      script.onload = initMap;
      document.head.appendChild(script);
    }
  }, []);

  // --- [2. 역 선택 시 지도 이동 및 마커 표시] ---
  useEffect(() => {
    // mapLoaded가 true이고 객체가 생성된 상태에서만 작동
    if (!mapLoaded || !tempSelectedStation || !mapInstance.current) return;

    const { lat, lng } = tempSelectedStation;
    const moveLatLng = new window.kakao.maps.LatLng(lat, lng);

    mapInstance.current.panTo(moveLatLng);

    if (markerInstance.current) markerInstance.current.setMap(null);
    
    const marker = new window.kakao.maps.Marker({
      position: moveLatLng
    });
    marker.setMap(mapInstance.current);
    markerInstance.current = marker;

  }, [tempSelectedStation, mapLoaded]);

  // --- [3. 컨설팅 지표 및 데이터 분석 (기존 로직 유지)] ---
  const radarData = useMemo(() => {
    if (!detailData?.metrics) return null;
    const m = detailData.metrics;
    return {
      labels: ['유동량', '회복탄력성', '집중도', '주말활성', '성장성'],
      datasets: [{
        label: '상권 역량',
        data: [
          (m.weekday_avg / 100000) * 100,
          (m.recovery_rate || 0) * 100,
          Math.min(100, (m.volatility || 0.5) * 150),
          Math.max(0, 50 + (m.holiday_sensitivity * 50)),
          75 
        ],
        backgroundColor: 'rgba(24, 144, 255, 0.2)',
        borderColor: '#1890ff',
        pointBackgroundColor: '#1890ff',
      }]
    };
  }, [detailData]);

  const handleRunAnalysis = useCallback(() => {
    if (!tempSelectedStation) return;
    setIsLoading(true);
    
    Promise.all([
      api.get('station/metrics', { params: { station_name: tempSelectedStation.display_name, line_num: tempSelectedStation.line } }),
      api.get('station/hourly', { params: { station_name: tempSelectedStation.display_name, target_month: selectedMonth, line_num: tempSelectedStation.line } }),
      api.get('station/heatmap', { params: { station_name: tempSelectedStation.display_name, target_month: selectedMonth, line_num: tempSelectedStation.line } })
    ])
    .then(([resMetrics, resHourly, resHeatmap]) => {
      setDetailData({
        stationInfo: tempSelectedStation,
        metrics: resMetrics.data,
        hourly_pattern: resHourly.data,
        heatmap: resHeatmap.data,
        insight: {
          score: resMetrics.data.analysis_score || 85,
          grade: resMetrics.data.location_grade || 'A',
          type: resMetrics.data.commercial_type || '오피스/주거 복합',
          recommendations: resMetrics.data.recommendations || [
            { rank: '1st', category: '커피 전문점', desc: '출퇴근 테이크아웃 수요 높음' },
            { rank: '2nd', category: '간편식 매장', desc: '직장인 타겟 밀키트 수요 확인' }
          ]
        }
      });
    })
    .catch(err => console.error("Analysis Error:", err))
    .finally(() => setIsLoading(false));
  }, [tempSelectedStation, selectedMonth]);

  useEffect(() => {
    api.get('available-dates').then(res => {
      const dates = res.data || [];
      setAvailableMonths(dates);
      if (dates.length > 0) setSelectedMonth(dates[dates.length - 1]);
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
          s.lines.forEach(l => {
            const line = String(l);
            if (!grouped[line]) grouped[line] = [];
            grouped[line].push({ ...s, line, display_name: s.display_name });
          });
        }
      });
      setLineData(grouped);
    }).finally(() => setIsLoading(false));
  }, [selectedMonth]);

  const renderHeatmap = () => {
    if (!detailData?.heatmap) return null;
    const data = detailData.heatmap;
    const maxFlow = Math.max(...data.map(d => d.daily_total || 1));

    return (
      <div className="summary-grid" style={{ gridTemplateColumns: 'repeat(7, 1fr)', gap: '5px' }}>
        {data.map((item, idx) => (
          <div 
            key={idx} 
            className="grid-item" 
            style={{ 
              backgroundColor: `rgba(24, 144, 255, ${Math.max(0.1, item.daily_total / maxFlow)})`,
              height: '30px', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}
          >
            <strong style={{ fontSize: '10px', color: item.daily_total / maxFlow > 0.5 ? '#fff' : '#2d3748' }}>
              {parseInt(item.day)}
            </strong>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className={`consulting-layout ${isLoading ? 'is-loading' : ''}`}>
      {isLoading && (
        <div className="loading-overlay">
          <div className="loader-content">
            <div className="spinner"></div>
            <p>데이터 분석 중...</p>
          </div>
        </div>
      )}

      <aside className="sidebar">
        <div className="logo">Semicolon<span className="point">.</span></div>
        
        <div className="analysis-tabs">
          <button className={`tab-btn ${analysisMode === 'single' ? 'active' : ''}`} onClick={() => setAnalysisMode('single')}>단일 분석</button>
          <button className={`tab-btn ${analysisMode === 'compare' ? 'active' : ''}`} onClick={() => setAnalysisMode('compare')}>비교 분석</button>
        </div>

        <div className="filter-box">
          <label>ANALYSIS PERIOD</label>
          <select value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)}>
            {availableMonths.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          
          <label>SUBWAY LINE</label>
          <select value={selectedLine} onChange={(e) => setSelectedLine(e.target.value)}>
            <option value="전체">전체 호선</option>
            {Object.keys(LINE_COLORS).map(n => <option key={n} value={n}>{n}호선</option>)}
          </select>

          <label>SEARCH STATION</label>
          <input type="text" placeholder="역명 검색..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
        </div>

        <div className="mini-station-list">
          {Object.values(lineData).flat()
            .filter(s => s.display_name.includes(searchTerm) && (selectedLine === '전체' || s.line === selectedLine))
            .map(s => (
              <div 
                key={`${s.display_name}-${s.line}`}
                className={`mini-item ${tempSelectedStation?.display_name === s.display_name && tempSelectedStation?.line === s.line ? 'active' : ''}`}
                onClick={() => setTempSelectedStation(s)}
              >
                <span className="dot" style={{ backgroundColor: LINE_COLORS[s.line] }}></span>
                {s.display_name} <small style={{marginLeft: 'auto', fontSize: '10px', opacity: 0.6}}>{s.line}호선</small>
              </div>
            ))
          }
        </div>

        <button className="start-btn" onClick={handleRunAnalysis}>분석 실행</button>
      </aside>

      <main className="report-main">
        <header className="main-header">
          <h1>입지 전략 리포트: {tempSelectedStation?.display_name || '역을 선택하세요'}</h1>
          <p className="header-info">Market Intelligence {'>'} Real-time Analysis</p>
        </header>

        <section className="top-visual-row">
          <div className="map-card">
              <div id="map" style={{ width: '100%', height: '100%' }} />
          </div>
          
          {detailData ? (
            <div className="summary-overlay-card">
              <div className="line-tag" style={{ backgroundColor: LINE_COLORS[detailData.stationInfo.line] }}>
                {detailData.stationInfo.line}호선
              </div>
              <div className="summary-grid">
                <div className="grid-item">
                  <span>종합 점수</span>
                  <strong>{detailData.insight.score}</strong>
                </div>
                <div className="grid-item">
                  <span>입지 등급</span>
                  <strong>{detailData.insight.grade}</strong>
                </div>
              </div>
              <div className="summary-desc">
                <h4>상권 유형: {detailData.insight.type}</h4>
                <p>본 지역은 {detailData.metrics.recovery_rate > 0.8 ? '안정적인' : '변동성이 큰'} 흐름을 보입니다.</p>
              </div>
            </div>
          ) : (
            <div className="summary-overlay-card" style={{display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
              <p style={{color: '#718096'}}>분석 버튼을 눌러주세요</p>
            </div>
          )}
        </section>

        {detailData && (
          <div className="report-content-area">
            <h2 className="kpi-section-title">다각도 역량 분석</h2>
            <div className="dashboard-rows">
              <div className="row">
                <div className="card half">
                  <h3>상권 역량 밸런스</h3>
                  <div className="chart-container">
                    <Radar data={radarData} options={{ maintainAspectRatio: false }} />
                  </div>
                </div>
                <div className="card half">
                  <h3>AI 추천 출점 전략</h3>
                  <div className="compare-stations-list">
                    {detailData.insight.recommendations.map((rec, i) => (
                      <div key={i} className="comp-item-tag">
                        <span className="idx">{i+1}</span>
                        <strong>{rec.category}</strong>: {rec.desc}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="row">
                <div className="card half">
                  <h3>Time-Series 유동 패턴</h3>
                  <div className="chart-container">
                    <Line 
                      data={{
                        labels: TIME_LABELS,
                        datasets: [
                          { label: '승차', data: detailData.hourly_pattern.map(d => d.avg_on), borderColor: '#3182ce', fill: true, backgroundColor: 'rgba(49, 130, 206, 0.1)' },
                          { label: '하차', data: detailData.hourly_pattern.map(d => d.avg_off), borderColor: '#e53e3e', fill: true, backgroundColor: 'rgba(229, 62, 62, 0.1)' }
                        ]
                      }} 
                      options={{ maintainAspectRatio: false }}
                    />
                  </div>
                </div>
                <div className="card half">
                  <h3>Weekly Activity (Heatmap)</h3>
                  {renderHeatmap()}
                  <div className="chart-footer">푸른색이 짙을수록 유동인구가 많은 날입니다.</div>
                </div>
              </div>
            </div>

            <h2 className="kpi-section-title">Shock Defense Index</h2>
            <div className="card full side-summary" style={{flexDirection: 'row', gap: '30px', alignItems: 'center'}}>
                <div style={{flex: 1}}>
                   <p className="insight-message">코로나19 여파 대비 회복률: <strong>{(detailData.metrics.recovery_rate * 100).toFixed(1)}%</strong></p>
                   <div className="resilience-meter">
                      <div className="meter-bar">
                        <div className="meter-fill" style={{ width: `${detailData.metrics.recovery_rate * 100}%`, backgroundColor: '#3182ce' }}></div>
                      </div>
                   </div>
                </div>
                <div style={{flex: 1.5, fontSize: '14px', color: '#4a5568', lineHeight: '1.6'}}>
                  본 상권은 외부 환경 충격에 대해 높은 수준의 방어력을 보이고 있습니다. 고정적인 오피스 수요가 탄탄하여 매출 변동성이 비교적 낮을 것으로 예측됩니다.
                </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default Map;