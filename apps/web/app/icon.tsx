import { ImageResponse } from 'next/og';

export const size = { width: 256, height: 256 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #6A4CFF 0%, #00C896 100%)',
          borderRadius: 48,
        }}
      >
        <svg viewBox="0 0 48 48" width="190" height="190" aria-hidden>
          <path
            d="M13 28c0-4.418 4.03-8 9-8h4c2.761 0 5-1.79 5-4s-2.239-4-5-4h-8"
            fill="none"
            stroke="#0A0A10"
            strokeWidth="4"
            strokeLinecap="round"
          />
          <path
            d="M35 20c0 4.418-4.03 8-9 8h-4c-2.761 0-5 1.79-5 4s2.239 4 5 4h8"
            fill="none"
            stroke="#0A0A10"
            strokeWidth="4"
            strokeLinecap="round"
            opacity=".9"
          />
        </svg>
      </div>
    ),
    size,
  );
}
