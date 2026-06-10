import { useState, useEffect } from 'react'
import { useQuery } from 'react-query'
import { MagnifyingGlassIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { searchMessages } from '../api/messages'
import dayjs from 'dayjs'
import UserAvatar from './UserAvatar'

export default function ChatSidebarSearch({ conversationId, onClose, onViewMessage }) {
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQuery(query)
    }, 300)
    return () => clearTimeout(handler)
  }, [query])

  const { data: results, isLoading } = useQuery(
    ['search-messages', conversationId, debouncedQuery],
    () => searchMessages(conversationId, debouncedQuery),
    {
      enabled: !!debouncedQuery && !!conversationId,
    }
  )

  return (
    <div className="w-80 flex flex-col bg-cn-white border-l border-cn-gray-200 h-full animate-cn-slide-in-right shadow-2xl relative z-20">
      {/* Header with Gradient Accent */}
      <div className="relative p-6 border-b border-cn-gray-100 overflow-hidden bg-cn-white">
        <div className="absolute top-0 left-0 w-full h-1 cn-gradient-brand"></div>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-cn-charcoal flex items-center gap-2">
              <span className="p-2 rounded-lg bg-cn-blue-light text-cn-blue">
                <MagnifyingGlassIcon className="w-5 h-5" />
              </span>
              Search
            </h3>
            <p className="text-[11px] text-cn-gray-400 mt-1 uppercase tracking-widest font-bold">In this conversation</p>
          </div>
          <button 
            onClick={onClose} 
            className="p-2 hover:bg-cn-gray-100 text-cn-gray-400 hover:text-cn-charcoal rounded-full transition-all duration-200"
          >
            <XMarkIcon className="w-6 h-6" />
          </button>
        </div>
      </div>

      {/* Search Input Area */}
      <div className="p-6 bg-cn-gray-100/30">
        <div className="relative group">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type to search instantly..."
            className="w-full pl-12 pr-4 py-3.5 bg-cn-white border-2 border-transparent rounded-2xl text-sm shadow-sm focus:border-cn-blue focus:ring-4 focus:ring-cn-blue/10 transition-all outline-none text-cn-charcoal"
            autoFocus
          />
          <MagnifyingGlassIcon className="absolute left-4 top-3.5 w-5 h-5 text-cn-gray-300 group-focus-within:text-cn-blue transition-colors" />
          
          {query && (
             <button 
                onClick={() => setQuery('')}
                className="absolute right-4 top-4 text-cn-gray-300 hover:text-cn-gray-500"
             >
                <XMarkIcon className="w-4 h-4" />
             </button>
          )}
        </div>
      </div>

      {/* Results area */}
      <div className="flex-1 overflow-y-auto px-6 py-4 custom-scrollbar">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-40 gap-4">
            <div className="relative w-10 h-10">
               <div className="absolute inset-0 border-4 border-cn-blue/20 rounded-full"></div>
               <div className="absolute inset-0 border-4 border-cn-blue border-t-transparent rounded-full animate-spin"></div>
            </div>
            <p className="text-xs font-bold text-cn-gray-400 uppercase tracking-widest">Searching...</p>
          </div>
        ) : results?.length > 0 ? (
          <div className="space-y-4">
            <p className="text-[10px] font-bold text-cn-gray-400 uppercase tracking-widest px-2">{results.length} Results Found</p>
            <div className="space-y-3">
              {results.map((msg) => (
                <div 
                  key={msg.id} 
                  onClick={() => onViewMessage(msg.id)}
                  className="p-4 rounded-2xl bg-cn-white border border-cn-gray-100 hover:border-cn-blue/30 hover:shadow-lg hover:shadow-cn-blue/5 transition-all duration-300 group cursor-pointer"
                >
                  <div className="flex items-center gap-3 mb-2">
                    <UserAvatar user={msg.sender} size="xs" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-cn-charcoal truncate">{msg.sender.full_name}</p>
                      <p className="text-[9px] text-cn-gray-400 uppercase font-bold tracking-tight">
                        {dayjs(msg.created_at).format('MMM D, HH:mm')}
                      </p>
                    </div>
                  </div>
                  <div className="relative">
                    <p className="text-[13px] leading-relaxed text-cn-gray-600 line-clamp-4">
                      {msg.content}
                    </p>
                    <div className="absolute -right-1 -bottom-1 opacity-0 group-hover:opacity-100 transition-opacity">
                       <span className="text-[10px] font-bold text-cn-blue bg-cn-blue-light px-2 py-1 rounded-md uppercase">View</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : debouncedQuery ? (
          <div className="flex flex-col items-center justify-center py-20 text-center animate-cn-fade-up">
            <div className="w-16 h-16 rounded-3xl bg-cn-gray-100 flex items-center justify-center mb-4 text-2xl grayscale">
               🔍
            </div>
            <p className="font-bold text-cn-charcoal text-sm">No matches found</p>
            <p className="text-xs text-cn-gray-400 mt-2 px-10">We couldn&apos;t find anything matching &quot;{debouncedQuery}&quot; in this conversation.</p>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-center opacity-60 animate-cn-fade-up">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-cn-blue/10 to-cn-red/10 flex items-center justify-center mb-6 text-3xl animate-cn-float">
               ✨
            </div>
            <p className="font-bold text-cn-charcoal text-sm">Instant Search</p>
            <p className="text-xs text-cn-gray-400 mt-2 px-10 leading-relaxed">Type a keyword, name, or date to find messages instantly within this chat.</p>
          </div>
        )}
      </div>
    </div>
  )
}
