import React, { useEffect, useState } from 'react';
import axios from 'axios';
import './Sessions.css';

const API = process.env.REACT_APP_API || 'https://studyspace-q5gn.onrender.com';

export default function Sessions() {
  const [sessions, setSessions] = useState([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [link, setLink] = useState('');

  useEffect(() => {
    axios
      .get(`${API}/api/sessions`)
      .then(r => setSessions(r.data || []))
      .catch(err => {
        console.error("SESSIONS GET ERROR:", err);
        setSessions([]);
      });
  }, []); // FIX: was [API] — API is a module-level constant so this caused
          // a React warning and an unnecessary re-fetch on every render.

  async function create() {
    const token = localStorage.getItem('token');
    if (!token) return alert('Login required');
    if (!title.trim()) return alert('Add title');

    try {
      const res = await axios.post(
        `${API}/api/sessions`,
        { title, description, link },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setSessions(prev => [res.data, ...prev]);
      setTitle('');
      setDescription('');
      setLink('');
    } catch (e) {
      console.error("SESSION CREATE ERROR:", e);
      alert('Create failed');
    }
  }

  return (
    <div className="sessions-shell app-shell">
      <div className="sessions-create card">
        <h3>Create Session</h3>
        <input placeholder="Title" value={title} onChange={e => setTitle(e.target.value)} />
        <input placeholder="Link (optional)" value={link} onChange={e => setLink(e.target.value)} />
        <textarea placeholder="Description" value={description} onChange={e => setDescription(e.target.value)} />
        <button className="btn" onClick={create}>Create</button>
      </div>

      <div className="sessions-list">
        {sessions.map(s => (
          <div key={s._id} className="session-card card">
            <div>
              <h4>{s.title}</h4>
              <p>{s.description}</p>
            </div>
            <div>
              {s.link ? (
                <a className="btn" href={s.link} target="_blank" rel="noreferrer">Join</a>
              ) : null}
              <a className="btn" href={`/sessions/${s._id}`} style={{ marginLeft: 8 }}>Details</a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}