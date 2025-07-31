import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, addDoc, onSnapshot, query, serverTimestamp } from 'firebase/firestore';

// --- Icon Components (using inline SVG for simplicity) ---
const IconArrowUp = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14"/><path d="m18 11-6-6-6 6"/></svg>;
const IconUser = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>;
const IconLoader = ({ className }) => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>;
const IconSparkles = ({ className }) => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275zM5 3v4M19 17v4M3 19h4M17 3h4"/></svg>;
const IconMenu = ({ className }) => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/></svg>;

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
let app, auth, db;
// Check that all environment variables are present before initializing
const isFirebaseConfigured = Object.values(firebaseConfig).every(value => value);

if (isFirebaseConfigured) {
  try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
  } catch (error) {
    console.error("Firebase initialization failed:", error);
  }
}

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
    // Don't run auth logic if Firebase isn't configured
    if (!isFirebaseConfigured) {
      setIsAuthReady(true);
      return;
    }
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setUserId(user.uid);
      } else {
        try {
          await signInAnonymously(auth);
        } catch (error) {
          console.error("Anonymous sign-in failed:", error);
          setError("Could not authenticate with Firebase.");
        }
      }
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  // --- Firestore Message Subscription Effect ---
  useEffect(() => {
    if (!isAuthReady || !userId || !isFirebaseConfigured) return;

    const messagesColPath = `/artifacts/${process.env.REACT_APP_FIREBASE_APP_ID}/users/${userId}/messages`;
    const q = query(collection(db, messagesColPath));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      let fetchedMessages = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        timestamp: doc.data().timestamp?.toDate()
      }));
      fetchedMessages.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
      setMessages(fetchedMessages);
    }, (err) => {
      console.error("Error fetching messages:", err);
      setError("Could not fetch messages. Check database rules.");
    });

    return () => unsubscribe();
  }, [isAuthReady, userId]);

  // --- Auto-scroll to Bottom Effect ---
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);
  
  // --- Gemini API Call ---
  const callGeminiAPI = async (chatHistory) => {
      const response = await fetch('/.netlify/functions/gemini', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chatHistory })
      });
      if (!response.ok) {
          const errorBody = await response.text();
          throw new Error(`API Error: ${response.status} - ${errorBody}`);
      }
      return response.json();
  };

  // --- Message Sending Handler ---
  const handleSendMessage = async (e, prompt) => {
    if (e) e.preventDefault();
    
    const textToSend = (prompt || input).trim();
    if (!textToSend || isLoading || !userId) return;

    const messagesColPath = `/artifacts/${process.env.REACT_APP_FIREBASE_APP_ID}/users/${userId}/messages`;

    const userMessage = {
      text: textToSend,
      sender: 'user',
      timestamp: serverTimestamp(),
    };

    setIsLoading(true);
    setInput('');
    setError(null);

    try {
      await addDoc(collection(db, messagesColPath), userMessage);

      const chatHistory = messages
        .map(msg => ({
          role: msg.sender === 'bot' ? 'model' : 'user',
          parts: [{ text: msg.text }]
        }));
      chatHistory.push({ role: "user", parts: [{ text: textToSend }] });

      const result = await callGeminiAPI(chatHistory);
      
      let botResponseText = "Sorry, I couldn't generate a response.";
      if (result.candidates?.[0]?.content?.parts?.[0]?.text) {
        botResponseText = result.candidates[0].content.parts[0].text;
      }

      const botMessage = {
        text: botResponseText,
        sender: 'bot',
        timestamp: serverTimestamp(),
      };
      await addDoc(collection(db, messagesColPath), botMessage);

    } catch (error) {
      console.error("Error sending message:", error);
      setError(error.message);
      const errorMessage = {
        text: `An error occurred: ${error.message}`,
        sender: 'bot',
        timestamp: serverTimestamp(),
        isError: true,
      };
      await addDoc(collection(db, messagesColPath), errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  // --- RENDER LOGIC ---

  // Show a config error screen if Firebase keys are missing
  if (!isFirebaseConfigured) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-950 text-white">
        <div className="text-center p-6 bg-red-900/40 border border-red-700 rounded-lg max-w-md mx-auto">
          <h1 className="text-2xl font-bold text-white mb-3">Configuration Error</h1>
          <p className="text-red-200">The application is not configured correctly.</p>
          <p className="text-gray-400 mt-2 text-sm">
            Please ensure all `REACT_APP_FIREBASE_*` environment variables are set in your Netlify deployment settings.
          </p>
        </div>
      </div>
    );
  }

  // Show a loading spinner while waiting for auth
  if (!isAuthReady) {
    return <div className="flex items-center justify-center h-screen bg-gray-950 text-gray-300"><IconLoader className="w-12 h-12 animate-spin" /></div>;
  }
  
  const StarterPromptCard = ({ title, subtitle, onClick }) => (
    <button onClick={onClick} className="bg-gray-900/70 p-4 rounded-lg text-left w-full hover:bg-gray-800/90 transition-colors relative border border-gray-800">
      <p className="font-semibold text-gray-200">{title}</p>
      <p className="text-sm text-gray-500">{subtitle}</p>
    </button>
  );

  const MessageContent = ({ text }) => (
    <div className="prose prose-invert prose-sm max-w-none text-gray-300">
      {text.split('\n').map((line, index) => <p key={index} className="mb-0">{line || '\u00A0'}</p>)}
    </div>
  );

  return (
    <>
      <style>{`
        /* Styles remain the same */
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        body { font-family: 'Inter', sans-serif; background-color: #0A0A0A; background-image: radial-gradient(circle at 15% 90%, rgba(37, 99, 235, 0.15) 0%, rgba(37, 99, 235, 0) 40%), radial-gradient(circle at 85% 20%, rgba(139, 92, 246, 0.15) 0%, rgba(139, 92, 246, 0) 40%), linear-gradient(rgba(255, 255, 255, 0.015) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 0.015) 1px, transparent 1px); background-size: 100% 100%, 100% 100%, 20px 20px, 20px 20px; }
        .pro-scrollbar::-webkit-scrollbar { width: 6px; } .pro-scrollbar::-webkit-scrollbar-track { background: transparent; } .pro-scrollbar::-webkit-scrollbar-thumb { background: #27272a; border-radius: 3px; } .pro-scrollbar::-webkit-scrollbar-thumb:hover { background: #3f3f46; }
      `}</style>
      <div className="flex h-screen text-gray-200 bg-transparent">
        <div className={`bg-black/30 backdrop-blur-xl border-r border-gray-800/50 flex flex-col justify-between transition-all duration-300 ease-in-out ${isSidebarOpen ? 'w-64 p-4' : 'w-0 p-0 overflow-hidden'}`}>
          {/* Sidebar content is currently empty, so no icons are used here. */}
        </div>
        <div className="flex-1 flex flex-col bg-transparent">
          <header className="p-4 flex justify-between items-center flex-shrink-0">
            <div className="flex items-center gap-2">
              <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 hover:bg-gray-800/50 rounded-md"><IconMenu className="w-5 h-5 text-gray-400" /></button>
              <h1 className="text-md font-semibold text-gray-300">AI Assistant</h1>
            </div>
            <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center"><IconUser className="w-5 h-5 text-gray-300" /></div>
          </header>
          <main className="flex-1 overflow-y-auto px-4 pro-scrollbar">
            <div className="max-w-3xl mx-auto h-full">
              {messages.length === 0 && !isLoading ? (
                <div className="flex flex-col items-center justify-center h-full pb-24 text-center">
                  <div className="w-16 h-16 bg-gradient-to-br from-blue-600 to-purple-600 rounded-full flex items-center justify-center border-2 border-gray-700 mb-4"><IconSparkles className="w-8 h-8 text-white" /></div>
                  <h2 className="text-2xl font-semibold text-gray-200">How can I help you today?</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full mt-8">
                    <StarterPromptCard title="Write a Python script" subtitle="that fetches weather data" onClick={() => handleSendMessage(null, "Write a Python script that fetches weather data from an API")} />
                    <StarterPromptCard title="Explain a concept" subtitle="like recursion in programming" onClick={() => handleSendMessage(null, "Explain recursion in programming like I'm five")} />
                  </div>
                </div>
              ) : (
                <div className="space-y-8 pb-24">
                  {messages.map((msg) => (
                    <div key={msg.id} className="flex items-start gap-4">
                      <div className={`w-8 h-8 rounded-full border flex items-center justify-center flex-shrink-0 ${msg.isError ? 'bg-red-900/50 border-red-700' : 'bg-gray-800 border-gray-700'}`}>
                        {msg.sender === 'user' ? <IconUser className="w-5 h-5 text-gray-400" /> : <IconSparkles className={`w-5 h-5 ${msg.isError ? 'text-red-500' : 'text-blue-500'}`} />}
                      </div>
                      <div className="flex-1 pt-1">
                        <p className="font-semibold text-gray-200 mb-2">{msg.sender === 'user' ? 'You' : 'AI Assistant'}</p>
                        <MessageContent text={msg.text} />
                      </div>
                    </div>
                  ))}
                  {isLoading && ( <div className="flex items-start gap-4"> <div className="w-8 h-8 rounded-full bg-gray-800 border border-gray-700 flex items-center justify-center flex-shrink-0"><IconSparkles className="w-5 h-5 text-blue-500" /></div><div className="flex-1 pt-1 mt-2"><IconLoader className="w-5 h-5 animate-spin text-gray-500" /></div></div> )}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>
          </main>
          <footer className="px-4 pb-4 flex-shrink-0">
            <div className="max-w-3xl mx-auto">
              {error && <div className="bg-red-500/10 border border-red-500/30 text-red-300 text-sm rounded-md p-3 mb-3">{error}</div>}
              <form onSubmit={handleSendMessage} className="relative">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(e); } }}
                  placeholder="Enter a prompt here..."
                  className="w-full bg-black/20 border border-gray-700/50 rounded-lg py-3 pl-4 pr-14 focus:ring-2 focus:ring-blue-500 focus:outline-none transition-shadow resize-none backdrop-blur-sm"
                  rows={1}
                  disabled={isLoading || !!error}
                />
                <button type="submit" disabled={isLoading || !!error || !input.trim()} className="absolute right-3 bottom-2.5 p-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                  <IconArrowUp />
                </button>
              </form>
            </div>
          </footer>
        </div>
      </div>
    </>
  );
}
