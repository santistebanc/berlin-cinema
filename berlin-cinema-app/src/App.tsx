import React from 'react';
import { Routes, Route } from 'react-router-dom';
import Header from './components/Header';
import HomePage from './pages/HomePage';
import MovieDetailPage from './pages/MovieDetailPage';
import CinemaPage from './pages/CinemaPage';

const App: React.FC = () => {
  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <main className="py-8">
        <Routes>
          <Route path="/" element={<div className="container mx-auto px-4"><HomePage /></div>} />
          <Route path="/movie/:title" element={<MovieDetailPage />} />
          <Route path="/cinema/:id" element={<div className="container mx-auto px-4"><CinemaPage /></div>} />
        </Routes>
      </main>
    </div>
  );
};

export default App;
