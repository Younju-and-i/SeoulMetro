import { BarChart, Bar, XAxis, YAxis, Tooltip } from "recharts";
import axios from "axios";
import { useEffect, useState } from "react";

export default function TopStationsChart() {
  const [data, setData] = useState([]);

  useEffect(() => {
    axios.get("http://localhost:8000/api/top-stations")
      .then(res => setData(res.data));
  }, []);

  return (
    <div>
      <h3>🔥 순유입 TOP 10 역</h3>
      <BarChart width={600} height={300} data={data}>
        <XAxis dataKey="역명" />
        <YAxis />
        <Tooltip />
        <Bar dataKey="net_flow" />
      </BarChart>
    </div>
  );
}