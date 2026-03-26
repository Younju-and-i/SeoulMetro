import React from 'react';
import { Bar } from 'react-chartjs-2';
import { LINE_COLORS } from '@constants/subway.js';

const ComparisonReport = ({ results }) => {
  if (!results || results.length === 0) return null;

  return (
    <div className="compare-dashboard">
      <div className="compare-title">⚖️ 후보지별 비교 분석</div>
      <div className="row">
        {results.map((data, idx) => (
          <div key={idx} className="card half h-auto">
            <div className="compare-header-row">
              {/* tempCompareStations가 아닌 data 안에 저장된 stationInfo를 사용 */}
              <h3>{data.stationInfo?.display_name}</h3>
              <span 
                className="line-badge" 
                style={{ background: LINE_COLORS[data.stationInfo?.line] }}
              >
                {data.stationInfo?.line}호선
              </span>
            </div>
            <div className="compare-info">
              <p>입지 등급: <strong>{data.location_grade}</strong></p>
              <p>방어력: <strong>{(data.recovery_rate * 100).toFixed(1)}%</strong></p>
            </div>
            <div className="compare-chart-wrapper">
              <Bar 
                data={{ 
                    labels: ['17', '18', '19', '20', '21'], 
                    datasets: [{ 
                    data: [data.v2017, data.v2018, data.v2019, data.v2020, data.v2021], 
                    backgroundColor: LINE_COLORS[data.stationInfo?.line] 
                    }] 
                }} 
                options={{ 
                    maintainAspectRatio: false, 
                    plugins: { 
                    legend: { display: false } 
                    },
                    scales: {
                    y: {
                        beginAtZero: true, // 0부터 시작
                        min: 0,            // 최저치 0 고정
                        suggestedMax: 250000, // 기본 최대치 25만 (데이터가 이보다 크면 자동으로 확장됨)
                        ticks: {
                        // 천 단위 콤마 표시 (선택 사항이지만 가독성에 좋습니다)
                        callback: (value) => value.toLocaleString()
                        }
                    }
                    }
                }} 
                />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ComparisonReport;