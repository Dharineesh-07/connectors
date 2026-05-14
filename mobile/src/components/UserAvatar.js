import { Image, Text, View } from 'react-native'
import { Colors } from '../theme/colors'

const SIZES = {
  xs:  { box: 24, text: 10, dot: 6  },
  sm:  { box: 32, text: 12, dot: 8  },
  md:  { box: 40, text: 14, dot: 10 },
  lg:  { box: 48, text: 18, dot: 12 },
  xl:  { box: 64, text: 22, dot: 14 },
  xxl: { box: 80, text: 28, dot: 16 },
}

function getInitials(name) {
  if (!name) return '?'
  return name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
}

export default function UserAvatar({ user, size = 'md', online = false }) {
  // Accept legacy numeric size for backward compatibility
  const preset = typeof size === 'string' ? SIZES[size] ?? SIZES.md : null
  const box  = preset ? preset.box  : size
  const text = preset ? preset.text : Math.max(size * 0.35, 10)
  const dot  = preset ? preset.dot  : Math.max(size * 0.28, 8)

  const initials = getInitials(user?.display_name || user?.full_name)

  return (
    <View style={{ position: 'relative', width: box, height: box }}>
      {user?.avatar_url ? (
        <Image
          source={{ uri: user.avatar_url }}
          style={{ width: box, height: box, borderRadius: box / 2, resizeMode: 'cover' }}
        />
      ) : (
        <View
          style={{
            width: box,
            height: box,
            borderRadius: box / 2,
            backgroundColor: Colors.red,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ color: Colors.white, fontSize: text, fontWeight: '700' }}>
            {initials}
          </Text>
        </View>
      )}
      {online && (
        <View
          style={{
            position: 'absolute',
            bottom: 0,
            right: 0,
            width: dot,
            height: dot,
            borderRadius: dot / 2,
            backgroundColor: Colors.online,
            borderWidth: 2,
            borderColor: Colors.white,
          }}
        />
      )}
    </View>
  )
}
