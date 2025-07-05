import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, addDoc, onSnapshot, query, orderBy, serverTimestamp } from 'firebase/firestore';
import { ArrowUp, User, Bot, Loader2, Clipboard, BrainCircuit } from 'lucide-react';

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
            if (fetchedMessages.length === 0) {
                 setMessages([{
                    id: 'welcome-1',
                    text: "Hello! I'm a general-purpose AI assistant. You can ask me anything.",
                    sender: 'bot',
                    timestamp: new Date()
                }]);
            } else {
                setMessages(fetchedMessages);
            }
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
    
    // --- Message Handling ---
    const handleSendMessage = async (e) => {
        e.preventDefault();
        if (!input.trim() || isLoading || !userId || !db) return;

        const userMessage = {
            text: input,
            sender: 'user',
            timestamp: serverTimestamp(),
        };

        setIsLoading(true);
        const currentInput = input;
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
            
            chatHistory.push({ role: "user", parts: [{ text: currentInput }] });

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
    
    // --- Copy to Clipboard ---
    const copyToClipboard = (text) => {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.select();
        try {
            document.execCommand('copy');
        } catch (err) {
            console.error('Failed to copy text: ', err);
        }
        document.body.removeChild(textArea);
    };


    if (!isAuthReady) {
        return (
            <div className="flex items-center justify-center h-screen bg-gray-100 dark:bg-gray-900 text-gray-800 dark:text-gray-200">
                <Loader2 className="w-12 h-12 animate-spin text-indigo-600" />
                <p className="ml-4 text-lg">Initializing AI...</p>
            </div>
        );
    }

    return (
        <div className="flex h-screen font-sans bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
            {/* --- Sidebar --- */}
            <div className="w-72 bg-white dark:bg-gray-950 p-6 flex-col justify-between hidden md:flex border-r border-gray-200 dark:border-gray-800">
                <div>
                    <div className="flex items-center gap-3 mb-2">
                         <BrainCircuit className="w-8 h-8 text-indigo-600"/>
                         <h1 className="text-2xl font-bold">Yash's AI Assistant</h1>
                    </div>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-8">General Conversational AI</p>
                    <button className="w-full bg-indigo-600 text-white py-2 px-4 rounded-lg hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2">
                        + New Chat
                    </button>
                </div>
                <div className="text-xs text-gray-500">
                    <p>User ID: <span className="font-mono">{userId ? userId.substring(0, 12) + '...' : '...'}</span></p>
                </div>
            </div>

            {/* --- Main Chat Area --- */}
            <div className="flex-1 flex flex-col bg-gray-50 dark:bg-gray-900">
                 {error && (
                    <div className="p-4 bg-red-500 text-white text-center text-sm">
                        <p><strong>Configuration Error:</strong> {error}</p>
                    </div>
                )}
                <div className="flex-1 overflow-y-auto p-6">
                    <div className="space-y-6">
                        {messages.map((msg, index) => (
                            <div key={msg.id || index} className={`flex items-start gap-4 ${msg.sender === 'user' ? 'justify-end' : ''}`}>
                                {msg.sender === 'bot' && (
                                    <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center flex-shrink-0">
                                        <Bot className="w-5 h-5 text-white" />
                                    </div>
                                )}
                                <div className={`relative max-w-2xl p-4 rounded-xl shadow-sm ${msg.sender === 'user' ? 'bg-indigo-600 text-white rounded-br-none' : 'bg-white dark:bg-gray-800 rounded-bl-none'}`}>
                                    <p className="whitespace-pre-wrap">{msg.text}</p>
                                    {msg.sender === 'bot' && (
                                        <button onClick={() => copyToClipboard(msg.text)} className="absolute top-2 right-2 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-white transition-colors">
                                            <Clipboard className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>
                                {msg.sender === 'user' && (
                                    <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center flex-shrink-0">
                                        <User className="w-5 h-5 text-gray-500" />
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                    {isLoading && (
                         <div className="flex items-start gap-4 mt-6">
                            <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center flex-shrink-0">
                                <Bot className="w-5 h-5 text-white" />
                            </div>
                            <div className="max-w-2xl p-4 rounded-xl bg-white dark:bg-gray-800 rounded-bl-none shadow-sm">
                                <Loader2 className="w-5 h-5 animate-spin text-gray-500" />
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>

                {/* --- Input Form --- */}
                <div className="p-6 bg-white/80 dark:bg-gray-950/80 backdrop-blur-sm border-t border-gray-200 dark:border-gray-800">
                    <form id="chat-form" onSubmit={handleSendMessage} className="relative">
                        <textarea
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    handleSendMessage(e);
                                }
                            }}
                            placeholder="Ask me anything..."
                            className="w-full bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700 rounded-lg py-3 pl-4 pr-12 focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-shadow resize-none"
                            rows={1}
                            disabled={isLoading || !!error}
                        />
                        <button type="submit" disabled={isLoading || !!error || !input.trim()} className="absolute right-3 bottom-3 p-2 rounded-full bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-gray-500 disabled:cursor-not-allowed transition-colors">
                            <ArrowUp className="w-5 h-5" />
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}
