import React, { useEffect, useState, useRef } from 'react';
import axios from 'axios';
import { Line } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler } from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

const Home = () => {
  const [mapLoaded, setMapLoaded] = useState(false);
  const [lineData, setLineData] = useState({});
  const [selectedLine, setSelectedLine] = useState('전체');
  const [selectedMonth, setSelectedMonth] = useState('2019-01');
  const [selectedDay, setSelectedDay] = useState('01');
  const [selectedStation, setSelectedStation] = useState(null);
  const [detailData, setDetailData] = useState(null);
  
  // ✅ 검색어 상태 추가
  const [searchTerm, setSearchTerm] = useState('');

  const mapRef = useRef(null);
  const overlaysRef = useRef([]);

  const lineColors = { 
    '1': '#0052A4', '2': '#00A84D', '3': '#EF7C1C', '4': '#00A1E1', 
    '5': '#996CAC', '6': '#CD7C2F', '7': '#747F00', '8': '#E6186C' 
  };

  const timeLabels = ['06시 이전', '06-08시', '08-10시', '10-12시', '12-14시', '14-16시', '16-18시', '18-20시', '20-22시', '22-24시', '24시 이후'];

  const processHourlyData = (hourlyArray) => {
    if (!hourlyArray || hourlyArray.length < 20) return new Array(11).fill(0);
    const processed = [];
    processed.push(hourlyArray[0] || 0);
    for (let i = 1; i <= 17; i += 2) {
      processed.push((hourlyArray[i] || 0) + (hourlyArray[i + 1] || 0));
    }
    processed.push(hourlyArray[19] || 0);
    return processed;
  };

  useEffect(() => {
    const KAKAO_MAP_KEY = import.meta.env.VITE_KAKAO_MAP_KEY;
    if (!window.kakao) {
      const script = document.createElement('script');
      script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_MAP_KEY}&autoload=false`;
      script.onload = () => window.kakao.maps.load(() => setMapLoaded(true));
      document.head.appendChild(script);
    } else { setMapLoaded(true); }

    axios.get("http://localhost:8000/api/stations", { params: { month: selectedMonth } }).then(res => {
      const grouped = res.data.reduce((acc, s) => {
        const line = String(s.호선 || '1').split('_')[0];
        const stationObj = { ...s, name: s.역명 || s.name, line, on_total: s.on_total || 0, off_total: s.off_total || 0 };
        if (!acc[line]) acc[line] = [];
        acc[line].push(stationObj);
        return acc;
      }, {});
      setLineData(grouped);
      setSelectedStation(null);
    });
  }, [selectedMonth]);

  useEffect(() => {
    if (selectedStation) {
      const fullDate = `${selectedMonth}-${selectedDay.padStart(2, '0')}`;
      setDetailData(null); 

      axios.get(`http://localhost:8000/api/station-detail`, { 
        params: { 
          station: selectedStation.name, 
          date: fullDate,
          line: selectedStation.line 
        } 
      })
      .then(res => setDetailData(res.data))
      .catch(err => {
        console.error("상세 데이터 로드 실패:", err);
        setDetailData({ on_hourly: [], off_hourly: [], netflow: 0 });
      });
    }
  }, [selectedDay, selectedStation, selectedMonth]);

  useEffect(() => { if (mapLoaded && Object.keys(lineData).length > 0) renderMap(); }, [mapLoaded, lineData, selectedLine, selectedStation]);

  const renderMap = () => {
    if (!mapRef.current) {
      mapRef.current = new window.kakao.maps.Map(document.getElementById('map'), { 
        center: new window.kakao.maps.LatLng(37.5665, 127.02), 
        level: 8 
      });
    }
    overlaysRef.current.forEach(ol => ol.setMap(null));
    overlaysRef.current = [];

    Object.keys(lineData).forEach(lineKey => {
      if (selectedLine !== '전체' && lineKey !== selectedLine) return;
      const color = lineColors[lineKey] || '#333';

      lineData[lineKey].forEach(s => {
        // 검색어가 있을 때 검색어에 포함되지 않는 역은 지도에서 제외 (선택 사항)
        if (searchTerm && !s.name.includes(searchTerm)) return;

        const isSelected = selectedStation?.name === s.name && selectedStation?.line === s.line;
        const pos = new window.kakao.maps.LatLng(s.lat, s.lng);

        const content = `
          <div onclick="window.selectStationByUnique('${s.name}', '${s.line}')" style="
            width: ${isSelected ? '70px' : '14px'}; height: ${isSelected ? '70px' : '14px'}; 
            background: ${isSelected ? color : 'white'}; border: 2px solid ${color}; border-radius: 50%;
            display: flex; flex-direction: column; align-items: center; justify-content: center;
            color: white; font-size: 10px; font-weight: bold; cursor: pointer; transition: all 0.2s;
            box-shadow: ${isSelected ? '0 4px 12px rgba(0,0,0,0.3)' : 'none'};
          ">
            ${isSelected ? `
              <div style="font-size:10px; margin-bottom:2px;">${s.name}</div>
              <div style="border-top:1px solid rgba(255,255,255,0.4); padding-top:2px;">승:${(s.on_total/10000).toFixed(1)}</div>
              <div>하:${(s.off_total/10000).toFixed(1)}</div>
            ` : ''}
          </div>
        `;

        const customOverlay = new window.kakao.maps.CustomOverlay({ 
          position: pos, 
          content, 
          yAnchor: 0.5 
        });

        if (isSelected) {
          customOverlay.setZIndex(20);
          mapRef.current.panTo(pos);
        } else {
          customOverlay.setZIndex(0);
        }

        customOverlay.setMap(mapRef.current);
        overlaysRef.current.push(customOverlay);
      });
    });
  };

  window.selectStationByUnique = (name, line) => {
    setSelectedStation(prev => {
      if (prev?.name === name && prev?.line === line) return null;
      const target = Object.values(lineData).flat().find(s => s.name === name && s.line === line);
      return target || null;
    });
  };

  // ✅ 노선 필터 + 검색어 필터가 적용된 리스트
  const displayStations = (selectedLine === '전체' ? Object.values(lineData).flat() : lineData[selectedLine] || [])
    .filter(s => s.name.includes(searchTerm));

  return (
    <div style={{ display: 'flex', width: '100vw', height: '100vh', background: '#fff', overflow: 'hidden' }}>
      {/* 왼쪽: 패널 */}
      <div style={{ width: '280px', borderRight: '1px solid #eee', display: 'flex', flexDirection: 'column', padding: '20px', zIndex: 10 }}>
        <h3 style={{ margin: '0 0 20px 0', fontSize: '20px', fontWeight: 'bold' }}>Semicolon (;)</h3>
        
        <label style={{ fontSize: '11px', color: '#999' }}>분석 월</label>
        <select value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} 
                style={{ padding: '8px', marginBottom: '10px', borderRadius: '4px', border: '1px solid #ddd' }}>
          {['2019-01', '2019-02', '2019-03', '2019-04', '2019-05', '2019-06'].map(m => (
            <option key={m} value={m}>{m.replace('-', '년 ')}월</option>
          ))}
        </select>

        <label style={{ fontSize: '11px', color: '#999' }}>노선 필터</label>
        <select value={selectedLine} onChange={(e) => { setSelectedLine(e.target.value); setSelectedStation(null); }} 
                style={{ padding: '8px', marginBottom: '10px', borderRadius: '4px', border: '1px solid #ddd' }}>
          <option value="전체">전체 노선</option>
          {['1', '2', '3', '4', '5', '6', '7', '8'].map(n => <option key={n} value={n}>{n}호선</option>)}
        </select>

        {/* ✅ 역 검색창 추가 */}
        <label style={{ fontSize: '11px', color: '#999', marginTop: '5px' }}>역 이름 검색</label>
        <div style={{ position: 'relative', marginBottom: '20px' }}>
          <input 
            type="text"
            placeholder="예: 강남, 서울역"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #ddd',
              fontSize: '13px', boxSizing: 'border-box', outline: 'none', background: '#fcfcfc'
            }}
          />
          {searchTerm && (
            <span onClick={() => setSearchTerm('')} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', cursor: 'pointer', color: '#ccc' }}>✕</span>
          )}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', borderTop: '1px solid #eee' }}>
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {displayStations.length > 0 ? (
              displayStations.sort((a,b) => a.name.localeCompare(b.name)).map((s, idx) => (
                <li key={`${s.name}-${s.line}-${idx}`} onClick={() => window.selectStationByUnique(s.name, s.line)} 
                    style={{ padding: '10px 8px', cursor: 'pointer', borderBottom: '1px solid #f9f9f9', fontSize: '13px', display: 'flex', alignItems: 'center' }}>
                  <span style={{ color: lineColors[s.line], marginRight: '8px' }}>●</span>
                  <span style={{ 
                      fontWeight: (selectedStation?.name === s.name && selectedStation?.line === s.line) ? 'bold' : 'normal',
                      color: (selectedStation?.name === s.name && selectedStation?.line === s.line) ? lineColors[s.line] : '#333' 
                  }}>
                    {s.name}
                  </span>
                  <span style={{ fontSize: '10px', marginLeft: 'auto', color: '#ccc' }}>{s.line}호선</span>
                </li>
              ))
            ) : (
              <li style={{ padding: '40px 0', textAlign: 'center', color: '#ccc', fontSize: '13px' }}>검색 결과가 없습니다.</li>
            )}
          </ul>
        </div>
      </div>

      {/* 중앙: 지도 */}
      <div id="map" style={{ flex: 1 }} />

      {/* 오른쪽: 상세 데이터 */}
      <div style={{ width: '400px', borderLeft: '1px solid #eee', background: 'white', padding: '30px', overflowY: 'auto' }}>
        {selectedStation ? (
          <>
            <h2 style={{ margin: '0', fontSize: '28px' }}>{selectedStation.name}</h2>
            
            <div style={{ display: 'flex', gap: '8px', margin: '20px 0' }}>
              {Object.values(lineData).flat()
                .filter(s => s.name === selectedStation.name)
                .map(s => (
                  <button key={s.line} 
                    onClick={() => setSelectedStation(s)}
                    style={{
                      padding: '6px 14px', borderRadius: '20px', border: `1px solid ${lineColors[s.line]}`,
                      background: selectedStation.line === s.line ? lineColors[s.line] : 'white',
                      color: selectedStation.line === s.line ? 'white' : lineColors[s.line],
                      fontSize: '12px', cursor: 'pointer', fontWeight: 'bold', transition: '0.2s'
                    }}>
                    {s.line}호선
                  </button>
                ))}
            </div>

            <p style={{ color: lineColors[selectedStation.line], fontWeight: 'bold' }}>{selectedStation.line}호선 이용 패턴</p>
            
            <div style={{ margin: '20px 0', padding: '15px', background: '#f8f9fa', borderRadius: '8px' }}>
              <span style={{ fontSize: '13px', fontWeight: 'bold', marginRight: '10px' }}>조회 일자</span>
              <select value={selectedDay} onChange={(e) => setSelectedDay(e.target.value)} style={{ padding: '4px 8px' }}>
                {Array.from({length: 31}, (_, i) => String(i+1).padStart(2, '0')).map(d => <option key={d} value={d}>{d}일</option>)}
              </select>
            </div>

            <div style={{ height: '300px', marginTop: '30px' }}>
              <h4 style={{ fontSize: '14px', color: '#666', marginBottom: '15px' }}>🕒 2시간 단위 추이</h4>
              <Line 
                data={{
                  labels: timeLabels,
                  datasets: [
                    { label: '승차', data: processHourlyData(detailData?.on_hourly), borderColor: lineColors[selectedStation.line], tension: 0.4, fill: true, backgroundColor: 'rgba(0,0,0,0.02)' },
                    { label: '하차', data: processHourlyData(detailData?.off_hourly), borderColor: '#ff9f43', tension: 0.4 }
                  ]
                }}
                options={{ responsive: true, maintainAspectRatio: false }}
              />
            </div>
          </>
        ) : (
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#ccc' }}>
            <div style={{ fontSize: '50px', marginBottom: '20px' }}>📊</div>
            <p>분석할 역을 선택해 주세요.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Home;