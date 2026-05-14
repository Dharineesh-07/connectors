import { View, Text } from 'react-native'
import { Colors } from '../theme/colors'

const SIZE_MAP = {
  sm: { icon: 28, wordmark: 14, tagline: 8,  gap: 6 },
  md: { icon: 40, wordmark: 18, tagline: 11, gap: 8 },
  lg: { icon: 56, wordmark: 24, tagline: 14, gap: 10 },
  xl: { icon: 72, wordmark: 30, tagline: 18, gap: 12 },
}

function LensIcon({ size }) {
  /*
   * Approximate the logo using layered Views (no react-native-svg needed).
   *
   * Structure (front to back):
   *   1. Red C shape: thick ring with one side open, rotated so the gap faces right
   *   2. Blue filled circle in the center (slightly smaller than C's inner radius)
   *   3. Gray concentric ring
   *   4. Dark center dot
   *
   * The C is approximated by a bordered circle with borderRightColor: 'transparent'
   * rotated -45deg so the transparent side points to the right.
   */
  const cBorder = Math.max(4, Math.round(size * 0.16))
  const blueSize = size * 0.56
  const ringSize = size * 0.36
  const ringBorder = Math.max(2, Math.round(size * 0.09))
  const dotSize = size * 0.14

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {/* Red C-shape: full ring with right side transparent, rotated */}
      <View
        style={{
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: cBorder,
          borderColor: Colors.red,
          borderRightColor: 'transparent',
          transform: [{ rotate: '45deg' }],
        }}
      />
      {/* Blue filled circle */}
      <View
        style={{
          position: 'absolute',
          width: blueSize,
          height: blueSize,
          borderRadius: blueSize / 2,
          backgroundColor: Colors.blue,
        }}
      />
      {/* Gray concentric ring */}
      <View
        style={{
          position: 'absolute',
          width: ringSize,
          height: ringSize,
          borderRadius: ringSize / 2,
          borderWidth: ringBorder,
          borderColor: '#9AAAB8',
          backgroundColor: 'transparent',
        }}
      />
      {/* Dark center dot */}
      <View
        style={{
          position: 'absolute',
          width: dotSize,
          height: dotSize,
          borderRadius: dotSize / 2,
          backgroundColor: '#4A5568',
        }}
      />
    </View>
  )
}

export default function Logo({ size = 'md', showText = true }) {
  const { icon, wordmark, tagline, gap } = SIZE_MAP[size] ?? SIZE_MAP.md

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap }}>
      <LensIcon size={icon} />
      {showText && (
        <View style={{ justifyContent: 'center' }}>
          <Text
            style={{
              fontSize: wordmark,
              fontWeight: '800',
              color: Colors.red,
              letterSpacing: -0.4,
              lineHeight: wordmark * 1.15,
            }}
          >
            COMPUNET
          </Text>
          <Text
            style={{
              fontSize: tagline,
              fontWeight: '400',
              color: Colors.blue,
              letterSpacing: 1.2,
            }}
          >
            connections
          </Text>
        </View>
      )}
    </View>
  )
}
