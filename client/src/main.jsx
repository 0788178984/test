import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import App from './App.jsx';
import './styles/index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      <App />
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: {
            background: '#363636',
            color: '#fff',
          },
          // iconTheme must be { primary, secondary } — a string gets spread onto DOM and triggers React warnings.
          success: {
            duration: 3000,
            iconTheme: {
              primary: '#4ade80',
              secondary: '#363636',
            },
          },
          error: {
            duration: 5000,
            iconTheme: {
              primary: '#f87171',
              secondary: '#363636',
            },
          },
        }}
      />
    </BrowserRouter>
  </React.StrictMode>
);
