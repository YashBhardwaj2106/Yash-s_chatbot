import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, addDoc, onSnapshot, query, orderBy, serverTimestamp } from 'firebase/firestore';
import { ArrowUp, User, Bot, Loader2, Clipboard } from 'lucide-react';

// --- Firebase Configuration ---
// This is a more robust method that reads each key individually.
// This avoids potential JSON parsing errors during the build process.
const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID
};

const appId = 'simple-gemini-chatbot';

// --- Firebase Initialization ---
// Initialize Firebase only if the config has the necessary keys.
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
            setError("Firebase is not configured. Please ensure all REACT_APP_FIREBASE_* environment variables are set correctly in your Netlify settings.");
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
                    text: "Hello! I'm a general-purpose AI assistant, a simpler version of Gemini. You can ask me anything. How can I help you today?",
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

        // --- Gemini API Call ---
        try {
            const chatHistory = messages
                .filter(msg => msg.id !== 'welcome-1')
                .map(msg => ({
                    role: msg.sender === 'bot' ? 'model' : 'user',
                    parts: [{ text: msg.text }]
                }));
            
            chatHistory.push({ role: "user", parts: [{ text: currentInput }] });

            const payload = { contents: chatHistory };
            
            const apiKey = process.env.REACT_APP_GEMINI_API_KEY;
            if (!apiKey) {
                 throw new Error("API_KEY_NOT_FOUND");
            }

            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
            
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                throw new Error(`API call failed with status: ${response.status}`);
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
            console.error("Error calling Gemini API:", error);
            const errorMessageText = error.message === "API_KEY_NOT_FOUND" 
                ? "Could not find the Gemini API Key. Please ensure the REACT_APP_GEMINI_API_KEY environment variable is set."
                : "I'm having trouble connecting to my brain right now. Please try again in a moment.";

            const errorMessage = {
                text: errorMessageText,
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
            <div className="flex items-center justify-center h-screen bg-gray-900 text-white">
                <Loader2 className="w-12 h-12 animate-spin" />
                <p className="ml-4 text-lg">Initializing AI...</p>
            </div>
        );
    }

    return (
        <div className="flex h-screen font-sans bg-gray-900 text-white">
            {/* --- Sidebar --- */}
            <div className="w-64 bg-gray-950 p-6 flex-col justify-between hidden md:flex">
                <div>
                    <h1 className="text-2xl font-bold mb-1">Simple Gemini</h1>
                    <p className="text-sm text-gray-400 mb-8">General Conversational AI</p>
                    <button className="w-full bg-indigo-600 text-white py-2 px-4 rounded-lg hover:bg-indigo-700 transition-colors">
                        + New Chat
                    </button>
                </div>
                <div className="text-xs text-gray-500">
                    <p>User ID: <span className="font-mono">{userId ? userId.substring(0, 12) + '...' : '...'}</span></p>
                    <p>&copy; 2025 Conversational AI</p>
                </div>
            </div>

            {/* --- Main Chat Area --- */}
            <div className="flex-1 flex flex-col bg-gray-800/50">
                 {error && (
                    <div className="p-4 bg-red-800 text-white text-center text-sm">
                        <p><strong>Configuration Error:</strong> {error}</p>
                    </div>
                )}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {messages.map((msg, index) => (
                        <div key={msg.id || index} className={`flex items-start gap-4 ${msg.sender === 'user' ? 'justify-end' : ''}`}>
                            {msg.sender === 'bot' && (
                                <div className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center flex-shrink-0">
                                    <Bot className="w-5 h-5 text-white" />
                                </div>
                            )}
                            <div className={`relative max-w-xl p-4 rounded-xl ${msg.sender === 'user' ? 'bg-blue-600 rounded-br-none' : 'bg-gray-700 rounded-bl-none'}`}>
                                <p className="whitespace-pre-wrap">{msg.text}</p>
                                 {msg.sender === 'bot' && (
                                     <button onClick={() => copyToClipboard(msg.text)} className="absolute top-2 right-2 p-1 text-gray-400 hover:text-white transition-colors opacity-50 hover:opacity-100">
                                        <Clipboard className="w-4 h-4" />
                                     </button>
                                 )}
                            </div>
                             {msg.sender === 'user' && (
                                <div className="w-8 h-8 rounded-full bg-gray-600 flex items-center justify-center flex-shrink-0">
                                    <User className="w-5 h-5 text-white" />
                                </div>
                            )}
                        </div>
                    ))}
                    {isLoading && (
                         <div className="flex items-start gap-4">
                            <div className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center flex-shrink-0">
                                <Bot className="w-5 h-5 text-white" />
                            </div>
                            <div className="max-w-xl p-4 rounded-xl bg-gray-700 rounded-bl-none">
                                <Loader2 className="w-5 h-5 animate-spin" />
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>

                {/* --- Input Form --- */}
                <div className="p-6 bg-gray-900/50 border-t border-gray-700">
                    <form onSubmit={handleSendMessage} className="relative">
                        <input
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            placeholder="Ask me anything..."
                            className="w-full bg-gray-700 border-gray-600 rounded-lg py-3 pl-4 pr-12 focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-shadow"
                            disabled={isLoading || !!error}
                        />
                        <button type="submit" disabled={isLoading || !!error || !input.trim()} className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-500 disabled:cursor-not-allowed transition-colors">
                            <ArrowUp className="w-5 h-5" />
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}