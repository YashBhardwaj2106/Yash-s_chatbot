import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, addDoc, onSnapshot, query, orderBy, serverTimestamp } from 'firebase/firestore';
import { ArrowUp, User, Loader2, Sparkles, Menu, Plus, MessageSquare, HelpCircle, Settings } from 'lucide-react';

// --- Firebase Configuration ---
const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID
};

// --- Firebase Initialization ---
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- Main App Component ---
export default function App() {
  const [userId, setUserId] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const messagesEndRef = useRef(null);

  // --- Authentication Effect ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setUserId(user.uid);
      } else {
        try {
          await signInAnonymously(auth);
        } catch (error) {
          console.error("Authentication failed:", error);
          setError("Could not authenticate with Firebase.");
        }
      }
      setIsAuthReady(true);
    });

    return () => unsubscribe();
  }, []);

  // --- Firestore Message Subscription Effect ---
  useEffect(() => {
    if (!isAuthReady || !userId || !db) return;

    const messagesColPath = `/artifacts/${process.env.REACT_APP_FIREBASE_APP_ID}/users/${userId}/messages`;
    const q = query(
      collection(db, messagesColPath),
      orderBy("timestamp", "asc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedMessages = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setMessages(fetchedMessages);
    }, (err) => {
      console.error("Error fetching messages:", err);
      setError("Could not fetch messages from Firestore. Check your database rules.");
    });

    return () => unsubscribe();
  }, [isAuthReady, userId]);

  // --- Scroll to Bottom Effect ---
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleStarterPrompt = (prompt) => {
    setTimeout(() => {
      handleSendMessage(null, prompt);
    }, 0);
  };

  // --- Message Handling ---
  const handleSendMessage = async (e, prompt) => {
    if (e) e.preventDefault();
    
    const textToSend = prompt || input;
    if (!textToSend.trim() || isLoading || !userId || !db) return;

    const userMessage = {
      text: textToSend,
      sender: 'user',
      timestamp: serverTimestamp(),
    };

    setIsLoading(true);
    setInput('');

    try {
      const messagesColPath = `/artifacts/${process.env.REACT_APP_FIREBASE_APP_ID}/users/${userId}/messages`;
      await addDoc(collection(db, messagesColPath), userMessage);

      const chatHistory = messages
        .filter(msg => msg.id !== 'welcome-1')
        .map(msg => ({
          role: msg.sender === 'bot' ? 'model' : 'user',
          parts: [{ text: msg.text }]
        }));

      chatHistory.push({ role: "user", parts: [{ text: textToSend }] });

      const response = await fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatHistory })
      });

      if (!response.ok) {
        throw new Error('API call failed');
      }

      const result = await response.json();
      let botResponseText = "Sorry, I couldn't generate a response.";

      if (result.candidates && result.candidates.length > 0 &&
          result.candidates[0].content && result.candidates[0].content.parts &&
          result.candidates[0].content.parts.length > 0) {
        botResponseText = result.candidates[0].content.parts[0].text;
      }

      const botMessage = {
        text: botResponseText,
        sender: 'bot',
        timestamp: serverTimestamp(),
      };

      await addDoc(collection(db, messagesColPath), botMessage);
    } catch (error) {
      console.error("Error calling backend proxy:", error);
      const errorMessage = {
        text: `An error occurred: ${error.message}`,
        sender: 'bot',
        timestamp: serverTimestamp(),
      };
      await addDoc(collection(db, messagesColPath), errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isAuthReady) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-950 text-gray-300">
        <Loader2 className="w-12 h-12 animate-spin" />
      </div>
    );
  }

  const StarterPromptCard = ({ title, subtitle, onClick }) => (
    <button 
      onClick={onClick} 
      className="bg-gray-900/70 p-4 rounded-lg text-left w-full hover:bg-gray-800/90 transition-colors relative border border-gray-800"
    >
      <p className="font-semibold text-gray-200">{title}</p>
      <p className="text-sm text-gray-500">{subtitle}</p>
    </button>
  );

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        body {
          font-family: 'Inter', sans-serif;
          background-color: #0A0A0A;
          background-image:
            radial-gradient(circle at 15% 90%, rgba(37, 99, 235, 0.15) 0%, rgba(37, 99, 235, 0) 40%),
	    radial-gradient(circle at 85% 20%, rgba(139, 92, 246, 0.15) 0%, rgba(139, 92, 246, 0) 40%),
            linear-gradient(rgba(255, 255, 255, 0.015) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255, 255, 255, 0.015) 1px, transparent 1px);
          background-size: 100% 100%, 100% 100%, 20px 20px, 20px 20px;
        }
        .pro-scrollbar::-webkit-scrollbar { width: 6px; }
        .pro-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .pro-scrollbar::-webkit-scrollbar-thumb { background: #27272a; border-radius: 3px; }
        .pro-scrollbar::-webkit-scrollbar-thumb:hover { background: #3f3f46; }
      `}</style>
      <div className="flex h-screen text-gray-200 bg-transparent">
        {/* --- Sidebar --- */}
        <div className={`bg-black/30 backdrop-blur-xl border-r border-gray-800/50 flex flex-col justify-between transition-all duration-300 ease-in-out ${isSidebarOpen ? 'w-64 p-4' : 'w-0 p-0'}`}>
          <div className={`transition-opacity duration-200 ${isSidebarOpen ? 'opacity-100' : 'opacity-0'}`}>
            <button className="w-full bg-blue-600 text-white py-2 px-3 rounded-md hover:bg-blue-700 transition-colors flex items-center justify-between gap-2 mb-6 text-sm font-semibold">
              New Chat <Plus className="w-4 h-4" />
            </button>
            <div className="space-y-1">
              <h3 className="text-xs font-semibold text-gray-500 px-2 mb-2 uppercase tracking-wider">Recent</h3>
              <button className="w-full flex items-center gap-3 text-left text-gray-300 bg-gray-500/10 py-2 px-2 rounded-md transition-colors text-sm truncate">
                <MessageSquare className="w-4 h-4 flex-shrink-0" /> What is quantum computing?
              </button>
            </div>
          </div>
          <div className={`transition-opacity duration-200 ${isSidebarOpen ? 'opacity-100' : 'opacity-0'}`}>
            <button className="w-full flex items-center gap-3 text-left text-gray-400 hover:text-gray-200 hover:bg-gray-800/50 py-2 px-2 rounded-md transition-colors text-sm">
              <HelpCircle className="w-4 h-4" /> Help
            </button>
            <button className="w-full flex items-center gap-3 text-left text-gray-400 hover:text-gray-200 hover:bg-gray-800/50 py-2 px-2 rounded-md transition-colors text-sm">
              <Settings className="w-4 h-4" /> Settings
            </button>
          </div>
        </div>

        {/* --- Main Chat Area --- */}
        <div className="flex-1 flex flex-col bg-transparent">
          <header className="p-4 flex justify-between items-center flex-shrink-0">
            <div className="flex items-center gap-2">
              <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 hover:bg-gray-800/50 rounded-md">
                <Menu className="w-5 h-5 text-gray-400" />
              </button>
              <h1 className="text-md font-semibold text-gray-300">AI Assistant</h1>
            </div>
            <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center">
              <User className="w-5 h-5 text-gray-300" />
            </div>
          </header>
          <main className="flex-1 overflow-y-auto px-4 pro-scrollbar">
            <div className="max-w-3xl mx-auto h-full">
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full pb-24 text-center">
                  <div className="w-16 h-16 bg-gradient-to-br from-blue-600 to-purple-600 rounded-full flex items-center justify-center border-2 border-gray-700 mb-4">
                    <Sparkles className="w-8 h-8 text-white" />
                  </div>
                  <h2 className="text-2xl font-semibold text-gray-200">How can I help you today?</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full mt-8">
                    <StarterPromptCard title="Write a Python script" subtitle="that fetches weather data" onClick={() => handleStarterPrompt("Write a Python script that fetches weather data from an API")} />
                    <StarterPromptCard title="Explain a concept" subtitle="like recursion in programming" onClick={() => handleStarterPrompt("Explain recursion in programming like I'm five")} />
                    <StarterPromptCard title="Brainstorm ideas" subtitle="for a personal portfolio website" onClick={() => handleStarterPrompt("Brainstorm ideas for a personal portfolio website for a software developer")} />
                    <StarterPromptCard title="Refactor this code" subtitle="to be more efficient" onClick={() => handleStarterPrompt("How can I refactor this javascript code to be more efficient?")} />
                  </div>
                </div>
              ) : (
                <div className="space-y-8 pb-24">
                  {messages.map((msg, index) => (
                    <div key={msg.id || index} className="flex items-start gap-4">
                      <div className="w-8 h-8 rounded-full bg-gray-800 border border-gray-700 flex items-center justify-center flex-shrink-0">
                        {msg.sender === 'user' ? <User className="w-5 h-5 text-gray-400" /> : <Sparkles className="w-5 h-5 text-blue-500" />}
                      </div>
                      <div className="flex-1 pt-1">
                        <p className="font-semibold text-gray-200 mb-2">{msg.sender === 'user' ? 'You' : 'AI Assistant'}</p>
                        <div className="prose prose-invert prose-sm max-w-none text-gray-300" dangerouslySetInnerHTML={{ __html: msg.text.replace(/\n/g, '<br />') }}></div>
                      </div>
                    </div>
                  ))}
                  {isLoading && (
                    <div className="flex items-start gap-4">
                      <div className="w-8 h-8 rounded-full bg-gray-800 border border-gray-700 flex items-center justify-center flex-shrink-0">
                        <Sparkles className="w-5 h-5 text-blue-500" />
                      </div>
                      <div className="flex-1 pt-1 mt-2">
                        <Loader2 className="w-5 h-5 animate-spin text-gray-500" />
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>
          </main>
          <footer className="px-4 pb-4 flex-shrink-0">
            <div className="max-w-3xl mx-auto">
              <form onSubmit={handleSendMessage} className="relative">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage(e);
                    }
                  }}
                  placeholder="Enter a prompt here..."
                  className="w-full bg-black/20 border border-gray-700/50 rounded-lg py-3 pl-4 pr-14 focus:ring-2 focus:ring-blue-500 focus:outline-none transition-shadow resize-none backdrop-blur-sm"
                  rows={1}
                  disabled={isLoading || !!error}
                  />
                  <button 
                  type="submit" 
                  disabled={isLoading || !!error || !input.trim()} 
                  className="absolute right-3 bottom-2.5 p-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
>
                  <ArrowUp className="w-5 h-5" />
                  </button>
                  </form>
                  </div>
                  </footer>
                  </div>
                  </div>
                  </>)}