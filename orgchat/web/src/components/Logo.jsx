const SIZE_MAP = {
  sm: { icon: 56 }, // Significant bump for sidebar usage
  md: { icon: 72 },
  lg: { icon: 100 },
  xl: { icon: 150 },
  xxl: { icon: 260 }
}

export default function Logo({ size = 'md' }) {
  const { icon } = SIZE_MAP[size] ?? SIZE_MAP.md

  return (
    <div className="flex items-center">
      <img 
        src="/assests/logo.jpeg" 
        alt="Organization Logo" 
        style={{ width: icon, height: 'auto', objectFit: 'contain' }}
        className="rounded-lg transition-all duration-300 shadow-sm"
        onError={(e) => {
          if (!e.target.src.includes('logo.png')) {
             e.target.src = '/assets/logo.png';
          }
        }}
      />
    </div>
  )
}
