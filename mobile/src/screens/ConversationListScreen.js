import { useCallback, useEffect, useRef, useState } from 'react'
import {
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ActivityIndicator,
  RefreshControl,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import dayjs from 'dayjs'
import { listConversations } from '../api/conversations'
import { useAuth } from '../context/AuthContext'
import { useSocket } from '../context/SocketContext'
import UserAvatar from '../components/UserAvatar'
import Logo from '../components/Logo'
import { Colors } from '../theme/colors'
import { Typography } from '../theme/typography'

function ConvItem({ item, currentUserId, onPress, onlineSet }) {
  const isDirect = item.type === 'direct'
  const other = isDirect ? item.members?.find((m) => m.user_id !== currentUserId) : null
  const name = isDirect
    ? other?.user?.display_name || other?.user?.full_name
    : item.name

  const lastMsg = item.last_message
  const preview = lastMsg
    ? lastMsg.type !== 'text'
      ? `[${lastMsg.type}]`
      : lastMsg.content?.slice(0, 60)
    : 'No messages yet'

  const isOnline = isDirect && onlineSet.has(other?.user_id)
  const avatarUser = isDirect
    ? other?.user
    : { full_name: item.name, avatar_url: item.avatar_url }

  return (
    <TouchableOpacity style={styles.item} onPress={() => onPress(item)} activeOpacity={0.7}>
      <UserAvatar user={avatarUser} size="md" online={isOnline} />
      <View style={styles.itemContent}>
        <View style={styles.itemRow}>
          <Text style={styles.itemName} numberOfLines={1}>{name}</Text>
          {lastMsg && (
            <Text style={styles.itemTime}>{dayjs(lastMsg.created_at).format('HH:mm')}</Text>
          )}
        </View>
        <View style={styles.itemRow}>
          <Text style={styles.itemPreview} numberOfLines={1}>{preview}</Text>
          {item.unread_count > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>
                {item.unread_count > 9 ? '9+' : item.unread_count}
              </Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  )
}

export default function ConversationListScreen({ navigation }) {
  const { user } = useAuth()
  const { on } = useSocket()
  const insets = useSafeAreaInsets()
  const [conversations, setConversations] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [onlineSet, setOnlineSet] = useState(new Set())
  const currentConvId = useRef(null)

  const fetchConversations = useCallback(async () => {
    try {
      const data = await listConversations()
      setConversations(data)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { fetchConversations() }, [fetchConversations])

  useEffect(() => {
    const off1 = on('user:online', (data) =>
      setOnlineSet((prev) => new Set([...prev, data.user_id]))
    )
    const off2 = on('user:offline', (data) =>
      setOnlineSet((prev) => { const n = new Set(prev); n.delete(data.user_id); return n })
    )
    const off3 = on('message:new', (data) => {
      setConversations((prev) => {
        const idx = prev.findIndex((c) => c.id === data.conversation_id)
        if (idx === -1) return prev
        const updated = {
          ...prev[idx],
          last_message: data,
          unread_count:
            data.conversation_id !== currentConvId.current
              ? (prev[idx].unread_count ?? 0) + 1
              : prev[idx].unread_count,
        }
        const next = [...prev]
        next.splice(idx, 1)
        return [updated, ...next]
      })
    })
    return () => { off1(); off2(); off3() }
  }, [on])

  const handlePress = (conv) => {
    currentConvId.current = conv.id
    navigation.navigate('Chat', { conversationId: conv.id, conversation: conv })
  }

  if (loading) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={Colors.red} size="large" />
      </View>
    )
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Logo size="sm" />
      </View>
      <FlatList
        data={conversations}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <ConvItem
            item={item}
            currentUserId={user?.id}
            onPress={handlePress}
            onlineSet={onlineSet}
          />
        )}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); fetchConversations() }}
            tintColor={Colors.red}
          />
        }
        ListEmptyComponent={
          <View style={styles.center}>
            <Text style={styles.emptyText}>No conversations yet</Text>
          </View>
        }
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.grayBg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray100,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 14,
    backgroundColor: Colors.white,
  },
  itemContent: { flex: 1 },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 3,
  },
  itemName: { ...Typography.headingSm, flex: 1, marginRight: 8 },
  itemTime: { ...Typography.caption },
  itemPreview: { ...Typography.secondary, flex: 1, marginRight: 8 },
  badge: {
    backgroundColor: Colors.red,
    borderRadius: 12,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  badgeText: { color: Colors.white, fontSize: 11, fontWeight: '700' },
  separator: { height: 1, backgroundColor: Colors.gray100, marginLeft: 70 },
  emptyText: { ...Typography.secondary, marginTop: 40 },
})
