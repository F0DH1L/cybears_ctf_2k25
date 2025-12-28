import axios from 'axios';
import Cookies from 'js-cookie';


const API_URL = process.env.NEXT_PUBLIC_API_URL


const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to include credentials
api.interceptors.request.use((config) => {
  const token = Cookies.get('session');
  if (token) {
    config.headers['Authorization'] = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor to handle errors globally
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // If a response is available, use its data, otherwise use the error message
    const err = error.response ? error.response.data : error.message;
    return Promise.reject(err);
  }
);

export const authService = {
  login: async (username: string, password: string) => {
    try {
      const response = await api.post('/api/auth/login', { username, password });
      return response.data;
    } catch (error) {
      throw error;
    }
  },
  
  register: async (username: string, password: string) => {
    try {
      const response = await api.post('/api/auth/register', { username, password });
      return response.data;
    } catch (error) {
      throw error;
    }
  },
  
  logout: async () => {
    try {
      const response = await api.post('/api/auth/logout');
      Cookies.remove('session');
      return response.data;
    } catch (error) {
      return {"message": "Error happened"+error};
    }
  }
};

export const fileService = {
  createFile: async (content: string) => {
    try {
      const response = await api.post('/api/files', { content });
      return response.data;
    } catch (error) {
      return {"message": error};
    }
  },
  
  getFile: async (filename: string) => {
    try {
      const response = await api.get(`/api/files/details/${filename}`);
      return response.data;
    } catch (error) {
      return {"message": "Error happened"+error};
    }
  },
  
  deleteFile: async (filename: string) => {
    try {
      const response = await api.delete(`/api/files/${filename}`);
      return response.data;
    } catch (error) {
      return {"message": "Error happened"+error};
    }
  },
  
  getAllFiles: async () => {
    try {
      const response = await api.get('/api/files');
      return response.data;
    } catch (error) {
      return {"message": "Error happened"+error};
    }
  },

  updateVisits: async (filename: string, data: string) => {
    try {
      const response = await api.post(`/api/files/${filename}`, data);
      return response.data;
    } catch (error) {
      return {"message": "Error happened"+error};
    }
  }
};
