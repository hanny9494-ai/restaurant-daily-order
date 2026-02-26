"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

type Message = {
  role: "user" | "assistant";
  content: string;
};

export default function ChatbotPage() {
  const [conversationId, setConversationId] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const chatRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [messages, loading]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  }, [input]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const query = input.trim();
    if (!query || loading) return;

    setError("");
    setLoading(true);
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: query }]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, conversationId }),
      });

      const json = await res.json();
      if (!res.ok) {
        setError(json?.error || "调用失败，请稍后再试");
        return;
      }

      if (json?.conversationId) setConversationId(json.conversationId);
      setMessages((prev) => [...prev, { role: "assistant", content: json.answer || "" }]);
    } catch {
      setError("网络错误，请稍后重试");
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSubmit(e as unknown as FormEvent);
    }
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
          background: #212121;
          color: #ececec;
          font-family: 'Inter', sans-serif;
          font-size: 15px;
          line-height: 1.7;
        }
        .jify-layout {
          display: flex;
          flex-direction: column;
          width: 100%;
          max-width: 680px;
          height: 100vh;
          margin: 0 auto;
          padding: 0 16px;
        }
        .jify-welcome {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 12px;
          padding-bottom: 120px;
        }
        .jify-welcome-title {
          font-size: 28px;
          font-weight: 500;
          color: #ececec;
          letter-spacing: -0.02em;
        }
        .jify-welcome-sub {
          font-size: 14px;
          color: #8e8ea0;
          text-align: center;
          max-width: 360px;
          line-height: 1.6;
        }
        .jify-chat {
          flex: 1;
          overflow-y: auto;
          padding: 24px 0 8px;
          display: flex;
          flex-direction: column;
          gap: 24px;
          scrollbar-width: thin;
          scrollbar-color: #3a3a3a transparent;
        }
        .jify-msg { display: flex; flex-direction: column; gap: 4px; }
        .jify-msg.user { align-items: flex-end; }
        .jify-bubble {
          padding: 12px 16px;
          border-radius: 16px;
          font-size: 15px;
          line-height: 1.7;
          white-space: pre-wrap;
          word-break: break-word;
          max-width: 85%;
        }
        .jify-msg.user .jify-bubble {
          background: #2f2f2f;
          color: #ececec;
          border-bottom-right-radius: 4px;
        }
        .jify-msg.assistant .jify-bubble {
          background: transparent;
          color: #ececec;
          padding-left: 0;
          max-width: 100%;
        }
        .jify-label {
          font-size: 12px;
          color: #6e6e80;
          padding: 0 4px;
        }
        .jify-typing {
          padding: 14px 4px;
          display: flex;
          gap: 5px;
          align-items: center;
        }
        .jify-typing span {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #6e6e80;
          animation: jify-bounce 1.2s infinite;
        }
        .jify-typing span:nth-child(2) { animation-delay: 0.2s; }
        .jify-typing span:nth-child(3) { animation-delay: 0.4s; }
        @keyframes jify-bounce {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
          30% { transform: translateY(-4px); opacity: 1; }
        }
        .jify-tips {
          padding: 0 0 12px;
          display: flex;
          flex-direction: column;
          gap: 5px;
          flex-shrink: 0;
        }
        .jify-tips-title {
          font-size: 11px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #4a4a5a;
          margin-bottom: 2px;
        }
        .jify-tip {
          font-size: 12px;
          color: #6e6e80;
          padding-left: 12px;
          position: relative;
        }
        .jify-tip::before {
          content: '·';
          position: absolute;
          left: 0;
          color: #4a4a5a;
        }
        .jify-input-area {
          padding: 12px 0 28px;
          flex-shrink: 0;
        }
        .jify-input-box {
          background: #2f2f2f;
          border-radius: 16px;
          padding: 12px 16px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .jify-textarea {
          background: transparent;
          border: none;
          outline: none;
          color: #ececec;
          font-family: 'Inter', sans-serif;
          font-size: 15px;
          resize: none;
          min-height: 28px;
          max-height: 200px;
          line-height: 1.6;
          width: 100%;
          overflow-y: auto;
        }
        .jify-textarea::placeholder { color: #6e6e80; }
        .jify-input-footer { display: flex; justify-content: flex-end; }
        .jify-send {
          width: 32px;
          height: 32px;
          background: #ececec;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: opacity 0.2s;
          flex-shrink: 0;
        }
        .jify-send:disabled { opacity: 0.2; cursor: not-allowed; }
        .jify-send:hover:not(:disabled) { opacity: 0.8; }
        .jify-error {
          font-size: 12px;
          color: #ff6b6b;
          padding: 6px 0;
        }
      `}</style>

      <div className="jify-layout">
        {messages.length === 0 ? (
          <>
            <div className="jify-welcome">
              <div className="jify-welcome-title">Jify</div>
              <div className="jify-welcome-sub">
                告诉我你想做什么菜——一个食材、一种感觉，或一个模糊的方向都可以。
              </div>
            </div>
            <div className="jify-tips">
              <div className="jify-tips-title">使用说明</div>
              <div className="jify-tip">描述你想研发的菜品，Jify 会引导你一步步把它想清楚</div>
              <div className="jify-tip">每轮对话推进一个研发阶段：结构 → 风味 → 科学 → 技法 → 感官</div>
              <div className="jify-tip">支持中文和英文输入，Jify 会用相同语言回答</div>
            </div>
          </>
        ) : (
          <div className="jify-chat" ref={chatRef}>
            {messages.map((msg, idx) => (
              <div key={idx} className={`jify-msg ${msg.role}`}>
                <div className="jify-label">{msg.role === "user" ? "你" : "Jify"}</div>
                <div className="jify-bubble">{msg.content}</div>
              </div>
            ))}
            {loading && (
              <div className="jify-msg assistant">
                <div className="jify-label">Jify</div>
                <div className="jify-typing">
                  <span /><span /><span />
                </div>
              </div>
            )}
          </div>
        )}

        <div className="jify-input-area">
          {error && <div className="jify-error">{error}</div>}
          <form onSubmit={onSubmit}>
            <div className="jify-input-box">
              <textarea
                ref={textareaRef}
                className="jify-textarea"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="描述你想做的菜，比如「我想做一道以松露为主角的冷前菜」..."
                disabled={loading}
                rows={1}
              />
              <div className="jify-input-footer">
                <button className="jify-send" type="submit" disabled={loading || !input.trim()}>
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="#212121">
                    <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
                  </svg>
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
