import { useState, useEffect, useMemo, useRef } from 'react';
import api from '@api/config.js';

export const useSubwayData = () => {
  const [mapLoaded, setMapLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [analysisMode, setAnalysisMode] = useState('single'); 
  const [lineData, setLineData] = useState({});
  const [availableMonths, setAvailableMonths] = useState([]);
  const [selectedLine, setSelectedLine] = useState('전체');
  const [selectedMonth, setSelectedMonth] = useState('');
  
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [gradeFilter, setGradeFilter] = useState('ALL');

  const [tempSelectedStation, setTempSelectedStation] = useState(null);
  const [tempCompareStations, setTempCompareStations] = useState([]);
  const [detailData, setDetailData] = useState(null); 
  const [compareResults, setCompareResults] = useState([]);
  const mapRef = useRef(null);
  const overlaysRef = useRef([]);

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

  // 1. 선택된 날짜에서 연도만 추출
  const targetYear = selectedMonth.split('-')[0];

  // 2. API 호출 시 params에 target_year를 실어서 보냅니다.
  api.get('stations', { 
    params: { target_year: targetYear } 
  })
  .then(res => {
    // 백엔드 응답 구조에 맞춰 데이터 추출 (res.data.data)
    const stationsArray = res.data.data || []; 
    const grouped = {};
    
    stationsArray.forEach(s => {
      const l = String(s.line_num);
      if (!grouped[l]) grouped[l] = [];
      grouped[l].push({ ...s, line: l });
    });
    setLineData(grouped);
  })
  .catch(err => console.error("역 목록 갱신 에러:", err))
  .finally(() => setIsLoading(false));
}, [selectedMonth]);

  // 필터링 로직에 상권 성격(area_type)과 추천 업종(recommended_biz) 조건
  const filteredStations = useMemo(() => {
    const all = selectedLine === '전체' ? Object.values(lineData).flat() : (lineData[selectedLine] || []);
    return all
      .filter(s => {
        const matchSearch = (s.display_name || '').includes(searchTerm);
        const matchType = typeFilter === 'ALL' || s.area_type === typeFilter;
        const matchGrade = gradeFilter === 'ALL' || s.location_grade === gradeFilter;
        
        return matchSearch && matchType && matchGrade;
      })
      .sort((a, b) => a.display_name.localeCompare(b.display_name));
    // [확인] 의존성 배열 철자 확인
  }, [lineData, selectedLine, searchTerm, typeFilter, gradeFilter]); 

  return {
    state: { 
      mapLoaded, isLoading, searchTerm, analysisMode, lineData, 
      availableMonths, selectedLine, selectedMonth, 
      tempSelectedStation, tempCompareStations, detailData, 
      compareResults, filteredStations,
      typeFilter, gradeFilter
    },
    refs: { mapRef, overlaysRef },
    actions: { 
      setMapLoaded, setIsLoading, setSearchTerm, setAnalysisMode, 
      setLineData, setAvailableMonths, setSelectedLine, setSelectedMonth, 
      setTempSelectedStation, setTempCompareStations, setDetailData, setCompareResults,
      setTypeFilter, setGradeFilter 
    }
  };
};