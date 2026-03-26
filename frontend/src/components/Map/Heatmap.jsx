import React from 'react';

const Heatmap = ({ data }) => {
  if (!data || data.length === 0) return <div className="placeholder-chart-msg">데이터 대기 중...</div>;
  
  const maxFlow = Math.max(...data.map(d => d.count || 0));
  const firstDate = new Date(data[0].date);
  let firstDayShift = firstDate.getDay();
  firstDayShift = firstDayShift === 0 ? 6 : firstDayShift - 1;
  const blanks = Array.from({ length: firstDayShift }, (_, i) => <div key={`blank-${i}`} className="heatmap-blank" />);

  return (
    <div className="heatmap-container">
      <div className="heatmap-header">{['월', '화', '수', '목', '금', '토', '일'].map(day => <div key={day}>{day}</div>)}</div>
      <div className="heatmap-grid">
        {blanks}
        {data.map((item) => {
          const ratio = item.count / (maxFlow || 1);
          return (
            <div key={item.date} className="heatmap-cell" style={{ background: `rgba(24, 144, 255, ${Math.max(0.1, ratio)})` }} title={`${item.date} (${item.day_label}): ${item.count?.toLocaleString()}명`}>
              <span className="heatmap-date">{new Date(item.date).getDate()}</span>
              <span className="heatmap-label">{item.day_label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default Heatmap;