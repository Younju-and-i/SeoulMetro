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
    api.get('stations').then(res => {
      const stationsArray = Array.isArray(res.data) ? res.data : (res.data.data || []);
      const grouped = {};
      stationsArray.forEach(s => {
        const l = String(s.line_num);
        if (!grouped[l]) grouped[l] = [];
        grouped[l].push({ ...s, line: l });
      });
      setLineData(grouped);
    }).finally(() => setIsLoading(false));
  }, [selectedMonth]);

  const filteredStations = useMemo(() => {
    const all = selectedLine === '전체' ? Object.values(lineData).flat() : (lineData[selectedLine] || []);
    return all
      .filter(s => (s.display_name || '').includes(searchTerm))
      .sort((a, b) => a.display_name.localeCompare(b.display_name));
  }, [lineData, selectedLine, searchTerm]);

  return {
    state: { mapLoaded, isLoading, searchTerm, analysisMode, lineData, availableMonths, selectedLine, selectedMonth, tempSelectedStation, tempCompareStations, detailData, compareResults, filteredStations },
    refs: { mapRef, overlaysRef },
    actions: { setMapLoaded, setIsLoading, setSearchTerm, setAnalysisMode, setLineData, setAvailableMonths, setSelectedLine, setSelectedMonth, setTempSelectedStation, setTempCompareStations, setDetailData, setCompareResults }
  };
};