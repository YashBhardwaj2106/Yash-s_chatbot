import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, addDoc, onSnapshot, query, orderBy, serverTimestamp } from 'firebase/firestore';
import { ArrowUp, User, Loader2, Sparkles, Menu, Plus, MessageSquare, HelpCircle, Settings } from 'lucide-react';

// --- Firebase Configuration ---
// This robust method reads each key individually from the build environment.
const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID
};

const appId = 'simple-gemini-chatbot'; // Using the original App ID

// --- Firebase Initialization ---
const app = firebaseConfig.apiKey ? initializeApp(firebaseConfig) : null;
const auth = app ? getAuth(app) : null;
const db = app ? getFirestore(app) : null;

// --- Main App Component ---
export default function App() {
    const [userId, setUserId] = useState(null);
    const [isAuthReady, setIsAuthReady] = useState(false);
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef(null);
    const [error, setError] = useState(null);
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);

    // --- Initial Setup Check ---
    useEffect(() => {
        if (!app || !auth || !db) {
            setError("Firebase is not configured. Please ensure all REACT_APP_FIREBASE_* environment variables are set correctly.");
            setIsAuthReady(true);
        }
    }, []);

    // --- Authentication Effect ---
    useEffect(() => {
        if (!auth) return;
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

        const messagesColPath = `/artifacts/${appId}/users/${userId}/messages`;
        const q = query(collection(db, messagesColPath), orderBy("timestamp", "asc"));

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetchedMessages = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
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
        const fakeEvent = { preventDefault: () => {} };
        setInput(prompt);
        // We need to set the input and then call the handler in a timeout
        // to ensure the state is updated before the form submission logic runs.
        setTimeout(() => {
             handleSendMessage(fakeEvent, prompt);
        }, 0);
    }

    // --- Message Handling ---
    const handleSendMessage = async (e, prompt) => {
        e.preventDefault();
        const textToSend = prompt || input;
        if (!textToSend.trim() || isLoading || !userId || !db) return;

        const userMessage = {
            text: textToSend,
            sender: 'user',
            timestamp: serverTimestamp(),
        };

        setIsLoading(true);
        setInput('');

        const messagesColPath = `/artifacts/${appId}/users/${userId}/messages`;
        await addDoc(collection(db, messagesColPath), userMessage);

        // --- Call our secure backend proxy ---
        try {
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
                const errData = await response.json();
                throw new Error(errData.error || `API call failed with status: ${response.status}`);
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
            <div className="flex items-center justify-center h-screen bg-gray-900">
                <Loader2 className="w-12 h-12 animate-spin text-white" />
            </div>
        );
    }
    
    const StarterPromptCard = ({ title, subtitle, onClick }) => (
        <button onClick={onClick} className="bg-gray-800/50 p-4 rounded-xl text-left w-full hover:bg-gray-700/60 transition-colors relative backdrop-blur-sm border border-gray-700/50">
            <p className="font-medium text-gray-300">{title}</p>
            <p className="text-sm text-gray-400">{subtitle}</p>
        </button>
    );

    return (
        <>
            <style>{`
                body {
                    background-color: #0d0f15;
                    background-image: 
                        radial-gradient(at 15% 95%, hsla(240,8%,13%,1) 0px, transparent 50%),
                        radial-gradient(at 85% 20%, hsla(263,45%,23%,1) 0px, transparent 50%),
                        radial-gradient(at 50% 50%, hsla(220,55%,15%,1) 0px, transparent 50%),
                        radial-gradient(at 5% 5%, hsla(339,56%,20%,1) 0px, transparent 50%);
                }
            `}</style>
            <div className="flex h-screen font-sans text-gray-100 bg-transparent">
                {/* --- Sidebar --- */}
                <div className={`bg-gray-900/40 backdrop-blur-xl border-r border-gray-800/50 flex flex-col justify-between transition-all duration-300 ease-in-out ${isSidebarOpen ? 'w-64 p-4' : 'w-0 p-0'}`}>
                    <div className={`transition-opacity duration-200 ${isSidebarOpen ? 'opacity-100' : 'opacity-0'}`}>
                        <button className="w-full bg-gray-800/60 text-gray-200 py-2 px-4 rounded-full hover:bg-gray-700/70 transition-colors flex items-center justify-center gap-2 mb-6 border border-gray-700">
                            <Plus className="w-5 h-5"/> New Chat
                        </button>
                        <div className="space-y-2">
                            <h3 className="text-sm font-medium text-gray-400 px-2">Recent</h3>
                            <button className="w-full flex items-center gap-3 text-left text-gray-300 hover:bg-gray-800/50 py-2 px-2 rounded-lg transition-colors truncate">
                                <MessageSquare className="w-4 h-4 flex-shrink-0"/> What is quantum computing?
                            </button>
                        </div>
                    </div>
                    <div className={`transition-opacity duration-200 ${isSidebarOpen ? 'opacity-100' : 'opacity-0'}`}>
                         <button className="w-full flex items-center gap-3 text-left text-gray-300 hover:bg-gray-800/50 py-2 px-2 rounded-lg transition-colors">
                            <HelpCircle className="w-5 h-5"/> Help
                        </button>
                         <button className="w-full flex items-center gap-3 text-left text-gray-700 dark:text-gray-300 hover:bg-gray-800/50 py-2 px-2 rounded-lg transition-colors">
                            <Settings className="w-5 h-5"/> Settings
                        </button>
                    </div>
                </div>

                {/* --- Main Chat Area --- */}
                <div className="flex-1 flex flex-col bg-transparent">
                    <header className="p-4 flex justify-between items-center">
                        <div className="flex items-center gap-2">
                             <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 hover:bg-gray-800 rounded-full">
                                <Menu className="w-6 h-6 text-gray-400"/>
                            </button>
                            <h1 className="text-xl font-medium">Gemini</h1>
                        </div>
                        <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center">
                            <User className="w-5 h-5 text-gray-300"/>
                        </div>
                    </header>
                    
                    <main className="flex-1 overflow-y-auto px-4">
                        <div className="max-w-3xl mx-auto h-full">
                            {messages.length === 0 ? (
                                <div className="flex flex-col justify-between h-full pb-24">
                                    <div className="text-left">
                                        <h2 className="text-5xl font-medium bg-gradient-to-r from-blue-400 via-purple-400 to-red-400 text-transparent bg-clip-text">Hello, Yash</h2>
                                        <p className="text-5xl font-medium text-gray-600">How can I help you today?</p>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
                                        <StarterPromptCard title="Give me ideas" subtitle="for what to do with my kids' art" onClick={() => handleStarterPrompt("Give me ideas for what to do with my kids' art")}/>
                                        <StarterPromptCard title="Explain this to me" subtitle="what is the butterfly effect?" onClick={() => handleStarterPrompt("Explain what is the butterfly effect?")}/>
                                        <StarterPromptCard title="Write a thank you note" subtitle="to my interviewer" onClick={() => handleStarterPrompt("Write a thank you note to my interviewer")}/>
                                        <StarterPromptCard title="Help me debug" subtitle="why is my code not working?" onClick={() => handleStarterPrompt("Help me debug my python code")}/>
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-8 pb-24">
                                    {messages.map((msg, index) => (
                                        <div key={msg.id || index} className="flex items-start gap-4">
                                            <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center flex-shrink-0">
                                                {msg.sender === 'user' ? <User className="w-5 h-5 text-gray-300"/> : <Sparkles className="w-5 h-5 text-indigo-400"/>}
                                            </div>
                                            <div className="flex-1 pt-1">
                                                <p className="font-medium text-gray-200 mb-2">{msg.sender === 'user' ? 'You' : 'Gemini'}</p>
                                                <p className="whitespace-pre-wrap text-gray-300">{msg.text}</p>
                                            </div>
                                        </div>
                                    ))}
                                    {isLoading && (
                                         <div className="flex items-start gap-4">
                                            <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center flex-shrink-0">
                                                <Sparkles className="w-5 h-5 text-indigo-400"/>
                                            </div>
                                            <div className="flex-1 pt-1">
                                                 <Loader2 className="w-5 h-5 animate-spin text-gray-500" />
                                            </div>
                                        </div>
                                    )}
                                    <div ref={messagesEndRef} />
                                </div>
                            )}
                        </div>
                    </main>

                    <footer className="px-4 pb-4">
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
                                    placeholder="Enter a prompt here"
                                    className="w-full bg-gray-800/50 border border-gray-700/50 rounded-2xl py-4 pl-6 pr-14 focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-shadow resize-none backdrop-blur-sm"
                                    rows={1}
                                    disabled={isLoading || !!error}
                                />
                                <button type="submit" disabled={isLoading || !!error || !input.trim()} className="absolute right-4 bottom-3 p-2 rounded-full bg-gray-300 text-gray-800 hover:bg-white disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors">
                                    <ArrowUp className="w-5 h-5" />
                                </button>
                            </form>
                             <p className="text-xs text-center text-gray-600 mt-2">
                               Gemini may display inaccurate info, including about people, so double-check its responses.
                            </p>
                        </div>
                    </footer>
                </div>
            </div>
        </>
    );
}
