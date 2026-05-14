import { useCallback, useEffect, useRef, useState } from 'react'
import {
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { GiftedChat } from 'react-native-gifted-chat'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Toast from 'react-native-toast-message'
import * as ImagePicker from 'expo-image-picker'
import {
  deleteMessage,
  editMessage,
  listMessages,
  markRead,
  reactToMessage,
  sendMessage,
  uploadFile,
} from '../api/messages'
import { listConversations } from '../api/conversations'
import { initiateCall } from '../api/calls'
import { useAuth } from '../context/AuthContext'
import { useSocket } from '../context/SocketContext'
import { useCall } from '../context/CallContext'
import UserAvatar from '../components/UserAvatar'
import { Colors } from '../theme/colors'

const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '😡']

function toGiftedMsg(msg) {
  return {
    _id: msg.id,
    text: msg.is_deleted
      ? 'This message was deleted'
      : msg.type === 'file'
      ? `📎 ${msg.file_name}`
      : msg.content ?? '',
    createdAt: new Date(msg.created_at),
    user: {
      _id: msg.sender_id,
      name: msg.sender?.display_name || msg.sender?.full_name,
      avatar: msg.sender?.avatar_url || undefined,
    },
    image: msg.type === 'file' && msg.file_url ? msg.file_url : undefined,
    sent: true,
    received: msg.receipts?.some((r) => r.status !== 'pending') ?? false,
    is_deleted: msg.is_deleted || false,
    reactions: msg.reactions || [],
    reply_to: msg.reply_to || null,
  }
}

export default function ChatScreen({ route, navigation }) {
  const { conversationId, conversation: initConv } = route.params ?? {}
  const { user } = useAuth()
  const { on, emit } = useSocket()
  const { initiateCall: startRTC } = useCall()
  const insets = useSafeAreaInsets()

  const [messages, setMessages] = useState([])
  const [hasMore, setHasMore] = useState(false)
  const cursorRef = useRef(null)

  const [menuMessage, setMenuMessage] = useState(null)
  const [replyMessage, setReplyMessage] = useState(null)
  const [editingMessage, setEditingMessage] = useState(null)
  const [inputText, setInputText] = useState('')
  const [forwardMsg, setForwardMsg] = useState(null)
  const [conversations, setConversations] = useState([])

  const conv = initConv
  const isDirect = conv?.type === 'direct'
  const other = isDirect ? conv?.members?.find((m) => m.user_id !== user?.id) : null
  const displayName = isDirect
    ? other?.user?.display_name || other?.user?.full_name
    : conv?.name ?? 'Chat'

  const loadMessages = useCallback(
    async (reset = false) => {
      if (!conversationId) return
      try {
        const data = await listMessages(conversationId, reset ? null : cursorRef.current)
        setHasMore(data.has_more)
        if (data.next_cursor) cursorRef.current = data.next_cursor
        const incoming = data.messages.map(toGiftedMsg)
        setMessages((prev) => (reset ? incoming.reverse() : [...prev, ...incoming]))
      } catch {
        // ignore
      }
    },
    [conversationId]
  )

  useEffect(() => {
    cursorRef.current = null
    setMessages([])
    setHasMore(false)
    loadMessages(true)
  }, [conversationId, loadMessages])

  useEffect(() => {
    const off = on('message:new', (data) => {
      if (data.conversation_id === conversationId) {
        setMessages((prev) => GiftedChat.append(prev, [toGiftedMsg(data)]))
        markRead(data.id).catch(() => {})
      }
    })
    return off
  }, [on, conversationId])

  useEffect(() => {
    const off = on('message:edited', (data) => {
      if (data.conversation_id === conversationId) {
        setMessages((prev) =>
          prev.map((m) =>
            m._id === data.message_id ? { ...m, text: data.content } : m
          )
        )
      }
    })
    return off
  }, [on, conversationId])

  useEffect(() => {
    const off = on('message:deleted', (data) => {
      if (data.conversation_id === conversationId) {
        setMessages((prev) =>
          prev.map((m) =>
            m._id === data.message_id
              ? { ...m, text: 'This message was deleted', is_deleted: true }
              : m
          )
        )
      }
    })
    return off
  }, [on, conversationId])

  useEffect(() => {
    const off = on('message:reacted', (data) => {
      if (data.conversation_id === conversationId) {
        setMessages((prev) =>
          prev.map((m) =>
            m._id === data.message_id ? { ...m, reactions: data.reactions } : m
          )
        )
      }
    })
    return off
  }, [on, conversationId])

  const onSend = useCallback(
    async (newMessages = []) => {
      const msg = newMessages[0]
      if (editingMessage) {
        try {
          await editMessage(editingMessage._id, msg.text)
          setMessages((prev) =>
            prev.map((m) =>
              m._id === editingMessage._id ? { ...m, text: msg.text } : m
            )
          )
        } catch {
          Toast.show({ type: 'error', text1: 'Failed to edit message' })
        }
        setEditingMessage(null)
        setInputText('')
        return
      }
      try {
        await sendMessage(conversationId, {
          content: msg.text,
          type: 'text',
          reply_to_id: replyMessage?._id,
        })
        setReplyMessage(null)
      } catch {
        Toast.show({ type: 'error', text1: 'Failed to send message' })
      }
    },
    [conversationId, editingMessage, replyMessage]
  )

  const handleImagePick = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      quality: 0.8,
    })
    if (result.canceled || !result.assets?.[0]) return
    const asset = result.assets[0]
    try {
      const uploaded = await uploadFile({
        uri: asset.uri,
        name: asset.fileName ?? 'upload',
        mimeType: asset.mimeType ?? 'application/octet-stream',
      })
      await sendMessage(conversationId, {
        type: 'file',
        file_url: uploaded.file_url,
        file_name: uploaded.file_name,
        file_size: uploaded.file_size,
      })
    } catch {
      Toast.show({ type: 'error', text1: 'File upload failed' })
    }
  }

  const handleCall = async (callType) => {
    try {
      const data = await initiateCall(conversationId, callType)
      await startRTC(data.call_id, conversationId, callType, data.turn_credentials)
    } catch {
      Toast.show({ type: 'error', text1: 'Could not start call' })
    }
  }

  const handleReply = () => {
    setReplyMessage(menuMessage)
    setMenuMessage(null)
  }

  const handleForward = async () => {
    const target = menuMessage
    setMenuMessage(null)
    setForwardMsg(target)
    try {
      const data = await listConversations()
      setConversations(data.conversations ?? data ?? [])
    } catch {
      Toast.show({ type: 'error', text1: 'Could not load conversations' })
    }
  }

  const handleForwardTo = async (targetConvId) => {
    if (!forwardMsg) return
    try {
      await sendMessage(targetConvId, { content: forwardMsg.text, type: 'text' })
      Toast.show({ type: 'success', text1: 'Message forwarded' })
    } catch {
      Toast.show({ type: 'error', text1: 'Forward failed' })
    }
    setForwardMsg(null)
    setConversations([])
  }

  const handleStartEdit = () => {
    setInputText(menuMessage.text)
    setEditingMessage(menuMessage)
    setMenuMessage(null)
  }

  const handleCancelEdit = () => {
    setEditingMessage(null)
    setInputText('')
  }

  const handleDelete = async () => {
    const target = menuMessage
    setMenuMessage(null)
    try {
      await deleteMessage(target._id)
      setMessages((prev) =>
        prev.map((m) =>
          m._id === target._id
            ? { ...m, text: 'This message was deleted', is_deleted: true }
            : m
        )
      )
    } catch {
      Toast.show({ type: 'error', text1: 'Could not delete message' })
    }
  }

  const handleReact = async (emoji) => {
    const target = menuMessage
    setMenuMessage(null)
    try {
      await reactToMessage(target._id, emoji)
      setMessages((prev) =>
        prev.map((m) => {
          if (m._id !== target._id) return m
          const existing = m.reactions || []
          const alreadyReacted = existing.some(
            (r) => r.user_id === user?.id && r.emoji === emoji
          )
          if (alreadyReacted) {
            return {
              ...m,
              reactions: existing.filter(
                (r) => !(r.user_id === user?.id && r.emoji === emoji)
              ),
            }
          }
          return { ...m, reactions: [...existing, { user_id: user?.id, emoji }] }
        })
      )
    } catch {
      Toast.show({ type: 'error', text1: 'Could not react to message' })
    }
  }

  const isMenuMine = menuMessage?.user?._id === user?.id

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>‹</Text>
        </TouchableOpacity>
        <UserAvatar user={isDirect ? other?.user : { full_name: displayName }} size="md" />
        <Text style={styles.headerName} numberOfLines={1}>
          {displayName}
        </Text>
        <View style={styles.callBtns}>
          <TouchableOpacity onPress={() => handleCall('audio')} style={styles.callBtn}>
            <Text style={styles.callIcon}>📞</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => handleCall('video')} style={styles.callBtn}>
            <Text style={styles.callIcon}>📹</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Edit mode indicator */}
      {editingMessage && (
        <View style={styles.editBanner}>
          <Text style={styles.editBannerLabel}>✏️ Editing message</Text>
          <TouchableOpacity onPress={handleCancelEdit}>
            <Text style={styles.editBannerCancel}>✕ Cancel</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Messages */}
      <GiftedChat
        messages={messages}
        onSend={onSend}
        user={{ _id: user?.id, name: user?.full_name, avatar: user?.avatar_url }}
        loadEarlier={hasMore}
        onLoadEarlier={() => loadMessages(false)}
        text={inputText}
        onInputTextChanged={(text) => {
          setInputText(text)
          emit('message:typing', {
            conversation_id: conversationId,
            is_typing: text.length > 0,
          })
        }}
        renderAvatarOnTop
        showUserAvatar
        alwaysShowSend
        renderUsernameOnMessage={!isDirect}
        messagesContainerStyle={styles.messagesContainer}
        textInputStyle={styles.textInput}
        sendButtonProps={{ containerStyle: styles.sendBtn }}
        timeTextStyle={{ right: styles.timeText, left: styles.timeText }}
        renderBubble={(props) => {
          const isMe = props.currentMessage.user._id === user?.id
          const isDeleted = props.currentMessage.is_deleted
          const reactions = props.currentMessage.reactions || []
          const replyTo = props.currentMessage.reply_to

          // Group reaction counts by emoji
          const reactionGroups = reactions.reduce((acc, r) => {
            acc[r.emoji] = (acc[r.emoji] || 0) + 1
            return acc
          }, {})

          const menuDot = !isDeleted && (
            <TouchableOpacity
              onPress={() => setMenuMessage(props.currentMessage)}
              style={styles.menuDotBtn}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={styles.menuDotText}>⋮</Text>
            </TouchableOpacity>
          )

          return (
            <View
              style={[
                styles.msgRow,
                isMe ? styles.msgRowSent : styles.msgRowReceived,
              ]}
            >
              {isMe && menuDot}
              <View>
                <View
                  style={[
                    styles.bubble,
                    isMe ? styles.bubbleSent : styles.bubbleReceived,
                  ]}
                >
                  {replyTo && (
                    <View
                      style={[
                        styles.replyQuote,
                        isMe ? styles.replyQuoteSent : styles.replyQuoteReceived,
                      ]}
                    >
                      <Text style={styles.replyQuoteText} numberOfLines={1}>
                        {replyTo.text}
                      </Text>
                    </View>
                  )}
                  <Text
                    style={[
                      isMe ? styles.bubbleTextSent : styles.bubbleTextReceived,
                      isDeleted && styles.deletedText,
                    ]}
                  >
                    {props.currentMessage.text}
                  </Text>
                </View>
                {Object.keys(reactionGroups).length > 0 && (
                  <View
                    style={[
                      styles.reactionsRow,
                      isMe ? styles.reactionsRowSent : styles.reactionsRowReceived,
                    ]}
                  >
                    {Object.entries(reactionGroups).map(([emoji, count]) => (
                      <View key={emoji} style={styles.reactionBubble}>
                        <Text style={styles.reactionEmoji}>{emoji}</Text>
                        {count > 1 && (
                          <Text style={styles.reactionCount}>{count}</Text>
                        )}
                      </View>
                    ))}
                  </View>
                )}
              </View>
              {!isMe && menuDot}
            </View>
          )
        }}
        renderActions={() => (
          <TouchableOpacity onPress={handleImagePick} style={styles.attachBtn}>
            <Text style={{ fontSize: 22 }}>📎</Text>
          </TouchableOpacity>
        )}
        renderChatFooter={() =>
          replyMessage ? (
            <View style={styles.replyBar}>
              <View style={styles.replyBarContent}>
                <Text style={styles.replyBarLabel}>↩ {replyMessage.user.name}</Text>
                <Text style={styles.replyBarText} numberOfLines={1}>
                  {replyMessage.text}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setReplyMessage(null)}
                style={styles.replyBarClose}
              >
                <Text style={styles.replyBarCloseText}>✕</Text>
              </TouchableOpacity>
            </View>
          ) : null
        }
      />

      {/* Message context menu */}
      <Modal
        visible={!!menuMessage}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuMessage(null)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setMenuMessage(null)}
        >
          <TouchableOpacity activeOpacity={1} style={styles.menuSheet}>
            {/* Emoji reactions — only for received messages */}
            {!isMenuMine && (
              <>
                <View style={styles.emojiRow}>
                  {REACTION_EMOJIS.map((emoji) => (
                    <TouchableOpacity
                      key={emoji}
                      onPress={() => handleReact(emoji)}
                      style={styles.emojiBtn}
                    >
                      <Text style={styles.emojiBtnText}>{emoji}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <View style={styles.menuDivider} />
              </>
            )}

            <TouchableOpacity style={styles.menuItem} onPress={handleReply}>
              <Text style={styles.menuItemIcon}>↩</Text>
              <Text style={styles.menuItemText}>Reply</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.menuItem} onPress={handleForward}>
              <Text style={styles.menuItemIcon}>↪</Text>
              <Text style={styles.menuItemText}>Forward</Text>
            </TouchableOpacity>

            {/* Edit / Delete — only for own non-deleted messages */}
            {isMenuMine && !menuMessage?.is_deleted && (
              <>
                <TouchableOpacity style={styles.menuItem} onPress={handleStartEdit}>
                  <Text style={styles.menuItemIcon}>✏️</Text>
                  <Text style={styles.menuItemText}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.menuItem, styles.menuItemDanger]}
                  onPress={handleDelete}
                >
                  <Text style={styles.menuItemIcon}>🗑️</Text>
                  <Text style={styles.menuItemTextDanger}>Delete</Text>
                </TouchableOpacity>
              </>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Forward — conversation picker */}
      <Modal
        visible={!!forwardMsg}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setForwardMsg(null)
          setConversations([])
        }}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => {
            setForwardMsg(null)
            setConversations([])
          }}
        >
          <TouchableOpacity activeOpacity={1} style={styles.forwardSheet}>
            <Text style={styles.forwardTitle}>Forward to…</Text>
            <FlatList
              data={conversations.filter((c) => c.id !== conversationId)}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => {
                const name =
                  item.type === 'direct'
                    ? item.members?.find((m) => m.user_id !== user?.id)?.user
                        ?.display_name ||
                      item.members?.find((m) => m.user_id !== user?.id)?.user
                        ?.full_name ||
                      'Direct'
                    : item.name ?? 'Group'
                return (
                  <TouchableOpacity
                    style={styles.forwardItem}
                    onPress={() => handleForwardTo(item.id)}
                  >
                    <Text style={styles.forwardItemText}>{name}</Text>
                  </TouchableOpacity>
                )
              }}
            />
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.grayBg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    paddingHorizontal: 12,
    paddingBottom: 12,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray100,
  },
  backBtn: { padding: 4 },
  backText: { fontSize: 30, color: Colors.charcoal, lineHeight: 32 },
  headerName: { flex: 1, fontSize: 16, fontWeight: '700', color: Colors.charcoal },
  callBtns: { flexDirection: 'row', gap: 4 },
  callBtn: { padding: 6 },
  callIcon: { fontSize: 20 },

  // Edit mode banner
  editBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.redLight,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.red,
  },
  editBannerLabel: { fontSize: 13, color: Colors.red },
  editBannerCancel: { fontSize: 13, color: Colors.red, fontWeight: '600' },

  messagesContainer: { backgroundColor: Colors.grayBg },
  textInput: {
    backgroundColor: Colors.gray100,
    color: Colors.charcoal,
    borderRadius: 20,
    paddingHorizontal: 14,
    marginVertical: 4,
  },
  sendBtn: { justifyContent: 'center', marginRight: 4, marginBottom: 4 },
  timeText: { color: Colors.gray400, fontSize: 11 },
  attachBtn: { justifyContent: 'center', paddingLeft: 8, paddingBottom: 4 },

  // Message row — wraps the three-dot icon + bubble
  msgRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 8,
    marginVertical: 2,
  },
  msgRowSent: { alignSelf: 'flex-end' },
  msgRowReceived: { alignSelf: 'flex-start' },

  // Three-dot trigger
  menuDotBtn: { paddingHorizontal: 4, paddingVertical: 6 },
  menuDotText: { fontSize: 18, color: Colors.gray400, fontWeight: '700' },

  // Bubble
  bubble: {
    maxWidth: 260,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
  },
  bubbleSent: {
    backgroundColor: Colors.red,
    borderBottomRightRadius: 4,
  },
  bubbleReceived: {
    backgroundColor: Colors.white,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: Colors.gray100,
  },
  bubbleTextSent: { color: Colors.white, fontSize: 15 },
  bubbleTextReceived: { color: Colors.charcoal, fontSize: 15 },
  deletedText: { fontStyle: 'italic', color: Colors.gray400 },

  // Reply quote inside bubble
  replyQuote: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginBottom: 6,
    borderLeftWidth: 3,
  },
  replyQuoteSent: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderLeftColor: Colors.white,
  },
  replyQuoteReceived: {
    backgroundColor: Colors.grayBg,
    borderLeftColor: Colors.red,
  },
  replyQuoteText: { fontSize: 12, color: Colors.gray600 },

  // Reactions row below bubble
  reactionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 4,
    gap: 4,
  },
  reactionsRowSent: { justifyContent: 'flex-end' },
  reactionsRowReceived: { justifyContent: 'flex-start' },
  reactionBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderRadius: 12,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: Colors.gray100,
  },
  reactionEmoji: { fontSize: 13 },
  reactionCount: { fontSize: 11, color: Colors.gray600, marginLeft: 2 },

  // Reply bar (accessory above input)
  replyBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderTopWidth: 1,
    borderTopColor: Colors.gray100,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  replyBarContent: { flex: 1 },
  replyBarLabel: { fontSize: 12, fontWeight: '600', color: Colors.red },
  replyBarText: { fontSize: 13, color: Colors.gray600, marginTop: 2 },
  replyBarClose: { padding: 6 },
  replyBarCloseText: { fontSize: 16, color: Colors.gray400 },

  // Shared modal overlay
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },

  // Context menu bottom sheet
  menuSheet: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 16,
    paddingBottom: 32,
  },
  emojiRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  emojiBtn: { padding: 6 },
  emojiBtnText: { fontSize: 30 },
  menuDivider: {
    height: 1,
    backgroundColor: Colors.gray100,
    marginHorizontal: 16,
    marginBottom: 4,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    gap: 14,
  },
  menuItemDanger: {},
  menuItemIcon: { fontSize: 20, width: 28, textAlign: 'center' },
  menuItemText: { fontSize: 16, color: Colors.charcoal },
  menuItemTextDanger: { fontSize: 16, color: Colors.danger },

  // Forward picker bottom sheet
  forwardSheet: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '60%',
    paddingTop: 16,
    paddingBottom: 32,
  },
  forwardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.charcoal,
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray100,
  },
  forwardItem: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray100,
  },
  forwardItemText: { fontSize: 15, color: Colors.charcoal },
})
