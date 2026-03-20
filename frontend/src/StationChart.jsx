import { LineChart, Line, XAxis, YAxis, Tooltip } from "recharts";
import axios from "axios";
import { useEffect, useState } from "react";

export default function StationChart() {
  const [data, setData] = useState([]);
  const [station, setStation] = useState("강남");

  useEffect(() => {
    axios.get(`http://localhost:8000/api/station/${station}`)
      .then(res => setData(res.data));
  }, [station]);

  return (
    <div>
      <h3>📍 역별 순유입</h3>

      <input
        value={station}
        onChange={(e) => setStation(e.target.value)}
      />

      <LineChart width={600} height={300} data={data}>
        <XAxis dataKey="날짜" />
        <YAxis />
        <Tooltip />
        <Line type="monotone" dataKey="순유입" />
      </LineChart>
    </div>
  );
}