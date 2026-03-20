import { BarChart, Bar, XAxis, YAxis, Tooltip } from "recharts";
import axios from "axios";
import { useEffect, useState } from "react";

export default function HolidayChart() {
  const [data, setData] = useState([]);

  useEffect(() => {
    axios.get("http://localhost:8000/api/holiday-flow")
      .then(res => setData(res.data));
  }, []);

  return (
    <div>
      <h3>📅 공휴일 vs 평일</h3>
      <BarChart width={600} height={300} data={data}>
        <XAxis dataKey="공휴일구분" />
        <YAxis />
        <Tooltip />
        <Bar dataKey="avg_flow" />
      </BarChart>
    </div>
  );
}