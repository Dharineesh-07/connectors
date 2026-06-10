import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { votePoll, closePoll } from '../api/polls'

export default function PollMessage({ poll: initialPoll, isOwn, onPollUpdate }) {
  const { user } = useAuth()
  const [poll, setPoll] = useState(initialPoll)
  const [voting, setVoting] = useState(false)

  if (!poll) return null

  const totalVotes = poll.options?.reduce((sum, o) => sum + (o.votes?.length ?? 0), 0) ?? 0

  // Build a set of option IDs this user has voted on
  const myVotedOptionIds = new Set(
    poll.options?.flatMap((o) =>
      (o.votes ?? []).filter((v) => v.user_id === user?.id).map(() => o.id)
    ) ?? []
  )
  const hasVoted = myVotedOptionIds.size > 0
  const isCreator = poll.created_by === user?.id

  const handleVote = async (optionId) => {
    if (poll.is_closed || voting) return

    let newOptionIds
    if (poll.is_multiple) {
      newOptionIds = myVotedOptionIds.has(optionId)
        ? [...myVotedOptionIds].filter((id) => id !== optionId)
        : [...myVotedOptionIds, optionId]
      if (newOptionIds.length === 0) return
    } else {
      if (myVotedOptionIds.has(optionId)) return
      newOptionIds = [optionId]
    }

    setVoting(true)
    try {
      const updated = await votePoll(poll.id, newOptionIds)
      setPoll(updated)
      onPollUpdate?.(updated)
    } catch {
      // keep current state
    } finally {
      setVoting(false)
    }
  }

  const handleClose = async () => {
    if (poll.is_closed) return
    try {
      await closePoll(poll.id)
      setPoll((p) => ({ ...p, is_closed: true }))
    } catch {}
  }

  return (
    <div
      className={`rounded-2xl ${isOwn ? 'rounded-br-sm' : 'rounded-bl-sm'} px-4 py-3 min-w-[240px] max-w-[320px]`}
      style={
        isOwn
          ? { background: 'linear-gradient(135deg, #CC3333 0%, #A52266 100%)', boxShadow: '0 4px 14px rgba(204,51,51,0.35)' }
          : { background: 'var(--cn-gray-200)', border: '1.5px solid var(--cn-gray-400)', boxShadow: 'var(--shadow-card)' }
      }
    >
      {/* Header */}
      <div className="mb-3">
        <div className="flex items-center gap-1.5 mb-1">
          <span className="text-base">📊</span>
          <span className={`text-[10px] font-bold uppercase tracking-widest ${isOwn ? 'text-white/60' : 'text-cn-gray-400'}`}>
            {poll.is_closed ? 'Closed Poll' : poll.is_multiple ? 'Multiple Choice Poll' : 'Poll'}
          </span>
        </div>
        <p className={`text-sm font-semibold leading-snug ${isOwn ? 'text-white' : 'text-cn-charcoal'}`}>
          {poll.question}
        </p>
      </div>

      {/* Options */}
      <div className="space-y-2">
        {poll.options?.map((option) => {
          const voteCount = option.votes?.length ?? 0
          const pct = totalVotes > 0 ? Math.round((voteCount / totalVotes) * 100) : 0
          const isSelected = myVotedOptionIds.has(option.id)
          const showResults = hasVoted || poll.is_closed

          return (
            <button
              key={option.id}
              onClick={() => handleVote(option.id)}
              disabled={poll.is_closed || voting}
              className="w-full text-left relative overflow-hidden rounded-lg transition-all duration-150 disabled:cursor-default focus:outline-none"
              style={{
                background: isOwn
                  ? isSelected ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.10)'
                  : isSelected ? 'rgba(59,130,246,0.10)' : 'rgba(0,0,0,0.04)',
                border: `1.5px solid ${
                  isSelected
                    ? isOwn ? 'rgba(255,255,255,0.55)' : 'var(--cn-blue)'
                    : isOwn ? 'rgba(255,255,255,0.12)' : 'var(--cn-gray-300)'
                }`,
                padding: '7px 10px',
              }}
            >
              {/* Animated progress bar behind option text */}
              {showResults && (
                <div
                  className="absolute inset-0 rounded-lg"
                  style={{
                    width: `${pct}%`,
                    background: isOwn ? 'rgba(255,255,255,0.12)' : 'rgba(59,130,246,0.07)',
                    transition: 'width 0.4s ease',
                  }}
                />
              )}
              <div className="relative flex items-center justify-between gap-2">
                <span className={`text-xs font-medium leading-tight ${isOwn ? 'text-white' : 'text-cn-gray-800'}`}>
                  {isSelected && (
                    <span className={`mr-1.5 text-[10px] font-black ${isOwn ? 'text-white' : 'text-cn-blue'}`}>✓</span>
                  )}
                  {option.text}
                </span>
                {showResults && (
                  <span className={`text-[10px] font-bold flex-shrink-0 tabular-nums ${isOwn ? 'text-white/60' : 'text-cn-gray-500'}`}>
                    {pct}%
                  </span>
                )}
              </div>
            </button>
          )
        })}
      </div>

      {/* Footer */}
      <div className={`mt-3 flex items-center justify-between text-[10px] ${isOwn ? 'text-white/50' : 'text-cn-gray-400'}`}>
        <span>
          {totalVotes} {totalVotes === 1 ? 'vote' : 'votes'}
          {poll.is_multiple && ' · Multiple choice'}
        </span>
        {isCreator && !poll.is_closed && (
          <button
            onClick={handleClose}
            className={`font-semibold underline underline-offset-2 transition-fast ${isOwn ? 'text-white/60 hover:text-white' : 'text-cn-gray-500 hover:text-cn-gray-700'}`}
          >
            Close poll
          </button>
        )}
      </div>
    </div>
  )
}
