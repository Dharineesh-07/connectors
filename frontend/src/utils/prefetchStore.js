let _conversations = null
let _users = null

export function setPrefetch({ conversations, users }) {
  _conversations = conversations ?? null
  _users = users ?? null
}

export function getPrefetchConversations() {
  return _conversations
}

export function getPrefetchUsers() {
  return _users
}

export function clearPrefetch() {
  _conversations = null
  _users = null
}
