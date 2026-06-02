'use client';

import { useChat } from '@ai-sdk/react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { Send, User, Bot, Sparkles, RefreshCw } from 'lucide-react';
import { useEffect, useRef } from 'react';

export default function AelixxrChat() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chatState = useChat({ api: '/api/aelixxr/chat' } as any) as any;
  const { messages, input, handleInputChange, handleSubmit, isLoading, error, reload } = chatState;

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <div className="flex flex-col h-[80vh] bg-white rounded-3xl border border-zinc-200 shadow-2xl overflow-hidden">
      {/* Header */}
      <div className="p-6 border-b border-zinc-100 flex justify-between items-center bg-zinc-50/50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-green-600 rounded-2xl flex items-center justify-center shadow-lg shadow-green-200">
            <Sparkles className="text-white w-5 h-5" />
          </div>
          <div>
            <h2 className="font-black text-zinc-900 tracking-tight">AELIXXR <span className="text-green-600 italic">PREMIUM</span></h2>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Streaming Active</span>
            </div>
          </div>
        </div>
        <button 
          onClick={() => reload()} 
          disabled={isLoading}
          className="p-2 hover:bg-zinc-200 rounded-full transition-colors text-zinc-400 hover:text-zinc-900"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Messages */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-6 space-y-8 scroll-smooth"
      >
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center space-y-4">
            <div className="w-16 h-16 bg-zinc-100 rounded-3xl flex items-center justify-center">
              <Bot className="text-zinc-400 w-8 h-8" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-zinc-900">Welcome, Oga.</h3>
              <p className="text-sm text-zinc-500 max-w-xs mx-auto">
                I am your Life Companion. Ask me anything about business, math, or life. 
                I now support streaming and LaTeX rendering.
              </p>
            </div>
          </div>
        )}

        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        {messages.map((m: any) => (
          <div key={m.id} className={`flex gap-4 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
              m.role === 'user' ? 'bg-zinc-900' : 'bg-green-100'
            }`}>
              {m.role === 'user' ? <User className="text-white w-4 h-4" /> : <Bot className="text-green-600 w-4 h-4" />}
            </div>
            <div className={`max-w-[85%] rounded-2xl px-5 py-3 shadow-sm ${
              m.role === 'user' 
                ? 'bg-zinc-900 text-white rounded-tr-none' 
                : 'bg-zinc-50 text-zinc-900 border border-zinc-100 rounded-tl-none'
            }`}>
              <div className="prose prose-sm max-w-none prose-zinc dark:prose-invert prose-p:leading-relaxed prose-pre:bg-zinc-800 prose-pre:text-zinc-100">
                <ReactMarkdown
                  remarkPlugins={[remarkMath]}
                  rehypePlugins={[rehypeKatex]}
                  components={{
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    a: ({node: _node, ...props}) => <a {...props} className="text-green-600 font-bold hover:underline" target="_blank" rel="noopener noreferrer" />,
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    table: ({node: _node, ...props}) => <div className="overflow-x-auto my-4"><table {...props} className="min-w-full divide-y divide-zinc-200 border border-zinc-200 rounded-lg" /></div>,
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    th: ({node: _node, ...props}) => <th {...props} className="px-3 py-2 bg-zinc-100 text-left text-xs font-bold uppercase" />,
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    td: ({node: _node, ...props}) => <td {...props} className="px-3 py-2 text-sm border-t border-zinc-100" />,
                  }}
                >
                  {m.content}
                </ReactMarkdown>
              </div>
            </div>
          </div>
        ))}

        {isLoading && messages[messages.length - 1]?.role !== 'assistant' && (
          <div className="flex gap-4">
            <div className="w-8 h-8 rounded-xl bg-green-100 flex items-center justify-center shrink-0">
              <Bot className="text-green-600 w-4 h-4" />
            </div>
            <div className="bg-zinc-50 border border-zinc-100 rounded-2xl rounded-tl-none px-5 py-3 flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-zinc-300 rounded-full animate-bounce [animation-delay:-0.3s]" />
              <span className="w-1.5 h-1.5 bg-zinc-300 rounded-full animate-bounce [animation-delay:-0.15s]" />
              <span className="w-1.5 h-1.5 bg-zinc-300 rounded-full animate-bounce" />
            </div>
          </div>
        )}

        {error && (
          <div className="p-4 bg-red-50 text-red-700 rounded-2xl text-xs font-bold text-center border border-red-100">
            🚨 Error: {error.message}. Please check your connection.
          </div>
        )}
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-6 bg-zinc-50/50 border-t border-zinc-100">
        <div className="relative group">
          <input
            className="w-full bg-white border border-zinc-200 rounded-2xl px-6 py-4 pr-16 focus:outline-none focus:ring-4 focus:ring-green-500/10 focus:border-green-600 transition-all shadow-inner"
            value={input}
            placeholder="Ask Aelixxr something..."
            onChange={handleInputChange}
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="absolute right-3 top-3 p-2 bg-zinc-900 text-white rounded-xl hover:bg-green-600 disabled:opacity-50 disabled:hover:bg-zinc-900 transition-all shadow-lg"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
        <p className="mt-3 text-[10px] text-zinc-400 text-center font-bold uppercase tracking-widest">
          Aelixxr may provide inaccurate info. Verify important facts.
        </p>
      </form>
    </div>
  );
}
