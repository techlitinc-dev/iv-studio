import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/barlow/600.css'
import '@fontsource/barlow-condensed/700.css'
import '@fontsource/barlow-condensed/800.css'
import '@fontsource/dm-sans/400.css'
import '@fontsource/dm-sans/600.css'
import '@fontsource/jetbrains-mono/400.css'
import './styles.css'
import './studio.css'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import ChatWindow from './components/ChatWindow'
import StoryRefine from './components/StoryRefine'

// the chat popped out into its own window opens this page at #chat (main process openChatWindow);
// a film's story-refine window opens at #story-refine/<production id> (openStoryWindow)
const chatOnly = window.location.hash === '#chat'
const storyId = window.location.hash.startsWith('#story-refine/') ? window.location.hash.slice('#story-refine/'.length) : null

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      {chatOnly ? <ChatWindow /> : storyId ? <StoryRefine id={storyId} /> : <App />}
    </ErrorBoundary>
  </StrictMode>
)
