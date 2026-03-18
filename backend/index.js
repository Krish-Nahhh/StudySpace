require('dotenv').config();
const express = require('express');
const http = require('http');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const socketio = require('socket.io');

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
app.use("/api/resources", resourceRoutes);


// make socket available in routes
app.set("io", io);

//route mounts
app.use('/api/auth', authRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/resources', resourceRoutes);
app.use('/api/settings', settingsRoutes);    
app.use('/api/pomodoro', pomodoroRoutes);    
app.use('/api/user', userRoutes);

// Socket.IO
io.on('connection', (socket) => {
  console.log("Socket connected:", socket.id);

  socket.on('joinRoom', ({ roomId }) => roomId && socket.join(roomId));
  socket.on('leaveRoom', ({ roomId }) => roomId && socket.leave(roomId));

  socket.on("typing", ({ roomId, user, isTyping }) => {
    if (roomId) socket.to(roomId).emit("typing", { user, isTyping });
  });

  socket.on("editMessage", (msg) => msg.room && io.to(msg.room).emit("messageEdited", msg));
  socket.on("reactMessage", (msg) => msg.room && io.to(msg.room).emit("messageReacted", msg));

  socket.on('disconnect', () => {
    console.log("Socket disconnected:", socket.id);
  });
});

// SERVER
const PORT = process.env.PORT || 5000; // FINAL BACKEND PORT
const MONGO = process.env.MONGO_URI ;

mongoose.connect(MONGO)
  .then(() => {
    console.log("MongoDB connected");
    server.listen(PORT, () => console.log(`Server listening on ${PORT}`));
  })
  .catch(err => console.error("Mongo error", err));
