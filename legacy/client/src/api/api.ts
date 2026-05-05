import axios, { AxiosInstance } from 'axios';

console.log('api.ts: Creating axios instance...');

const api: AxiosInstance = axios.create({
  baseURL: '', // Empty since we're using Vite proxy
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

console.log('api.ts: Axios instance created:', !!api);

// Request interceptor for debugging
api.interceptors.request.use(
  (config) => {
    console.log('API Request interceptor:', config.method?.toUpperCase(), config.url);
    return config;
  },
  (error) => {
    console.error('API Request interceptor error:', error);
    return Promise.reject(error);
  }
);

// Response interceptor for debugging
api.interceptors.response.use(
  (response) => {
    console.log('API Response interceptor:', response.status, response.config.url);
    return response;
  },
  (error) => {
    console.error('API Response interceptor error:', error.response?.status, error.config?.url, error.message);
    return Promise.reject(error);
  }
);

console.log('api.ts: About to export api instance:', !!api);

export default api;