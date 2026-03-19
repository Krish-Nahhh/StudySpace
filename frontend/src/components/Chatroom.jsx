import React, { useEffect, useRef, useState } from "react";
import axios from "axios";
import PrivateChat from "./PrivateChat";
import { createSocket } from "../socket";
import "./Chatroom.css";

const API_BASE = "https://studyspace-q5gn.onrender.com";

export default function Chatroom() {
  const [groups, setGroups] = useState([]);
  const [users, setUsers] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [dmUser, setDmUser] = useState(null);
  const [sessionMessages, setSessionMessages] = useState([]);
  const [sessionText, setSessionText] = useState("");
  const [typingUsers, setTypingUsers] = useState({});
  const [showEmojiMenuFor, setShowEmojiMenuFor] = useState(null);

  const socketRef = useRef(null);
  const selectedGroupRef = useRef(null);
  const typingTimeouts = useRef({});

  const rawMe = JSON.parse(localStorage.getItem("user") || "{}");
  const token = localStorage.getItem("token");

  // BUG FIX 1: normalise the user ID once. localStorage may store it as
  // `_id` or `id` depending on which code path last wrote it.
  const myId = String(rawMe._id || rawMe.id || "");
  const myEmail = rawMe.email || "";

  const EMOJIS = ["👍", "❤️", "😂", "🎉", "🔥", "😮", "😢", "🙏"];

  useEffect(() => {
    axios
      .get(`${API_BASE}/api/sessions`)
      .then((r) => setGroups(r.data || []))
      .catch(() => setGroups([]));

    axios
      .get(`${API_BASE}/api/user`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then((r) => setUsers(r.data || []))
      .catch(() => setUsers([]));

    const s = createSocket(token);
    socketRef.current = s;
    s.connect();

    if (myEmail) s.emit("register", { email: myEmail });

    s.on("message", (m) => {
      const sel = selectedGroupRef.current;
      if (sel && m.room === `session:${sel._id}`) {
        setSessionMessages((prev) => {
          // deduplicate — socket and HTTP response can both deliver the message
          if (prev.some((x) => x._id === m._id)) return prev;
          return [...prev, m];
        });
      }
    });

    s.on("messageEdited", (m) => {
      const sel = selectedGroupRef.current;
      if (sel && m.room === `session:${sel._id}`) {
        setSessionMessages((prev) =>
          prev.map((x) => (x._id === m._id ? m : x))
        );
      }
    });

    s.on("messageReacted", (m) => {
      const sel = selectedGroupRef.current;
      if (sel && m.room === `session:${sel._id}`) {
        setSessionMessages((prev) =>
          prev.map((x) => (x._id === m._id ? m : x))
        );
      }
    });

    s.on("typing", ({ user, isTyping, roomId }) => {
      setTypingUsers((prev) => {
        const copy = { ...prev };
        copy[roomId] = { ...(copy[roomId] || {}) };
        if (isTyping) copy[roomId][user] = true;
        else delete copy[roomId][user];
        return copy;
      });
    });

    return () => {
      try { s.disconnect(); } catch {}
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const s = socketRef.current;
    selectedGroupRef.current = selectedGroup;

    if (!selectedGroup) {
      setSessionMessages([]);
      return;
    }

    axios
      .get(`${API_BASE}/api/messages/session/${selectedGroup._id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then((res) => setSessionMessages(res.data || []))
      .catch(() => setSessionMessages([]));

    const room = `session:${selectedGroup._id}`;
    if (s?.connected) s.emit("joinRoom", { roomId: room });

    return () => {
      if (s?.connected) s.emit("leaveRoom", { roomId: room });
      setSessionMessages([]);
      selectedGroupRef.current = null;
    };
  }, [selectedGroup]); // eslint-disable-line react-hooks/exhaustive-deps

  const sendTyping = (roomId, isTyping) => {
    const s = socketRef.current;
    if (!s?.connected) return;
    // use normalised myId so the typing filter on the receiver side matches
    s.emit("typing", { roomId, user: myEmail || myId, isTyping });
  };

  const onSessionTextChange = (e) => {
    setSessionText(e.target.value);
    if (!selectedGroup) return;
    const room = `session:${selectedGroup._id}`;
    sendTyping(room, true);
    if (typingTimeouts.current[room]) clearTimeout(typingTimeouts.current[room]);
    typingTimeouts.current[room] = setTimeout(() => {
      sendTyping(room, false);
      delete typingTimeouts.current[room];
    }, 900);
  };

  const sendSessionMsg = async (maybeEmoji) => {
    if (!sessionText?.trim() && !maybeEmoji) return;
    if (!selectedGroup) return;
    const bodyText = maybeEmoji ?? sessionText;
    try {
      await axios.post(
        `${API_BASE}/api/messages/session/${selectedGroup._id}`,
        { text: bodyText },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setSessionText("");
      sendTyping(`session:${selectedGroup._id}`, false);
    } catch (e) {
      console.error(e);
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
    } finally {
      setShowEmojiMenuFor(null);
    }
  };

  const getDisplayNameForEmail = (email) => {
    const u = users.find((x) => x.email === email);
    return u ? u.name || u.email : email;
  };

  // BUG FIX 2: the old version compared `m.from._id` against `me._id` which
  // could be undefined, making `isMsgFromMe` always return false and sending
  // the wrong CSS class to every session message. Now uses `myId` and `myEmail`
  // both of which are safely normalised above.
  const isMsgFromMe = (m) => {
    if (!m?.from) return false;
    const fromId = String(m.from._id || m.from);
    const fromEmail = m.from.email;
    if (fromId && myId) return fromId === myId;
    if (fromEmail && myEmail) return fromEmail === myEmail;
    return false;
  };

  const typingTextForRoom = (room) => {
    const m = typingUsers[room];
    if (!m) return null;
    const keys = Object.keys(m).filter((e) => e && e !== myEmail && e !== myId);
    if (!keys.length) return null;
    const names = keys.map((k) => getDisplayNameForEmail(k));
    return names.length === 1
      ? `${names[0]} is typing...`
      : "Multiple people are typing...";
  };

  return (
    <div className="app-shell chatroom-container">
      <div className="chatroom-shell">
        <div className="left">
          <h3>Sessions</h3>
          {groups.map((g) => (
            <div
              key={g._id}
              className="group"
              onClick={() => {
                setDmUser(null);        // close any open DM when switching to session
                setSelectedGroup(g);
              }}
            >
              {g.title || g.name || g._id}
            </div>
          ))}

          <hr style={{ opacity: 0.1 }} />

          <h3>Users</h3>
          {users
            .filter((u) => u.email !== myEmail)
            .map((u) => (
              <div
                key={u._id}
                className="group"
                onClick={() => {
                  setSelectedGroup(null);   // close any open session when opening DM
                  setDmUser(u);
                }}
              >
                {u.name || u.email}
              </div>
            ))}
        </div>

        <div className="right">
          {dmUser ? (
            <PrivateChat otherUser={dmUser} onClose={() => setDmUser(null)} />
          ) : selectedGroup ? (
            <>
              <h3>{selectedGroup.title || selectedGroup.name}</h3>

              <div className="chat-window">
                {sessionMessages.map((m) => {
                  const amI = isMsgFromMe(m);
                  return (
                    <div
                      key={m._id || m.createdAt}
                      className={`msg ${amI ? "me" : ""}`}
                    >
                      <div style={{ fontSize: 12, opacity: 0.8 }}>
                        {m.from?.name || m.from?.email}{" "}
                        {m.edited ? "(edited)" : ""}
                      </div>

                      <div>{m.text}</div>

                      {m.attachments?.map((a, i) => (
                        <div key={i}>
                          {a.mime?.startsWith("image/") ? (
                            <img
                              src={a.url}
                              alt={a.name}
                              style={{ maxWidth: 200 }}
                            />
                          ) : (
                            <a href={a.url} target="_blank" rel="noreferrer">
                              {a.name || "attachment"}
                            </a>
                          )}
                        </div>
                      ))}

                      <div style={{ fontSize: 12, opacity: 0.7 }}>
                        {m.reactions?.map((r, idx) => (
                          <span key={idx} style={{ marginRight: 6 }}>
                            {r.emoji}
                          </span>
                        ))}

                        <button onClick={() => reactToMessage(m._id, "👍")}>
                          👍
                        </button>

                        <button onClick={() => setShowEmojiMenuFor(m._id)}>
                          😀
                        </button>

                        {amI && (
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

                        {showEmojiMenuFor === m._id && (
                          <div style={{ display: "inline-block", marginLeft: 8 }}>
                            {EMOJIS.map((e) => (
                              <button
                                key={e}
                                onClick={() => reactToMessage(m._id, e)}
                                style={{ marginRight: 6 }}
                              >
                                {e}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div style={{ minHeight: 22, fontSize: 13, opacity: 0.85 }}>
                {typingTextForRoom(`session:${selectedGroup._id}`)}
              </div>

              <div className="input-row" style={{ marginTop: 8 }}>
                <input
                  value={sessionText}
                  onChange={onSessionTextChange}
                  placeholder="Type a message..."
                  style={{ flex: 1 }}
                />
                <button onClick={() => sendSessionMsg()}>Send</button>

                <div style={{ position: "relative" }}>
                  <button onClick={() => setShowEmojiMenuFor("send")}>😀</button>
                  {showEmojiMenuFor === "send" && (
                    <div
                      style={{
                        position: "absolute",
                        right: 0,
                        top: "40px",
                        background: "#fff",
                        padding: 8,
                        borderRadius: 8,
                      }}
                    >
                      {EMOJIS.map((e) => (
                        <button
                          key={e}
                          onClick={() => {
                            sendSessionMsg(e);
                            setShowEmojiMenuFor(null);
                          }}
                          style={{ marginRight: 6 }}
                        >
                          {e}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div>
              <h3>Select a session or user to start chatting</h3>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}