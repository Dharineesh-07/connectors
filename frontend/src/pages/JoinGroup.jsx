import { useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from 'react-query'
import { joinConversation } from '../api/conversations'
import toast from 'react-hot-toast'
import Logo from '../components/Logo'

export default function JoinGroup() {
  const { conversationId } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { mutate, isError } = useMutation(
    () => joinConversation(conversationId),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('conversations')
        toast.success('You joined the group!')
        navigate(`/chat/${conversationId}`, { replace: true })
      },
      onError: (err) => {
        const msg = err.response?.data?.detail || 'Failed to join group'
        toast.error(msg)
      },
    }
  )

  useEffect(() => {
    mutate()
  }, [])

  return (
    <div className="flex h-screen items-center justify-center cn-chat-bg">
      <div className="flex flex-col items-center gap-4 animate-cn-fade-up">
        <Logo size="md" />
        {isError ? (
          <div className="text-center space-y-3">
            <p className="text-cn-charcoal font-semibold">Could not join this group.</p>
            <button
              onClick={() => navigate('/', { replace: true })}
              className="text-sm text-cn-blue font-semibold hover:underline"
            >
              Go to home
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-cn-gray-400 text-sm font-medium">
            <span className="animate-spin inline-block w-4 h-4 border-2 border-cn-blue border-t-transparent rounded-full" />
            Joining group…
          </div>
        )}
      </div>
    </div>
  )
}
