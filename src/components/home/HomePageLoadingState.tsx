import React from 'react';

interface HomePageLoadingStateProps {
  fullPage?: boolean;
}

const HomePageLoadingState: React.FC<HomePageLoadingStateProps> = ({ fullPage = false }) => {
  return (
    <div className={fullPage ? 'flex min-h-64 items-center justify-center' : 'flex justify-center py-8'}>
      <div className="text-center">
        <div
          className={`mx-auto animate-spin rounded-full border-b-2 ${
            fullPage ? 'h-12 w-12' : 'h-8 w-8'
          }`}
          style={{ borderColor: 'rgb(var(--accent))' }}
        />
        {fullPage && <p className="body-muted mt-4">Loading today&apos;s listings…</p>}
      </div>
    </div>
  );
};

export default HomePageLoadingState;
