import axios from 'axios';

const envBaseUrl = import.meta.env.VITE_API_BASE_URL;

const api = axios.create({
  baseURL: `${envBaseUrl}/api/v1/`, 
  headers: {
    'Content-Type': 'application/json',
  },
});

export default api;