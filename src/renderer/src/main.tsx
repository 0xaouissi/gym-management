import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

const container = document.getElementById('root')
if (!container) {
  throw new Error('Root container is missing from index.html')
}

ReactDOM.createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
