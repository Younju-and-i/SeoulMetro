import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import axios from 'axios';
import { Line, Bar } from 'react-chartjs-2';
import { 
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, 
  BarElement, Title, Tooltip, Legend, Filler 
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, Filler);

const Map = () => {
  const [mapLoaded, setMapLoaded] = useState(false);
  const [lineData, setLineData] = useState({});
  const [selectedLine, setSelectedLine] = useState('전체');
  const [selectedMonth, setSelectedMonth] = useState('2019-01');
  const [selectedDay, setSelectedDay] = useState('01');
  const [selectedStation, setSelectedStation] = useState(null);
  const [detailData, setDetailData] = useState(null);
  const [covidData, setCovidData] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  
  // ✅ 로딩 상태 추가
  const [isListLoading, setIsListLoading] = useState(false);
  const [isDetailLoading, setIsDetailLoading] = useState(false);

  const mapRef = useRef(null);
  const overlaysRef = useRef([]);

  const lineColors = { 
    '1': '#0052A4', '2': '#00A84D', '3': '#EF7C1C', '4': '#00A1E1', 
    '5': '#996CAC', '6': '#CD7C2F', '7': '#747F00', '8': '#E6186C' 
  };

  const timeLabels = ['06시 이전', '06-08시', '08-10시', '10-12시', '12-14시', '14-16시', '16-18시', '18-20시', '20-22시', '22-24시', '24시 이후'];

  const processHourlyData = (hourlyArray) => {
    if (!hourlyArray || hourlyArray.length < 20) return new Array(11).fill(0);
    const processed = [hourlyArray[0] || 0];
    for (let i = 1; i <= 17; i += 2) {
      processed.push((hourlyArray[i] || 0) + (hourlyArray[i + 1] || 0));
    }
    processed.push(hourlyArray[19] || 0);
    return processed;
  };

  // --- 전체 역 목록 로드 ---
  useEffect(() => {
    const KAKAO_MAP_KEY = import.meta.env.VITE_KAKAO_MAP_KEY;
    if (!window.kakao) {
      const script = document.createElement('script');
      script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_MAP_KEY}&autoload=false`;
      script.onload = () => window.kakao.maps.load(() => setMapLoaded(true));
      document.head.appendChild(script);
    } else { setMapLoaded(true); }

    setIsListLoading(true); // 로딩 시작
    axios.get("http://localhost:8000/api/stations", { params: { month: selectedMonth } })
      .then(res => {
        const grouped = res.data.reduce((acc, s) => {
          const line = String(s.호선 || '1').split('_')[0];
          if (!acc[line]) acc[line] = [];
          acc[line].push({ ...s, line });
          return acc;
        }, {});
        setLineData(grouped);
      })
      .finally(() => setIsListLoading(false)); // 로딩 종료
  }, [selectedMonth]);

  // --- 상세 데이터 로드 ---
  useEffect(() => {
    if (selectedStation) {
      setIsDetailLoading(true); // 상세 로딩 시작
      const fullDate = `${selectedMonth}-${selectedDay.padStart(2, '0')}`;
      
      const detailReq = axios.get(`http://localhost:8000/api/station-detail`, { 
        params: { station: selectedStation.역명, date: fullDate, line: selectedStation.line } 
      });
      const covidReq = axios.get(`http://localhost:8000/api/station-covid`, { 
        params: { station: selectedStation.역명 } 
      });

      Promise.all([detailReq, covidReq])
        .then(([detailRes, covidRes]) => {
          setDetailData(detailRes.data);
          setCovidData(covidRes.data);
        })
        .finally(() => setIsDetailLoading(false)); // 상세 로딩 종료
    }
  }, [selectedDay, selectedStation, selectedMonth]);

  const filteredStations = useMemo(() => {
    const all = selectedLine === '전체' ? Object.values(lineData).flat() : (lineData[selectedLine] || []);
    return all.filter(s => s.역명.includes(searchTerm)).sort((a, b) => a.역명.localeCompare(b.역명));
  }, [lineData, selectedLine, searchTerm]);

  const renderMap = useCallback(() => {
    if (!mapRef.current) {
      mapRef.current = new window.kakao.maps.Map(document.getElementById('map'), { 
        center: new window.kakao.maps.LatLng(37.5665, 127.02), level: 8 
      });
    }
    overlaysRef.current.forEach(ol => ol.setMap(null));
    overlaysRef.current = [];

    Object.keys(lineData).forEach(lineKey => {
      if (selectedLine !== '전체' && lineKey !== selectedLine) return;
      const color = lineColors[lineKey] || '#333';
      lineData[lineKey].forEach(s => {
        if (searchTerm && !s.역명.includes(searchTerm)) return;
        const isSelected = selectedStation?.역명 === s.역명 && selectedStation?.line === s.line;
        const pos = new window.kakao.maps.LatLng(s.lat, s.lng);
        const content = `
          <div onclick="window.selectStationByUnique('${s.역명}', '${s.line}')" style="
            width: ${isSelected ? '70px' : '16px'}; height: ${isSelected ? '70px' : '16px'}; 
            background: ${isSelected ? color : 'white'}; border: 2px solid ${color}; border-radius: 50%;
            display: flex; flex-direction: column; align-items: center; justify-content: center;
            color: white; font-size: 10px; cursor: pointer; transition: all 0.2s;
            box-shadow: ${isSelected ? '0 4px 10px rgba(0,0,0,0.3)' : 'none'};
          ">
            ${isSelected ? `<b>${s.역명}</b><div style="font-size:8px; opacity:0.8;">${(s.on_total/10000).toFixed(1)}만</div>` : ''}
          </div>
        `;
        const overlay = new window.kakao.maps.CustomOverlay({ position: pos, content, yAnchor: 0.5 });
        if (isSelected) { overlay.setZIndex(10); mapRef.current.panTo(pos); }
        overlay.setMap(mapRef.current);
        overlaysRef.current.push(overlay);
      });
    });
  }, [lineData, selectedLine, selectedStation, searchTerm]);

  useEffect(() => { if (mapLoaded) renderMap(); }, [mapLoaded, renderMap]);

  window.selectStationByUnique = (name, line) => {
    const target = Object.values(lineData).flat().find(s => s.역명 === name && s.line === line);
    setSelectedStation(target);
  };

  return (
    <div style={{ display: 'flex', width: '100vw', height: '100vh', overflow: 'hidden', fontFamily: 'Pretendard, sans-serif' }}>
      {/* 왼쪽 패널 */}
      <div style={{ width: '300px', borderRight: '1px solid #eee', display: 'flex', flexDirection: 'column', padding: '20px', background: '#fff' }}>
        <h2 style={{ margin: '0 0 5px 0' }}>Semicolon <span style={{color: '#007bff'}}>;</span></h2>
        {/* ✅ 목록 로딩 상태 표시 */}
        <p style={{ fontSize: '12px', color: '#007bff', height: '15px', margin: '0 0 15px 0' }}>
          {isListLoading ? '🔄 역 목록을 업데이트 중...' : ''}
        </p>
        
        <label style={{ fontSize: '11px', color: '#999', fontWeight: 'bold' }}>분석 월</label>
        <select value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} 
                style={{ padding: '8px', marginBottom: '15px', borderRadius: '4px', border: '1px solid #ddd' }}>
          {['2019-01', '2019-02', '2019-03', '2019-04', '2019-05', '2019-06'].map(m => <option key={m} value={m}>{m}</option>)}
        </select>

        <label style={{ fontSize: '11px', color: '#999', fontWeight: 'bold' }}>호선 필터</label>
        <select value={selectedLine} onChange={(e) => setSelectedLine(e.target.value)} 
                style={{ padding: '8px', marginBottom: '15px', borderRadius: '4px', border: '1px solid #ddd' }}>
          <option value="전체">전체 노선</option>
          {[1,2,3,4,5,6,7,8].map(n => <option key={n} value={String(n)}>{n}호선</option>)}
        </select>

        <input type="text" placeholder="역 검색..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} 
               style={{ padding: '10px', borderRadius: '8px', border: '1px solid #ddd', marginBottom: '20px', outline: 'none' }} />

        <div style={{ flex: 1, overflowY: 'auto', opacity: isListLoading ? 0.5 : 1 }}>
          {filteredStations.map((s, i) => (
            <div key={i} onClick={() => window.selectStationByUnique(s.역명, s.line)} 
                 style={{ padding: '12px 10px', cursor: 'pointer', borderBottom: '1px solid #f9f9f9', fontSize: '14px', borderRadius: '6px', marginBottom: '2px',
                          background: selectedStation?.역명 === s.역명 ? '#eef6ff' : 'transparent', transition: '0.2s' }}>
              <span style={{ color: lineColors[s.line], marginRight: '10px' }}>●</span> {s.역명}
            </div>
          ))}
        </div>
      </div>

      {/* 중앙 지도 */}
      <div id="map" style={{ flex: 1 }} />

      {/* 오른쪽 상세 패널 */}
      <div style={{ width: '400px', borderLeft: '1px solid #eee', padding: '25px', overflowY: 'auto', background: '#fff' }}>
        {selectedStation ? (
          <div style={{ opacity: isDetailLoading ? 0.5 : 1, transition: '0.3s' }}>
            {/* ✅ 상세 로딩 상태 표시 */}
            <div style={{ height: '20px', marginBottom: '5px' }}>
               {isDetailLoading && <span style={{ fontSize: '12px', color: '#007bff', fontWeight: 'bold' }}>⏳ {selectedStation.역명} 데이터 분석 중...</span>}
            </div>

            <h2 style={{ margin: '0' }}>{selectedStation.역명}</h2>
            <p style={{ color: lineColors[selectedStation.line], fontWeight: '800', marginBottom: '20px' }}>{selectedStation.line}호선 이용 패턴</p>

            <div style={{ background: '#f8f9fa', padding: '15px', borderRadius: '12px', marginBottom: '25px', border: '1px solid #eee' }}>
              <label style={{ fontWeight: 'bold', fontSize: '14px', marginRight: '10px' }}>📅 날짜 선택</label>
              <select value={selectedDay} onChange={(e) => setSelectedDay(e.target.value)} style={{ padding: '4px 8px', borderRadius: '4px' }}>
                {Array.from({length: 31}, (_, i) => String(i+1).padStart(2, '0')).map(d => <option key={d} value={d}>{d}일</option>)}
              </select>
            </div>

            {/* 바 그래프 undefined 방어 로직 적용 */}
            <div style={{ height: '200px', marginBottom: '40px' }}>
              <h4 style={{ fontSize: '14px', color: '#666', marginBottom: '10px' }}>🕒 시간대별 유동량</h4>
              <Line 
                data={{
                  labels: timeLabels,
                  datasets: [
                    { label: '승차', data: processHourlyData(detailData?.on_hourly), borderColor: lineColors[selectedStation.line], tension: 0.4, fill: false },
                    { label: '하차', data: processHourlyData(detailData?.off_hourly), borderColor: '#ff9f43', tension: 0.4, fill: false }
                  ]
                }}
                options={{ responsive: true, maintainAspectRatio: false }}
              />
            </div>

            <div style={{ height: '180px', marginBottom: '40px' }}>
              <h4 style={{ fontSize: '14px', color: '#666', marginBottom: '10px' }}>🗓️ 평일 vs 공휴일 비교</h4>
              <Bar 
                data={{
                  labels: ['평일 평균', '공휴일 평균'],
                  datasets: [{
                    label: '이용객 수',
                    // ✅ undefined 방어: 데이터가 없으면 0으로 처리
                    data: [detailData?.comparison?.weekday || 0, detailData?.comparison?.holiday || 0],
                    backgroundColor: [lineColors[selectedStation.line], '#dee2e6'],
                    borderRadius: 5
                  }]
                }}
                options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }}
              />
            </div>

            <div style={{ background: '#eef2ff', padding: '20px', borderRadius: '12px', border: '1px solid #dbeafe' }}>
              <h4 style={{ margin: '0 0 8px 0', fontSize: '15px', color: '#1e40af' }}>💡 상권 인사이트</h4>
              <p style={{ fontSize: '13px', color: '#374151', fontWeight: 'bold', marginBottom: '5px' }}>
                 분류: {detailData?.insight?.type || '데이터 없음'}
              </p>
              <p style={{ fontSize: '13px', color: '#4b5563', lineHeight: '1.5' }}>
                 {detailData?.insight?.desc || '데이터를 불러오는 중입니다...'}
              </p>
            </div>
          </div>
        ) : (
          <div style={{ textAlign: 'center', marginTop: '150px', color: '#adb5bd' }}>
             <div style={{ fontSize: '50px', marginBottom: '10px' }}>📊</div>
             <p>분석할 지하철역을<br/>클릭하거나 검색해주세요.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Map;