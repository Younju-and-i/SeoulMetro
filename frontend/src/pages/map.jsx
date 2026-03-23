import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { Line, Bar } from 'react-chartjs-2';
import { 
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, 
  BarElement, Title, Tooltip, Legend, Filler 
} from 'chart.js';

// 기존 설정 파일들
import api from '@/api/config'; 
import { LINE_COLORS, TIME_LABELS, ANALYSIS_MONTHS } from '@/constants/subway';
import { processHourlyData } from '@/utils/dataProcessor';
import '@styles/App.css';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, Filler);

const Map = () => {
  const [mapLoaded, setMapLoaded] = useState(false);
  const [lineData, setLineData] = useState({});
  const [selectedLine, setSelectedLine] = useState('전체');
  const [selectedMonth, setSelectedMonth] = useState('2019-01');
  const [selectedDay, setSelectedDay] = useState('01');
  const [selectedStation, setSelectedStation] = useState(null);
  const [detailData, setDetailData] = useState(null);
  const [covidData, setCovidData] = useState([]); // ✅ 코로나 데이터 상태 복구
  const [searchTerm, setSearchTerm] = useState('');
  
  const [isListLoading, setIsListLoading] = useState(false);
  const [isDetailLoading, setIsDetailLoading] = useState(false);

  const mapRef = useRef(null);
  const overlaysRef = useRef([]);
  const stationRefs = useRef({}); // ✅ 목록 동기화용 Ref

  // --- 1. 카카오맵 로드 ---
  useEffect(() => {
    const KAKAO_MAP_KEY = import.meta.env.VITE_KAKAO_MAP_KEY;
    if (!window.kakao) {
      const script = document.createElement('script');
      script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_MAP_KEY}&autoload=false`;
      script.onload = () => window.kakao.maps.load(() => setMapLoaded(true));
      document.head.appendChild(script);
    } else { setMapLoaded(true); }
  }, []);

  // --- 2. 역 목록 로드 ---
  useEffect(() => {
    setIsListLoading(true);
    api.get('stations', { params: { month: selectedMonth } })
      .then(res => {
        const grouped = res.data.reduce((acc, s) => {
          const line = String(s.호선 || '1').split('_')[0];
          if (!acc[line]) acc[line] = [];
          acc[line].push({ ...s, line });
          return acc;
        }, {});
        setLineData(grouped);
      })
      .finally(() => setIsListLoading(false));
  }, [selectedMonth]);

  // --- 3. 상세 & 코로나 데이터 병렬 로드 (기능 복구) ---
  useEffect(() => {
    if (selectedStation) {
      setIsDetailLoading(true);
      const fullDate = `${selectedMonth}-${selectedDay.padStart(2, '0')}`;
      
      const detailReq = api.get('station-detail', { 
        params: { station: selectedStation.역명, date: fullDate, line: selectedStation.line } 
      });
      const covidReq = api.get('station-covid', { 
        params: { station: selectedStation.역명 } 
      });

      Promise.all([detailReq, covidReq])
        .then(([detailRes, covidRes]) => {
          setDetailData(detailRes.data);
          setCovidData(covidRes.data);
        })
        .finally(() => setIsDetailLoading(false));
    }
  }, [selectedDay, selectedStation, selectedMonth]);

  // --- 4. 역 선택 핸들러 (토글 + 지도 이동) ---
  const handleSelectStation = useCallback((name, line) => {
    setSelectedStation(prev => {
      if (prev?.역명 === name && prev?.line === line) return null;
      const target = Object.values(lineData).flat().find(s => s.역명 === name && s.line === line);
      if (target && mapRef.current) {
        mapRef.current.panTo(new window.kakao.maps.LatLng(target.lat, target.lng));
      }
      return target || null;
    });
  }, [lineData]);

  // ✅ 5. 마커 클릭 시 목록 스크롤 동기화 로직
  useEffect(() => {
    if (selectedStation) {
      const key = `${selectedStation.역명}-${selectedStation.line}`;
      const target = stationRefs.current[key];
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }, [selectedStation]);

  // --- 6. 검색 필터 ---
  const filteredStations = useMemo(() => {
    const all = selectedLine === '전체' ? Object.values(lineData).flat() : (lineData[selectedLine] || []);
    return all.filter(s => s.역명.includes(searchTerm)).sort((a, b) => a.역명.localeCompare(b.역명));
  }, [lineData, selectedLine, searchTerm]);

  // --- 7. 지도 렌더링 ---
  const renderMap = useCallback(() => {
    if (!mapRef.current && mapLoaded) {
      mapRef.current = new window.kakao.maps.Map(document.getElementById('map'), { 
        center: new window.kakao.maps.LatLng(37.5665, 127.02), level: 8 
      });
      // ✅ 지도 바탕 클릭 시 닫기 기능 복구
      window.kakao.maps.event.addListener(mapRef.current, 'click', () => setSelectedStation(null));
    }
    if (!mapRef.current) return;

    overlaysRef.current.forEach(ol => ol.setMap(null));
    overlaysRef.current = [];

    Object.keys(lineData).forEach(lineKey => {
      if (selectedLine !== '전체' && lineKey !== selectedLine) return;
      const color = LINE_COLORS[lineKey] || '#333';
      
      lineData[lineKey].forEach(s => {
        if (searchTerm && !s.역명.includes(searchTerm)) return;
        const isSelected = selectedStation?.역명 === s.역명 && selectedStation?.line === s.line;
        
        const content = document.createElement('div');
        content.style.cssText = `
          width: ${isSelected ? '70px' : '16px'}; height: ${isSelected ? '70px' : '16px'}; 
          background: ${isSelected ? color : 'white'}; border: 2px solid ${color}; border-radius: 50%;
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          color: white; font-size: 10px; cursor: pointer; transition: all 0.2s;
          box-shadow: ${isSelected ? '0 4px 10px rgba(0,0,0,0.3)' : 'none'};
        `;
        content.innerHTML = isSelected ? `<b>${s.역명}</b><div style="font-size:8px; opacity:0.8;">${(s.on_total/10000).toFixed(1)}만</div>` : '';
        
        content.onclick = (e) => {
          e.stopPropagation();
          handleSelectStation(s.역명, s.line);
        };

        const overlay = new window.kakao.maps.CustomOverlay({ 
          position: new window.kakao.maps.LatLng(s.lat, s.lng), 
          content, yAnchor: 0.5 
        });
        if (isSelected) overlay.setZIndex(10);
        overlay.setMap(mapRef.current);
        overlaysRef.current.push(overlay);
      });
    });
  }, [lineData, selectedLine, selectedStation, searchTerm, mapLoaded, handleSelectStation]);

  useEffect(() => { renderMap(); }, [renderMap]);

  return (
    <div className="dashboard-container">
      {/* 왼쪽 패널 */}
      <div className="side-panel-left">
        <h2 className="brand-logo">Semicolon <span style={{color: '#007bff'}}>;</span></h2>
        <p className="loading-text">{isListLoading ? '🔄 목록 로딩 중...' : ''}</p>
        
        <label className="filter-label">분석 월</label>
        <select className="custom-select" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)}>
          {ANALYSIS_MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
        </select>

        <label className="filter-label">호선 필터</label>
        <select className="custom-select" value={selectedLine} onChange={(e) => setSelectedLine(e.target.value)}>
          <option value="전체">전체 노선</option>
          {Object.keys(LINE_COLORS).map(n => <option key={n} value={n}>{n}호선</option>)}
        </select>

        <input className="search-input" type="text" placeholder="역 검색..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />

        <div className="station-list" style={{ opacity: isListLoading ? 0.5 : 1 }}>
          {filteredStations.map((s) => {
            const key = `${s.역명}-${s.line}`;
            return (
              <div 
                key={key}
                ref={el => stationRefs.current[key] = el} // ✅ 스크롤 동기화용 Ref 연결
                className={`station-item ${selectedStation?.역명 === s.역명 && selectedStation?.line === s.line ? 'active' : ''}`}
                onClick={() => handleSelectStation(s.역명, s.line)}
              >
                <span style={{ color: LINE_COLORS[s.line], marginRight: '10px' }}>●</span> {s.역명}
              </div>
            );
          })}
        </div>
      </div>

      {/* 지도 */}
      <div id="map" className="map-container" />

      {/* 오른쪽 상세 패널 (모든 분석 기능 복구) */}
      <div className="side-panel-right">
        {selectedStation ? (
          <div style={{ opacity: isDetailLoading ? 0.5 : 1 }}>
            <h2>{selectedStation.역명}</h2>
            <p className="line-tag" style={{ color: LINE_COLORS[selectedStation.line] }}>{selectedStation.line}호선 이용 패턴</p>

            <div className="date-selector-box">
              <label>📅 날짜 선택</label>
              <select value={selectedDay} onChange={(e) => setSelectedDay(e.target.value)}>
                {Array.from({length: 31}, (_, i) => String(i+1).padStart(2, '0')).map(d => <option key={d} value={d}>{d}일</option>)}
              </select>
            </div>

            {/* 1. 시간대별 차트 */}
            <div className="chart-section">
              <h4 className="chart-title">🕒 시간대별 유동량</h4>
              <div style={{ height: '180px' }}>
                <Line 
                  data={{
                    labels: TIME_LABELS,
                    datasets: [
                      { label: '승차', data: processHourlyData(detailData?.on_hourly), borderColor: LINE_COLORS[selectedStation.line], tension: 0.4, fill: false },
                      { label: '하차', data: processHourlyData(detailData?.off_hourly), borderColor: '#ff9f43', tension: 0.4, fill: false }
                    ]
                  }}
                  options={{ responsive: true, maintainAspectRatio: false }}
                />
              </div>
            </div>

            {/* 2. 평일 vs 공휴일 비교 (기능 복구) */}
            <div className="chart-section">
              <h4 className="chart-title">🗓️ 평일 vs 공휴일 비교</h4>
              <div style={{ height: '160px' }}>
                <Bar 
                  data={{
                    labels: ['평일 평균', '공휴일 평균'],
                    datasets: [{
                      label: '이용객 수',
                      data: [detailData?.comparison?.weekday || 0, detailData?.comparison?.holiday || 0],
                      backgroundColor: [LINE_COLORS[selectedStation.line], '#dee2e6'],
                      borderRadius: 5
                    }]
                  }}
                  options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }}
                />
              </div>
            </div>

            {/* 3. 상권 인사이트 (기능 복구) */}
            <div className="insight-box">
              <h4 className="insight-title">💡 상권 인사이트</h4>
              <p className="insight-type">분류: {detailData?.insight?.type || '분석 중...'}</p>
              <p className="insight-desc">{detailData?.insight?.desc || '데이터를 불러오는 중입니다...'}</p>
            </div>

            {/* 4. 코로나 영향 분석 (기능 복구) */}
            {covidData && covidData.length > 0 && (
              <div className="chart-section" style={{ marginTop: '30px' }}>
                <h4 className="chart-title">🦠 코로나 전후 이용객 변화</h4>
                <div style={{ height: '180px' }}>
                  <Line 
                    data={{
                      labels: covidData.map(d => d.month),
                      datasets: [{
                        label: '월간 이용객',
                        data: covidData.map(d => d.total),
                        borderColor: '#e6186c',
                        backgroundColor: '#e6186c22',
                        fill: true
                      }]
                    }}
                    options={{ responsive: true, maintainAspectRatio: false }}
                  />
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="empty-state">
            <div className="empty-icon">📊</div>
            <p>분석할 지하철역을 선택해주세요.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Map;