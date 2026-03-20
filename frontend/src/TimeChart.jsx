import { BarChart, Bar, XAxis, YAxis, Tooltip } from "recharts";
import axios from "axios";
import { useEffect, useState } from "react";

export default function TimeChart() {
  const [data, setData] = useState([]);

  useEffect(() => {
    axios.get("http://localhost:8000/api/time-flow")
      .then(res => setData(res.data));
  }, []);

  return (
    <div>
      <h3>⏰ 시간대별 혼잡도</h3>
      <BarChart width={600} height={300} data={data}>
        <XAxis dataKey="시간대" />
        <YAxis />
        <Tooltip />
        <Bar dataKey="total" />
      </BarChart>
    </div>
  );
}