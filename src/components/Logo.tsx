import React from 'react';

interface LogoProps {
  className?: string;
}

/** The full "gate" mark: film-strip-as-Brandenburg-Gate with an OV monogram on the attic. */
const Logo: React.FC<LogoProps> = ({ className }) => (
  <svg viewBox="0 -18 120 114" className={className} fill="none" aria-hidden="true">
    <path
      fillRule="evenodd"
      fill="currentColor"
      d="M12 21H108V35H12Z M10 67H110V81H10Z M15 25H21V32H15Z M27 25H33V32H27Z M39 25H45V32H39Z M51 25H57V32H51Z M63 25H69V32H63Z M75 25H81V32H75Z M87 25H93V32H87Z M99 25H105V32H99Z M15 70H21V77H15Z M27 70H33V77H27Z M39 70H45V77H39Z M51 70H57V77H51Z M63 70H69V77H63Z M75 70H81V77H75Z M87 70H93V77H87Z M99 70H105V77H99Z"
    />
    <g fill="currentColor">
      <rect x="20" y="35" width="8" height="32" />
      <rect x="42" y="35" width="8" height="32" />
      <rect x="72" y="35" width="8" height="32" />
      <rect x="94" y="35" width="8" height="32" />
    </g>
    <g fill="currentColor">
      <path d="M7 18.9 Q7 18.2 7.8 18.2 L112.2 18.2 Q113 18.2 113 18.9 L109 22.7 L11 22.7 Z" />
      <rect x="11" y="16.8" width="98" height="1.9" rx="0.95" />
      <path
        fillRule="evenodd"
        d="M28 18.8 L28 16 L38 16 L38 13 L48 13 L48 8 L72 8 L72 13 L82 13 L82 16 L92 16 L92 18.8 Z M30 16.3 H47 V17.1 H30 Z M31 17.5 H47 V18.3 H31 Z M73 16.3 H90 V17.1 H73 Z M73 17.5 H89 V18.3 H73 Z M40 13.7 H47 V14.5 H40 Z M40 15 H47 V15.8 H40 Z M73 13.7 H80 V14.5 H73 Z M73 15 H80 V15.8 H73 Z"
      />
      <text
        x="60"
        y="6.6"
        textAnchor="middle"
        fontFamily="DM Serif Display, Georgia, serif"
        fontSize="18"
        fontWeight="700"
        style={{ letterSpacing: '-1px' }}
      >
        OV
      </text>
    </g>
  </svg>
);

export default Logo;
