import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { LocationProvider } from './contexts/LocationContext.tsx';
import { ToastProvider } from './contexts/ToastContext.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LocationProvider>
      <ToastProvider>
        <App />
      </ToastProvider>
    </LocationProvider>
  </StrictMode>,
);
