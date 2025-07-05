import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, addDoc, onSnapshot, query, orderBy, serverTimestamp } from 'firebase/firestore';
import { ArrowUp, User, Loader2, Plus, Sun, Trash2, LogOut } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';


// --- Firebase Configuration ---
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
            <div className="flex items-center justify-center h-screen bg-gray-100">
                <Loader2 className="w-12 h-12 animate-spin text-gray-400" />
            </div>
        );
    }
    
    const StarterPromptCard = ({ title, subtitle, onClick }) => (
        <button onClick={onClick} className="border border-gray-300 p-3 rounded-lg text-left w-full hover:bg-gray-100 transition-colors relative">
            <p className="font-semibold text-gray-800 text-sm">{title}</p>
            <p className="text-sm text-gray-500">{subtitle}</p>
        </button>
    );

    const CodeBlock = ({ node, inline, className, children, ...props }) => {
        const match = /language-(\w+)/.exec(className || '');
        const codeString = String(children).replace(/\n$/, '');
        
        return !inline && match ? (
            <div className="relative my-4 rounded-md bg-black text-white">
                <div className="flex items-center justify-between px-4 py-1 bg-gray-800 rounded-t-md">
                    <span className="text-xs font-sans text-gray-400">{match[1]}</span>
                </div>
                <SyntaxHighlighter
                    style={vscDarkPlus}
                    language={match[1]}
                    PreTag="div"
                    {...props}
                >
                    {codeString}
                </SyntaxHighlighter>
            </div>
        ) : (
            <code className="bg-gray-200 text-gray-800 rounded-sm px-1 py-0.5 text-sm" {...props}>
                {children}
            </code>
        );
    };
    
    const ChatGptLogo = () => (
        <svg width="24" height="24" viewBox="0 0 41 41" fill="none" xmlns="http://www.w3.org/2000/svg" strokeWidth="1.5" className="h-6 w-6">
            <path d="M35.5 11.5V1H5.5V11.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"></path>
            <path d="M35.5 29.5V40H5.5V29.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"></path>
            <path d="M40 20.5C40 26.8513 34.8513 32 28.5 32C22.1487 32 17 26.8513 17 20.5C17 14.1487 22.1487 9 28.5 9C34.8513 9 40 14.1487 40 20.5Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"></path>
            <path d="M1 20.5C1 26.8513 6.14873 32 12.5 32C18.8513 32 24 26.8513 24 20.5C24 14.1487 18.8513 9 12.5 9C6.14873 9 1 14.1487 1 20.5Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"></path>
        </svg>
    );

    return (
        <div className="flex h-screen font-sans bg-gray-100 text-gray-800">
            {/* --- Sidebar --- */}
            <div className="w-64 bg-gray-900 flex flex-col justify-between p-2">
                <div className="flex-1">
                    <button className="w-full border border-gray-700 text-white py-2 px-3 rounded-lg hover:bg-gray-800 transition-colors flex items-center justify-between gap-2 text-sm mb-4">
                        <div className="flex items-center gap-2">
                            <ChatGptLogo />
                            New chat
                        </div>
                        <Plus className="w-4 h-4"/>
                    </button>
                    <div className="space-y-1">
                        {/* Recent chats would be mapped here */}
                    </div>
                </div>
                <div>
                     <button className="w-full flex items-center gap-3 text-left text-white hover:bg-gray-800 py-2 px-3 rounded-lg transition-colors text-sm">
                        <Sun className="w-4 h-4"/> Light mode
                    </button>
                     <button className="w-full flex items-center gap-3 text-left text-white hover:bg-gray-800 py-2 px-3 rounded-lg transition-colors text-sm">
                        <Trash2 className="w-4 h-4"/> Clear conversations
                    </button>
                    <button className="w-full flex items-center gap-3 text-left text-white hover:bg-gray-800 py-2 px-3 rounded-lg transition-colors text-sm">
                        <LogOut className="w-4 h-4"/> Log out
                    </button>
                </div>
            </div>

            {/* --- Main Chat Area --- */}
            <div className="flex-1 flex flex-col bg-white">
                <main className="flex-1 overflow-y-auto">
                    <div className="max-w-3xl mx-auto h-full pt-8">
                        {messages.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full pb-24 text-center">
                                <div className="w-12 h-12 mb-4">
                                    <ChatGptLogo />
                                </div>
                                <h2 className="text-2xl font-semibold text-gray-800">How can I help you today?</h2>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full mt-8">
                                    <StarterPromptCard title="Tell me a fun fact" subtitle="about the Roman Empire" onClick={() => handleStarterPrompt("Tell me a fun fact about the Roman Empire")}/>
                                    <StarterPromptCard title="Recommend a book" subtitle="for a long flight" onClick={() => handleStarterPrompt("Recommend a book for a long flight")}/>
                                    <StarterPromptCard title="Write a SQL query" subtitle="to find all users who signed up last week" onClick={() => handleStarterPrompt("Write a SQL query to find all users who signed up last week")}/>
                                    <StarterPromptCard title="Explain a topic" subtitle="like it's a movie plot" onClick={() => handleStarterPrompt("Explain quantum mechanics like it's a movie plot")}/>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-8 pb-24">
                                {messages.map((msg, index) => (
                                    <div key={msg.id || index} className="flex items-start gap-5 px-4">
                                        <div className="w-8 h-8 rounded-sm bg-gray-300 flex items-center justify-center flex-shrink-0">
                                            {msg.sender === 'user' ? <User className="w-5 h-5 text-gray-600"/> : <ChatGptLogo />}
                                        </div>
                                        <div className="flex-1 pt-1">
                                            <p className="font-semibold text-gray-800 mb-2">{msg.sender === 'user' ? 'You' : 'ChatGPT'}</p>
                                            <div className="prose prose-sm max-w-none text-gray-800">
                                                <ReactMarkdown
                                                    components={{ code: CodeBlock }}
                                                >
                                                    {msg.text}
                                                </ReactMarkdown>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                                {isLoading && (
                                     <div className="flex items-start gap-5 px-4">
                                        <div className="w-8 h-8 rounded-sm bg-gray-300 flex items-center justify-center flex-shrink-0">
                                            <ChatGptLogo />
                                        </div>
                                        <div className="flex-1 pt-1 mt-2">
                                             <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                                        </div>
                                    </div>
                                )}
                                <div ref={messagesEndRef} />
                            </div>
                        )}
                    </div>
                </main>

                <footer className="px-4 pb-4 flex-shrink-0 bg-white">
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
                                placeholder="Message ChatGPT..."
                                className="w-full border border-gray-300 rounded-lg py-3 pl-4 pr-14 focus:ring-2 focus:ring-gray-400 focus:outline-none transition-shadow resize-none"
                                rows={1}
                                disabled={isLoading || !!error}
                            />
                            <button type="submit" disabled={isLoading || !!error || !input.trim()} className="absolute right-3 bottom-2.5 p-2 rounded-lg bg-gray-800 text-white hover:bg-black disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors">
                                <ArrowUp className="w-4 h-4" />
                            </button>
                        </form>
                         <p className="text-xs text-center text-gray-400 mt-2">
                           ChatGPT can make mistakes. Consider checking important information.
                        </p>
                    </div>
                </footer>
            </div>
        </div>
    );
}
