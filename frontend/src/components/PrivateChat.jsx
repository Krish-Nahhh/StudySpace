import React, { useEffect, useRef, useState } from "react";
import axios from "axios";
import { createSocket } from "../socket";
import "./Chatroom.css";

const API_BASE =
  process.env.REACT_APP_API_BASE ||
  "https://studyspace-q5gn.onrender.com";

// ✅ SAFE room function (force strings + guard)
function dmRoom(a, b) {
  if (!a || !b) return null;
  const [x, y] = [String(a), String(b)].sort();
  return `dm:${x}:${y}`;
}

export default function PrivateChat({ otherUser, onClose }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [typing, setTyping] = useState(false);

  const socketRef = useRef(null);
  const typingTimeout = useRef(null);
  const endRef = useRef(null);

  const me = JSON.parse(localStorage.getItem("user") || "{}");
  const token = localStorage.getItem("token");

  useEffect(() => {
    if (!me?._id || !otherUser?._id || !token) return;

    // ✅ ALWAYS use string IDs (fixes wrong room bug)
    const myId = String(me._id);
    const otherId = String(otherUser._id);

    const room = dmRoom(myId, otherId);
    if (!room) return;

    // ✅ reset messages when switching users (prevents bleed)
    setMessages([]);

    // ✅ prevent multiple sockets
    if (socketRef.current) {
      socketRef.current.disconnect();
    }

    const s = createSocket(token);
    socketRef.current = s;

    s.connect();

    // join AFTER connect
    s.on("connect", () => {
      s.emit("joinRoom", { roomId: room });
    });

    s.on("connect_error", (err) => {
      console.error("Socket auth error:", err.message);
    });

    s.on("reconnect", () => {
      s.emit("joinRoom", { roomId: room });
    });

    // load history (fresh per user)
    axios
      .get(`${API_BASE}/api/messages/dm/${otherId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then((res) => {
        const filtered = (res.data || []).filter(
          (m) => m.room === room
        );
        setMessages(filtered);
      })
      .catch(() => setMessages([]));

    // listeners
    s.on("message", (m) => {
      if (m.room === room) {
        setMessages((prev) => {
          if (prev.some((x) => x._id === m._id)) return prev;
          return [...prev, m];
        });
      }
    });

    s.on("messageEdited", (m) => {
      if (m.room === room) {
        setMessages((prev) =>
          prev.map((x) => (x._id === m._id ? m : x))
        );
      }
    });

    s.on("messageReacted", (m) => {
      if (m.room === room) {
        setMessages((prev) =>
          prev.map((x) => (x._id === m._id ? m : x))
        );
      }
    });

    s.on("typing", ({ user, isTyping, roomId }) => {
      if (roomId === room && user !== myId) {
        setTyping(isTyping);
      }
    });

    return () => {
      try {
        s.emit("leaveRoom", { roomId: room });
      } catch {}
      try {
        s.disconnect();
      } catch {}
    };
  }, [otherUser?._id, token]);

  // auto scroll
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // typing indicator
  const sendTyping = (isTyping) => {
    const s = socketRef.current;
    if (!s || !s.connected) return;

    const room = dmRoom(String(me._id), String(otherUser._id));
    if (!room) return;

    s.emit("typing", {
      roomId: room,
      user: String(me._id),
      isTyping,
    });
  };

  const onTextChange = (e) => {
    setText(e.target.value);
    sendTyping(true);

    if (typingTimeout.current) clearTimeout(typingTimeout.current);

    typingTimeout.current = setTimeout(() => {
      sendTyping(false);
      typingTimeout.current = null;
    }, 900);
  };

  // SEND MESSAGE
  const send = async (maybeEmoji) => {
    const bodyText = maybeEmoji ? maybeEmoji : text;
    if (!bodyText || !bodyText.trim()) return;

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
    } catch (e) {
      console.error("SEND ERROR:", e);
    }
  };

  const editMessage = async (msgId, newText) => {
    try {
      await axios.put(
        `${API_BASE}/api/messages/edit/${msgId}`,
        { text: newText },
        { headers: { Authorization: `Bearer ${token}` } }
      );
    } catch (e) {
      console.error(e);
    }
  };

  const reactToMessage = async (msgId, emoji) => {
    try {
      await axios.post(
        `${API_BASE}/api/messages/react/${msgId}`,
        { emoji },
        { headers: { Authorization: `Bearer ${token}` } }
      );
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="app-shell chatroom-container" style={{ maxWidth: 900 }}>
      <div className="chatroom-shell" style={{ gridTemplateColumns: "1fr" }}>
        <div className="right">
          <h3>
            Chat with {otherUser.name || otherUser.email}
          </h3>

          <div className="chat-window">
            {messages.map((m) => (
              <div
                key={m._id || m.createdAt}
                className={`msg ${
                  m.from && m.from._id === me._id ? "me" : ""
                }`}
              >
                <div style={{ fontSize: 12, opacity: 0.8 }}>
                  {m.from?.name} {m.edited ? "(edited)" : ""}
                </div>

                <div>{m.text}</div>

                <div style={{ fontSize: 12, opacity: 0.7 }}>
                  {m.reactions?.map((r, i) => (
                    <span key={i} style={{ marginRight: 6 }}>
                      {r.emoji}
                    </span>
                  ))}

                  <button onClick={() => reactToMessage(m._id, "👍")}>
                    👍
                  </button>

                  {m.from?._id === me._id && (
                    <button
                      onClick={() => {
                        const newText = prompt("Edit message", m.text);
                        if (newText !== null)
                          editMessage(m._id, newText);
                      }}
                    >
                      Edit
                    </button>
                  )}
                </div>
              </div>
            ))}
            <div ref={endRef} />
          </div>

          <div style={{ minHeight: 20, marginTop: 6 }}>
            {typing && <small>Typing...</small>}
          </div>

          <div className="input-row">
            <input
              value={text}
              onChange={onTextChange}
              placeholder="Type a message..."
            />

            <button disabled={!text.trim()} onClick={() => send()}>
              Send
            </button>

            <button onClick={onClose} style={{ marginLeft: 8 }}>
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}