export const processHourlyData = (hourlyArray) => {
  if (!hourlyArray || hourlyArray.length < 20) return new Array(11).fill(0);
  
  const processed = [hourlyArray[0] || 0];
  for (let i = 1; i <= 17; i += 2) {
    processed.push((hourlyArray[i] || 0) + (hourlyArray[i + 1] || 0));
  }
  processed.push(hourlyArray[19] || 0);
  
  return processed;
};