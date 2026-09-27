import React from 'react';

interface GoogleMapsIconProps {
  className?: string;
  size?: number | string;
}

export const GoogleMapsIcon: React.FC<GoogleMapsIconProps> = ({
  className = 'w-3.5 h-3.5',
}) => {
  return (
    <svg
      className={className}
      viewBox="0 0 92.3 132.3"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        fill="#1a73e8"
        d="M60.2 2.2C55.8.8 51 0 46.1 0 32 0 19.3 6.4 10.8 16.5l21.8 18.3L60.2 2.2z"
      />
      <path
        fill="#ea4335"
        d="M10.8 16.5C4.1 24.5 0 34.9 0 46.1c0 8.7 1.7 15.7 4.6 22l28-33.3-21.8-18.3z"
      />
      <path
        fill="#4285f4"
        d="M46.2 28.5c9.7 0 17.6 7.9 17.6 17.6 0 4.3-1.6 8.3-4.2 11.4 0 0 15.1-18 28.1-33.4C82.5 14.7 72.3 8.3 60.2 2.2L32.6 34.8c3.5-3.8 8.3-6.3 13.6-6.3z"
      />
      <path
        fill="#fbbc04"
        d="M46.2 63.7c-9.7 0-17.6-7.9-17.6-17.6 0-4.1 1.4-7.8 3.8-10.8L4.6 68.1C9.4 78.4 17.8 88.5 26.5 100l33.1-39.4c-3.6 2-7.8 3.1-13.4 3.1z"
      />
      <path
        fill="#34a853"
        d="M59.6 60.6L26.5 100c14.4 19 25.4 32.3 25.7 32.3.4 0 32.7-41.4 40.1-55.9 5.8-11.3 0-17.8 0-17.8L59.6 60.6z"
      />
    </svg>
  );
};
