require('dotenv').config();
const express = require('express');
const http = require('http');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const socketio = require('socket.io');
const jwt = require('jsonwebtoken');

// IMPORT ROUTES
const authRoutes = require('./routes/authRoutes');
const sessionRoutes = require('./routes/sessionRoutes');
const messageRoutes = require('./routes/messageRoutes');
const resourceRoutes = require('./routes/resourceRoutes');
const settingsRoutes = require("./routes/settingsRoutes");
const pomodoroRoutes = require("./routes/pomodoroRoutes");
const userRoutes = require("./routes/userRoutes");

const app = express();
const server = http.createServer(app);
const io = socketio(server, { cors: { origin: "*" } });

app.use(cors());
app.use(express.json({ limit: "15mb" }));

app.get("/", (req, res) => {
  res.send("StudySpace backend running");
});

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.set("io", io);

app.use('/api/auth', authRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/resources', resourceRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/pomodoro', pomodoroRoutes);
app.use('/api/user', userRoutes);

// 🔐 SOCKET AUTH MIDDLEWARE
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error("Unauthorized"));

  try {
    const secret = process.env.JWT_SECRET || "supersecret";
    const decoded = jwt.verify(token, secret);
    socket.user = decoded; // { id, email, name }
    next();
  } catch (err) {
    return next(new Error("Invalid token"));
  }
});

// Helper: check if the authenticated socket user is a party in a DM room.
// roomId format: "dm:<sortedId1>:<sortedId2>"
function canAccessDmRoom(socket, roomId) {
  if (!roomId.startsWith('dm:')) return true; // not a DM room, allow
  const parts = roomId.split(':');
  if (parts.length !== 3) return false;
  const currentUserId = String(socket.user?.id || "");
  return currentUserId === parts[1] || currentUserId === parts[2];
}

// SOCKET.IO
io.on('connection', (socket) => {
  // BUG FIX: guard against auth middleware not having set socket.user
  if (!socket.user?.id) {
    console.warn("Socket connected without valid user, disconnecting:", socket.id);
    socket.disconnect(true);
    return;
  }

  console.log("Socket connected:", socket.id, "user:", socket.user.email);

  // Auto-join personal room for targeted notifications
  socket.join(`user:${socket.user.id}`);

  socket.on('joinRoom', ({ roomId }) => {
    if (!roomId) return;

    if (!canAccessDmRoom(socket, roomId)) {
      console.warn(`Unauthorized joinRoom attempt: room=${roomId} user=${socket.user.id}`);
      return;
    }

    socket.join(roomId);
  });

  socket.on('leaveRoom', ({ roomId }) => {
    if (roomId) socket.leave(roomId);
  });

  socket.on("typing", ({ roomId, user, isTyping }) => {
    if (!roomId) return;

    if (!canAccessDmRoom(socket, roomId)) {
      console.warn(`Unauthorized typing attempt: room=${roomId} user=${socket.user.id}`);
      return;
    }

    // Emit to everyone in the room EXCEPT the sender
    socket.to(roomId).emit("typing", { user, isTyping, roomId });
  });

  socket.on("editMessage", (msg) => {
    if (!msg?.room) return;

    if (!canAccessDmRoom(socket, msg.room)) {
      console.warn(`Unauthorized editMessage attempt: room=${msg.room} user=${socket.user.id}`);
      return;
    }

    io.to(msg.room).emit("messageEdited", msg);
  });

  socket.on("reactMessage", (msg) => {
    if (!msg?.room) return;

    if (!canAccessDmRoom(socket, msg.room)) {
      console.warn(`Unauthorized reactMessage attempt: room=${msg.room} user=${socket.user.id}`);
      return;
    }

    io.to(msg.room).emit("messageReacted", msg);
  });

  socket.on('disconnect', () => {
    console.log("Socket disconnected:", socket.id);
  });
});

// SERVER
const PORT = process.env.PORT || 5000;
const MONGO = process.env.MONGO_URI;

mongoose.connect(MONGO, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
  .then(() => {
    console.log("MongoDB connected");
    server.listen(PORT, () => console.log(`Server listening on ${PORT}`));
  })
  .catch(err => console.error("Mongo error", err));