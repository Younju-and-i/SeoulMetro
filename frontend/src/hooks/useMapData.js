import { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import api from '@/api/config';
import { LINE_COLORS } from '@/constants/subway';

export const useMapData = () => {
  const [mapLoaded, setMapLoaded] = useState(false);
  const [lineData, setLineData] = useState({});
  const [availableMonths, setAvailableMonths] = useState([]);
  const [selectedLine, setSelectedLine] = useState('전체');
  const [selectedMonth, setSelectedMonth] = useState('');
  const [selectedDay, setSelectedDay] = useState('01');
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [analysisMode, setAnalysisMode] = useState('single');
  const [selectedStation, setSelectedStation] = useState(null);
  const [compareStations, setCompareStations] = useState([]);
  const [isComparing, setIsComparing] = useState(false);
  const [detailData, setDetailData] = useState(null);
  const [compareResults, setCompareResults] = useState([]);

  const mapRef = useRef(null);
  const overlaysRef = useRef([]);

  // 1. 카카오맵 SDK 로드
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
  }, []);

  // 2. 가용 날짜(기준월) 로드
  useEffect(() => {
    api.get('available-dates').then(res => {
      setAvailableMonths(res.data);
      if (res.data.length > 0) setSelectedMonth(res.data[0]);
    });
  }, []);

  // 3. 선택된 월의 전체 역 정보 로드
  useEffect(() => {
    if (!selectedMonth) return;
    setIsLoading(true);
    api.get('stations', { params: { month: selectedMonth } })
      .then(res => {
        const grouped = res.data.reduce((acc, s) => {
          const line = String(s.호선 || '1');
          if (!acc[line]) acc[line] = [];
          acc[line].push({ ...s, line });
          return acc;
        }, {});
        setLineData(grouped);
      })
      .finally(() => setIsLoading(false));
  }, [selectedMonth]);

  // 4. [중요] 단일 역 선택 시 상세 분석 데이터 로드 (분석 기능의 핵심)
  useEffect(() => {
    if (analysisMode === 'single' && selectedStation && selectedMonth) {
      const fullDate = `${selectedMonth}-${selectedDay.padStart(2, '0')}`;
      setIsLoading(true);
      
      api.get('station-detail', { 
        params: { 
          station: selectedStation.역명, 
          date: fullDate, 
          line: selectedStation.line 
        } 
      })
      .then(res => {
        setDetailData(res.data);
      })
      .catch(err => {
        console.error("상세 데이터 로드 실패:", err);
        setDetailData(null);
      })
      .finally(() => setIsLoading(false));
    }
  }, [selectedStation, selectedMonth, selectedDay, analysisMode]);

  // 5. 역 선택 핸들러
  const handleSelectStation = useCallback((name, line) => {
    if (isLoading) return;
    const allStations = Object.values(lineData).flat();
    const target = allStations.find(s => s.역명 === name && s.line === line);
    
    if (!target) return;

    if (analysisMode === 'single') {
      setSelectedStation(target);
    } else {
      setIsComparing(false);
      setCompareStations(prev => {
        const isExist = prev.find(p => p.역명 === name && p.line === line);
        if (isExist) return prev.filter(p => p.역명 !== name || p.line !== line);
        return prev.length >= 3 ? [...prev.slice(1), target] : [...prev, target];
      });
    }
  }, [lineData, isLoading, analysisMode]);

  // 6. 비교 분석 실행 함수 (AnalysisPanel에서 호출)
  const startComparison = useCallback(async () => {
    if (compareStations.length < 2) return;
    
    setIsLoading(true);
    try {
      const fullDate = `${selectedMonth}-${selectedDay.padStart(2, '0')}`;
      const promises = compareStations.map(s => 
        api.get('station-detail', { 
          params: { station: s.역명, date: fullDate, line: s.line } 
        })
      );
      
      const results = await Promise.all(promises);
      setCompareResults(results.map(r => r.data));
      setIsComparing(true);
    } catch (err) {
      console.error("비교 분석 중 오류 발생:", err);
      alert("비교 분석 데이터를 불러오는 중 오류가 발생했습니다.");
    } finally {
      setIsLoading(false);
    }
  }, [compareStations, selectedMonth, selectedDay]);

  // 7. 검색 및 필터링된 역 리스트 (Sidebar에서 사용)
  const filteredStations = useMemo(() => {
    const all = selectedLine === '전체' ? Object.values(lineData).flat() : (lineData[selectedLine] || []);
    return all
      .filter(s => s.역명.includes(searchTerm))
      .sort((a, b) => a.역명.localeCompare(b.역명));
  }, [lineData, selectedLine, searchTerm]);

  // 하위 컴포넌트로 전달할 모든 상태와 함수
  return {
    mapLoaded,
    selectedMonth, setSelectedMonth, availableMonths,
    selectedDay, setSelectedDay,
    selectedLine, setSelectedLine,
    searchTerm, setSearchTerm,
    isLoading, setIsLoading,
    analysisMode, setAnalysisMode,
    selectedStation, setSelectedStation,
    compareStations, setCompareStations,
    isComparing, setIsComparing,
    detailData, setDetailData,
    compareResults, setCompareResults,
    filteredStations,
    handleSelectStation,
    startComparison // 분석 패널의 버튼 기능 연결을 위해 필수
  };
};