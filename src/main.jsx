import React from 'react';
import { createRoot } from 'react-dom/client';
import App from '../peleg_trading_cockpit_os_base';
import './styles.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
