import React from 'react';

interface FilterSectionProps {
  children: React.ReactNode;
  title: string;
}

const FilterSection: React.FC<FilterSectionProps> = ({ children, title }) => {
  return (
    <section>
      <h4 className="mb-2 text-sm font-medium" style={{ color: 'rgb(var(--text))' }}>{title}</h4>
      <div className="flex flex-wrap gap-2">{children}</div>
    </section>
  );
};

export default FilterSection;
