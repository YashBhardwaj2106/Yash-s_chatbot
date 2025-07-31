import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, addDoc, onSnapshot, query, serverTimestamp, setLogLevel } from 'firebase/firestore';

// --- Icon Components (using inline SVG for simplicity) ---
const IconArrowUp = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14"/><path d="m18 11-6-6-6 6"/></svg>;
const IconUser = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>;
const IconLoader = ({ className }) => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>;
const IconSparkles = ({ className }) => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275zM5 3v4M19 17v4M3 19h4M17 3h4"/></svg>;
const IconMenu = ({ className }) => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/></svg>;
const IconPlus = ({ className }) => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><line x1="12" x2="12" y1="5" y2="19"/><line x1="5" x2="19" y1="12" y2="12"/></svg>;
const IconMessageSquare = ({ className }) => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>;
const IconHelpCircle = ({ className }) => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>;
const IconSettings = ({ className }) => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 0 2l-.15.08a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l-.22-.38a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1 0-2l.15-.08a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>;

// --- Main App Component ---
export default function App() {
  // --- State Management ---
  const [userId, setUserId] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const messagesEndRef = useRef(null);
  
  // --- Firebase and App ID Initialization ---
  // These are global variables provided by the environment.
  // We use fallbacks for local development.
  const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-chat-app';
  const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : null;
  
  // --- Firebase Services Refs ---
  const dbRef = useRef(null);
  const authRef = useRef(null);

  // --- Firebase Initialization and Authentication Effect ---
  useEffect(() => {
    if (!firebaseConfig) {
      setError("Firebase configuration is missing. This app cannot start.");
      setIsAuthReady(true);
      return;
    }

    try {
      const app = initializeApp(firebaseConfig);
      dbRef.current = getFirestore(app);
      authRef.current = getAuth(app);
      setLogLevel('debug'); // Optional: for detailed Firestore logs

      const auth = authRef.current;
      
      const unsubscribe = onAuthStateChanged(auth, async (user) => {
        if (user) {
          setUserId(user.uid);
          setIsAuthReady(true);
        } else {
          // Use the provided custom token if available, otherwise sign in anonymously.
          // This is crucial for secure, persistent user sessions in the collaborative environment.
          try {
            if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
              await signInWithCustomToken(auth, __initial_auth_token);
            } else {
              await signInAnonymously(auth);
            }
          } catch (authError) {
            console.error("Authentication failed:", authError);
            setError("Could not authenticate with the service.");
            setIsAuthReady(true);
          }
        }
      });
      return () => unsubscribe();
    } catch (initError) {
        console.error("Firebase initialization failed:", initError);
        setError("Failed to initialize Firebase services.");
        setIsAuthReady(true);
    }
  }, [firebaseConfig]);

  // --- Firestore Message Subscription Effect ---
  useEffect(() => {
    if (!isAuthReady || !userId || !dbRef.current) return;

    // Construct the path to the user's private message collection.
    const messagesColPath = `/artifacts/${appId}/users/${userId}/messages`;
    const q = query(collection(dbRef.current, messagesColPath));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      let fetchedMessages = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        // Convert Firestore Timestamp to JS Date for sorting
        timestamp: doc.data().timestamp?.toDate()
      }));
      
      // Sort messages by timestamp on the client-side.
      // This avoids needing a composite index in Firestore and is more robust.
      fetchedMessages.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

      setMessages(fetchedMessages);
    }, (err) => {
      console.error("Error fetching messages:", err);
      setError("Could not fetch messages. Check database rules and connection.");
    });

    return () => unsubscribe();
  }, [isAuthReady, userId, appId]);

  // --- Auto-scroll to Bottom Effect ---
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);
  
  // --- Gemini API Call Function with Exponential Backoff ---
  const callGeminiAPI = async (chatHistory) => {
    const apiKey = ""; // The platform will inject the key here
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;
    const payload = { contents: chatHistory };
    
    let response;
    let retries = 3;
    let delay = 1000;

    for (let i = 0; i < retries; i++) {
        try {
            response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (response.ok) {
                return await response.json();
            }
            // Don't retry on client-side errors
            if (response.status >= 400 && response.status < 500) {
                 throw new Error(`API Error: ${response.status} ${response.statusText}`);
            }
        } catch (error) {
            if (i === retries - 1) throw error;
        }
        // Wait before retrying
        await new Promise(res => setTimeout(res, delay));
        delay *= 2; // Exponential backoff
    }
    throw new Error("API request failed after multiple retries.");
  };

  // --- Message Sending Handler ---
  const handleSendMessage = async (e, prompt) => {
    if (e) e.preventDefault();
    
    const textToSend = (prompt || input).trim();
    if (!textToSend || isLoading || !userId || !dbRef.current) return;

    // Define the collection path at the function scope
    const messagesColPath = `/artifacts/${appId}/users/${userId}/messages`;

    const userMessage = {
      text: textToSend,
      sender: 'user',
      timestamp: serverTimestamp(),
    };

    setIsLoading(true);
    setInput('');
    setError(null); // Clear previous errors

    try {
      // Add the user's message to Firestore first for immediate UI update.
      await addDoc(collection(dbRef.current, messagesColPath), userMessage);

      // Prepare chat history for the Gemini API call.
      const chatHistory = messages
        .map(msg => ({
          role: msg.sender === 'bot' ? 'model' : 'user',
          parts: [{ text: msg.text }]
        }));
      chatHistory.push({ role: "user", parts: [{ text: textToSend }] });

      // Call the Gemini API directly from the client.
      const result = await callGeminiAPI(chatHistory);
      
      let botResponseText = "Sorry, I couldn't generate a response at this moment.";
      if (result.candidates?.[0]?.content?.parts?.[0]?.text) {
        botResponseText = result.candidates[0].content.parts[0].text;
      }

      const botMessage = {
        text: botResponseText,
        sender: 'bot',
        timestamp: serverTimestamp(),
      };
      await addDoc(collection(dbRef.current, messagesColPath), botMessage);

    } catch (error) {
      console.error("Error sending message or calling API:", error);
      setError(error.message || "An unexpected error occurred.");
      // Now this block can safely access messagesColPath
      const errorMessage = {
        text: `Error: ${error.message}. Please try again.`,
        sender: 'bot',
        timestamp: serverTimestamp(),
        isError: true,
      };
      await addDoc(collection(dbRef.current, messagesColPath), errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  // --- UI Components ---

  // Loading screen while auth is initializing
  if (!isAuthReady) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-950 text-gray-300">
        <IconLoader className="w-12 h-12 animate-spin" />
      </div>
    );
  }
  
  // Starter Prompt Card Component
  const StarterPromptCard = ({ title, subtitle, onClick }) => (
    <button 
      onClick={onClick} 
      className="bg-gray-900/70 p-4 rounded-lg text-left w-full hover:bg-gray-800/90 transition-colors relative border border-gray-800"
    >
      <p className="font-semibold text-gray-200">{title}</p>
      <p className="text-sm text-gray-500">{subtitle}</p>
    </button>
  );

  // Message Renderer to safely handle newlines without innerHTML
  const MessageContent = ({ text }) => {
    return (
        <div className="prose prose-invert prose-sm max-w-none text-gray-300">
            {text.split('\n').map((line, index) => (
                <p key={index} className="mb-0">{line || '\u00A0'}</p> // Use non-breaking space for empty lines
            ))}
        </div>
    );
  };

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
        <div className={`bg-black/30 backdrop-blur-xl border-r border-gray-800/50 flex flex-col justify-between transition-all duration-300 ease-in-out ${isSidebarOpen ? 'w-64 p-4' : 'w-0 p-0 overflow-hidden'}`}>
          <div className={`transition-opacity duration-200 ${isSidebarOpen ? 'opacity-100' : 'opacity-0'}`}>
            <button className="w-full bg-blue-600 text-white py-2 px-3 rounded-md hover:bg-blue-700 transition-colors flex items-center justify-between gap-2 mb-6 text-sm font-semibold">
              New Chat <IconPlus className="w-4 h-4" />
            </button>
            <div className="space-y-1">
              <h3 className="text-xs font-semibold text-gray-500 px-2 mb-2 uppercase tracking-wider">Recent</h3>
              <button className="w-full flex items-center gap-3 text-left text-gray-300 bg-gray-500/10 py-2 px-2 rounded-md transition-colors text-sm truncate">
                <IconMessageSquare className="w-4 h-4 flex-shrink-0" /> What is quantum...
              </button>
            </div>
          </div>
          <div className={`transition-opacity duration-200 ${isSidebarOpen ? 'opacity-100' : 'opacity-0'}`}>
            <button className="w-full flex items-center gap-3 text-left text-gray-400 hover:text-gray-200 hover:bg-gray-800/50 py-2 px-2 rounded-md transition-colors text-sm">
              <IconHelpCircle className="w-4 h-4" /> Help
            </button>
            <button className="w-full flex items-center gap-3 text-left text-gray-400 hover:text-gray-200 hover:bg-gray-800/50 py-2 px-2 rounded-md transition-colors text-sm">
              <IconSettings className="w-4 h-4" /> Settings
            </button>
          </div>
        </div>

        {/* --- Main Chat Area --- */}
        <div className="flex-1 flex flex-col bg-transparent">
          <header className="p-4 flex justify-between items-center flex-shrink-0">
            <div className="flex items-center gap-2">
              <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 hover:bg-gray-800/50 rounded-md">
                <IconMenu className="w-5 h-5 text-gray-400" />
              </button>
              <h1 className="text-md font-semibold text-gray-300">AI Assistant</h1>
            </div>
            <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center">
              <IconUser className="w-5 h-5 text-gray-300" />
            </div>
          </header>
          <main className="flex-1 overflow-y-auto px-4 pro-scrollbar">
            <div className="max-w-3xl mx-auto h-full">
              {messages.length === 0 && !isLoading ? (
                <div className="flex flex-col items-center justify-center h-full pb-24 text-center">
                  <div className="w-16 h-16 bg-gradient-to-br from-blue-600 to-purple-600 rounded-full flex items-center justify-center border-2 border-gray-700 mb-4">
                    <IconSparkles className="w-8 h-8 text-white" />
                  </div>
                  <h2 className="text-2xl font-semibold text-gray-200">How can I help you today?</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full mt-8">
                    <StarterPromptCard title="Write a Python script" subtitle="that fetches weather data" onClick={() => handleSendMessage(null, "Write a Python script that fetches weather data from an API")} />
                    <StarterPromptCard title="Explain a concept" subtitle="like recursion in programming" onClick={() => handleSendMessage(null, "Explain recursion in programming like I'm five")} />
                    <StarterPromptCard title="Brainstorm ideas" subtitle="for a personal portfolio website" onClick={() => handleSendMessage(null, "Brainstorm ideas for a personal portfolio website for a software developer")} />
                    <StarterPromptCard title="Refactor this code" subtitle="to be more efficient" onClick={() => handleSendMessage(null, "How can I refactor this javascript code to be more efficient?")} />
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
                  {isLoading && (
                    <div className="flex items-start gap-4">
                      <div className="w-8 h-8 rounded-full bg-gray-800 border border-gray-700 flex items-center justify-center flex-shrink-0">
                        <IconSparkles className="w-5 h-5 text-blue-500" />
                      </div>
                      <div className="flex-1 pt-1 mt-2">
                        <IconLoader className="w-5 h-5 animate-spin text-gray-500" />
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
                {error && <div className="bg-red-500/10 border border-red-500/30 text-red-300 text-sm rounded-md p-3 mb-3">{error}</div>}
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
                  disabled={isLoading || !!error || !firebaseConfig}
                />
                <button 
                  type="submit" 
                  disabled={isLoading || !!error || !input.trim() || !firebaseConfig} 
                  className="absolute right-3 bottom-2.5 p-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
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
