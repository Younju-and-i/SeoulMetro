import { LineChart, Line, XAxis, YAxis, Tooltip } from "recharts";
import axios from "axios";
import { useEffect, useState } from "react";

export default function TotalFlowChart() {
  const [data, setData] = useState([]);

  useEffect(() => {
    axios.get("http://localhost:8000/api/total-flow")
      .then(res => setData(res.data));
  }, []);

  return (
    <LineChart width={600} height={300} data={data}>
      <XAxis dataKey="날짜" />
      <YAxis />
      <Tooltip />
      <Line type="monotone" dataKey="total" />
    </LineChart>
  );
}