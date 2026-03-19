import React, { useEffect, useRef, useState } from "react";
import axios from "axios";
import { getMyId } from "../utils/getmyid";
import "./Chatroom.css";

const API_BASE =
  process.env.REACT_APP_API_BASE ||
  "https://studyspace-q5gn.onrender.com";

function dmRoom(a, b) {
  if (!a || !b) return null;
  const [x, y] = [String(a), String(b)].sort();
  return `dm:${x}:${y}`;
}

// socket is passed in from Chatroom — already connected, never created/destroyed here.
export default function PrivateChat({ otherUser, socket, onClose }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [typing, setTyping] = useState(false);
  const [fetchError, setFetchError] = useState(false);

  const typingTimeout = useRef(null);
  const endRef = useRef(null);

  const token = localStorage.getItem("token");
  // THE ROOT FIX: localStorage user has no _id/id — decode it from the JWT instead.
  const myId = getMyId();

  useEffect(() => {
    setMessages([]);
    setFetchError(false);

    if (!myId || !otherUser?._id || !token || !socket) return;

    const otherId = String(otherUser._id);
    const room = dmRoom(myId, otherId);
    if (!room) return;

    socket.emit("joinRoom", { roomId: room });

    // AbortController cancels stale history fetch if user switches chats
    const abort = new AbortController();

    axios
      .get(`${API_BASE}/api/messages/dm/${otherId}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: abort.signal,
      })
      .then((res) => {
        const filtered = (res.data || []).filter((m) => m.room === room);
        setMessages(filtered);
      })
      .catch((err) => {
        if (axios.isCancel(err) || err.name === "CanceledError") return;
        console.error("DM history fetch failed:", err);
        setFetchError(true);
      });

    // Named handlers so socket.off() only removes these, not Chatroom's listeners
    const onMessage = (m) => {
      if (m.room !== room) return;
      setMessages((prev) => {
        if (prev.some((x) => x._id === m._id)) return prev;
        return [...prev, m];
      });
    };
    const onEdited   = (m) => { if (m.room === room) setMessages((prev) => prev.map((x) => (x._id === m._id ? m : x))); };
    const onReacted  = (m) => { if (m.room === room) setMessages((prev) => prev.map((x) => (x._id === m._id ? m : x))); };
    const onTyping   = ({ user, isTyping, roomId }) => { if (roomId === room && user !== myId) setTyping(isTyping); };

    socket.on("message",       onMessage);
    socket.on("messageEdited", onEdited);
    socket.on("messageReacted",onReacted);
    socket.on("typing",        onTyping);

    return () => {
      abort.abort();
      socket.emit("leaveRoom", { roomId: room });
      socket.off("message",       onMessage);
      socket.off("messageEdited", onEdited);
      socket.off("messageReacted",onReacted);
      socket.off("typing",        onTyping);
    };
  }, [otherUser?._id, myId, token, socket]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendTyping = (isTyping) => {
    if (!socket?.connected) return;
    const room = dmRoom(myId, String(otherUser._id));
    if (!room) return;
    socket.emit("typing", { roomId: room, user: myId, isTyping });
  };

  const onTextChange = (e) => {
    setText(e.target.value);
    sendTyping(true);
    if (typingTimeout.current) clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => { sendTyping(false); typingTimeout.current = null; }, 900);
  };

  const send = async (maybeEmoji) => {
    const bodyText = maybeEmoji ?? text;
    if (!bodyText?.trim()) return;
    try {
      const res = await axios.post(
        `${API_BASE}/api/messages/dm/${otherUser._id}`,
        { text: bodyText },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setMessages((prev) => {
        if (prev.some((x) => x._id === res.data._id)) return prev;
        return [...prev, res.data];
      });
      setText("");
      sendTyping(false);
    } catch (e) { console.error("SEND ERROR:", e); }
  };

  const editMessage = async (msgId, newText) => {
    try {
      await axios.put(`${API_BASE}/api/messages/edit/${msgId}`, { text: newText }, { headers: { Authorization: `Bearer ${token}` } });
    } catch (e) { console.error(e); }
  };

  const reactToMessage = async (msgId, emoji) => {
    try {
      await axios.post(`${API_BASE}/api/messages/react/${msgId}`, { emoji }, { headers: { Authorization: `Bearer ${token}` } });
    } catch (e) { console.error(e); }
  };

  return (
    <div className="app-shell chatroom-container" style={{ maxWidth: 900 }}>
      <div className="chatroom-shell" style={{ gridTemplateColumns: "1fr" }}>
        <div className="right">
          <h3>Chat with {otherUser.name || otherUser.email}</h3>

          {fetchError && (
            <div style={{ color: "red", marginBottom: 8, fontSize: 13 }}>
              Could not load message history. Check your connection or try refreshing.
            </div>
          )}

          <div className="chat-window">
            {messages.map((m) => {
              const isMe = String(m.from?._id) === myId;
              return (
                <div key={m._id || m.createdAt} className={`msg ${isMe ? "me" : ""}`}>
                  <div style={{ fontSize: 12, opacity: 0.8 }}>
                    {m.from?.name} {m.edited ? "(edited)" : ""}
                  </div>
                  <div>{m.text}</div>
                  <div style={{ fontSize: 12, opacity: 0.7 }}>
                    {m.reactions?.map((r, i) => (
                      <span key={i} style={{ marginRight: 6 }}>{r.emoji}</span>
                    ))}
                    <button onClick={() => reactToMessage(m._id, "👍")}>👍</button>
                    {isMe && (
                      <button onClick={() => { const t = prompt("Edit message", m.text); if (t !== null) editMessage(m._id, t); }}>
                        Edit
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
            <div ref={endRef} />
          </div>

          <div style={{ minHeight: 20, marginTop: 6 }}>
            {typing && <small>Typing...</small>}
          </div>

          <div className="input-row">
            <input
              id="dm-input"
              name="dm-input"
              value={text}
              onChange={onTextChange}
              placeholder="Type a message..."
            />
            <button disabled={!text.trim()} onClick={() => send()}>Send</button>
            <button onClick={onClose} style={{ marginLeft: 8 }}>Close</button>
          </div>
        </div>
      </div>
    </div>
  );
}