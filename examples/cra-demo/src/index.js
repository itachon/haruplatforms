import React from 'react';
import ReactDOM from 'react-dom/client';

function App() {
  // Variable sin usar: genera una advertencia de ESLint (con CI=true rompería la compilación).
  const sinUsar = 1;
  return <h1>Hola desde Create React App</h1>;
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
