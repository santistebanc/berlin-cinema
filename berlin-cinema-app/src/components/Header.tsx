import React from 'react';
import { Link } from 'react-router-dom';
import { Film } from 'lucide-react';

const Header: React.FC = () => {
  return (
    <header className="w-full bg-white shadow-sm border-b border-gray-200">
      <div className="px-4">
        <div className="flex items-center justify-between h-16">
          <Link to="/" className="flex items-center space-x-2 text-cinema-600 hover:text-cinema-700 transition-colors">
            <Film className="h-8 w-8" />
            <span className="text-xl font-bold">Berlin Cinema</span>
          </Link>
          
          <div className="flex items-center space-x-4">
            <span className="text-sm text-gray-500">OV Movies in Berlin</span>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
