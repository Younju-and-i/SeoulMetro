import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:8000/api/v1/', // 여기서 한 번에 관리!
});

export default api;