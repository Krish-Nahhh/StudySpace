// models/Pomodoro.js
const mongoose = require("mongoose");
                                                  //defines structure for mongodb 
const PomodoroSchema = new mongoose.Schema({
  user: { type: String, required: true },
  totalSessions: { type: Number, default: 0 },
  totalStudyTime: { type: Number, default: 0 }, 
  tasksDone: { type: Number, default: 0 },
  todos: [{ text: String, done: Boolean }],
  notes: { type: String, default: "" },
}, { timestamps: true });

module.exports = mongoose.model("Pomodoro", PomodoroSchema);      //exports it as mongoose model

