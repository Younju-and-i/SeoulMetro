import React from 'react';
import { LINE_COLORS } from '@/constants/subway';

const Sidebar = ({ state, actions, onSelectStation }) => {
  return (
    <aside className="sidebar">
      <h2 className="logo">Semicolon <span className="point">;</span></h2>
      
      <div className="filter-box">
        <label>데이터 기준월</label>
        <select value={state.selectedMonth} onChange={(e) => actions.setSelectedMonth(e.target.value)}>
          {state.availableMonths.map(m => <option key={m} value={m}>{m}</option>)}
        </select>

        <label>노선 선택</label>
        <select value={state.selectedLine} onChange={(e) => actions.setSelectedLine(e.target.value)}>
          <option value="전체">전체 노선</option>
          {Object.keys(LINE_COLORS).map(n => <option key={n} value={n}>{n}호선</option>)}
        </select>

        <label>상권 성격</label>
        <select value={state.typeFilter} onChange={(e) => actions.setTypeFilter(e.target.value)}>
          <option value="ALL">전체 성격</option>
          <option value="상업/유흥형">상업/유흥형</option>
          <option value="오피스형">오피스형</option>
          <option value="혼합형">혼합형</option>
        </select>

        <label>입지 등급</label>
          <select value={state.gradeFilter} onChange={(e) => actions.setGradeFilter(e.target.value)}>
            <option value="ALL">전체 등급</option>
            <option value="S">S 등급</option>
            <option value="A">A 등급</option>
            <option value="B">B 등급</option>
          </select>

        <input 
          type="text" 
          placeholder="역 검색..." 
          value={state.searchTerm} 
          onChange={(e) => actions.setSearchTerm(e.target.value)} 
        />
      </div>

      <div className="mini-station-list">
        {state.filteredStations.map((s) => (
          <div key={`${s.display_name}-${s.line}`} 
               className={`mini-item ${ (state.analysisMode==='single' ? state.tempSelectedStation?.display_name===s.display_name && state.tempSelectedStation?.line===s.line : state.tempCompareStations.some(p=>p.display_name===s.display_name && p.line===s.line)) ? 'active' : ''}`}
               onClick={() => onSelectStation(s.display_name, s.line)}>
            <span className="dot" style={{ backgroundColor: LINE_COLORS[s.line] }}></span>
            {s.display_name} <small>({s.line}호선)</small>
          </div>
        ))}
      </div>
    </aside>
  );
};

export default Sidebar;