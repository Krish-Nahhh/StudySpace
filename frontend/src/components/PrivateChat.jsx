import React, { useEffect, useRef, useState } from "react";
import axios from "axios";
import { createSocket } from "../socket";
import "./Chatroom.css";

const API_BASE =
  process.env.REACT_APP_API_BASE ||
  "https://studyspace-q5gn.onrender.com";

// STRICT room function (ONLY _id)
function dmRoom(a, b) {
  const [x, y] = [a.toString(), b.toString()].sort();
  return `dm:${x}:${y}`;
}

export default function PrivateChat({ otherUser, onClose }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [typing, setTyping] = useState(false);
  const [showEmojiMenu, setShowEmojiMenu] = useState(false);

  const socketRef = useRef(null);
  const typingTimeout = useRef(null);

  const me = JSON.parse(localStorage.getItem("user") || "{}");
  const token = localStorage.getItem("token");

  const EMOJIS = ["👍", "❤️", "😂", "🎉", "🔥", "😮", "😢", "🙏"];

  useEffect(() => {
    if (!me?._id || !otherUser?._id) return;

    const s = createSocket(token);
    socketRef.current = s;

    const room = dmRoom(me._id, otherUser._id);

    // DEBUG
    s.on("connect", () => {
      console.log("✅ SOCKET CONNECTED:", s.id);
    });

    s.on("connect_error", (err) => {
      console.error("❌ SOCKET ERROR:", err);
    });

    s.connect();

    // join room
    s.emit("joinRoom", { roomId: room });

    // load history
    axios
      .get(`${API_BASE}/api/messages/dm/${otherUser._id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then((res) => setMessages(res.data || []))
      .catch(() => setMessages([]));

    // listeners
    s.on("message", (m) => {
      if (m.room === room) {
        setMessages((prev) => [...prev, m]);
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
      if (roomId === room && user !== me._id) {
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
  }, [otherUser._id]);

  // typing indicator
  const sendTyping = (isTyping) => {
    const s = socketRef.current;
    if (!s || !s.connected) return;

    const room = dmRoom(me._id, otherUser._id);

    s.emit("typing", {
      roomId: room,
      user: me._id,
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

      // ✅ fallback UI update (IMPORTANT)
      setMessages((prev) => [...prev, res.data]);

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
                  m.from &&
                  m.from._id === me._id
                    ? "me"
                    : ""
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
                        const newText = prompt(
                          "Edit message",
                          m.text
                        );
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

            <button onClick={() => send()}>Send</button>

            <button onClick={onClose} style={{ marginLeft: 8 }}>
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}