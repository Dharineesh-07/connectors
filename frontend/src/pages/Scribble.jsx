import WhiteboardPanel from '../components/WhiteboardPanel'

export default function Scribble() {
  return (
    <div className="flex flex-col h-full w-full overflow-hidden">
      <WhiteboardPanel conversationId="__personal__" fullPage />
    </div>
  )
}
