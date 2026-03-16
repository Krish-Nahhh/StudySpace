const express = require("express");
const router = express.Router();
const Pomodoro = require("../models/temp");

router.get("/:user", async (req, res) => {
  try {
    const data = await Pomodoro.findOne({ user: req.params.user });     //looks for pomodoro w tht username

    if (!data) return res.json({                                //if there is no prev saved data
      user: req.params.user,
      totalSessions: 0,
      totalStudyTime: 0,
      tasksDone: 0,
      todos: [],
      notes: ""
    });

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/update", async (req, res) => {
  try {
    const { user, totalSessions, totalStudyTime, tasksDone, todos, notes } = req.body;

    const updated = await Pomodoro.findOneAndUpdate(                          //update existing record
      { user },
      { totalSessions, totalStudyTime, tasksDone, todos, notes },
      { upsert: true, new: true }                                               //if record doesnt exist, create new
    );

    res.json(updated);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
