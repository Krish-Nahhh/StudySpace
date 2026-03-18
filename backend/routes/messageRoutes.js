const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const Message = require("../models/Message");
const mongoose = require("mongoose");

// ✅ SAFE DM room (force string IDs)
function dmRoom(a, b) {
  if (!a || !b) return null;
  const [x, y] = [String(a), String(b)].sort();
  return `dm:${x}:${y}`;
}

// helper to populate message cleanly
async function populateMessage(msgId) {
  return await Message.findById(msgId).populate("from", "name email");
}

/* =========================
   GET DM HISTORY
========================= */
router.get("/dm/:otherId", auth, async (req, res) => {
  const me = String(req.user.id);
  const other = String(req.params.otherId);

  if (!mongoose.Types.ObjectId.isValid(other)) {
    return res.status(400).json({ message: "Invalid user" });
  }

  const room = dmRoom(me, other);
  if (!room) {
    return res.status(400).json({ message: "Invalid room" });
  }

  try {
    const msgs = await Message.find({ room })
      .sort({ createdAt: 1 })
      .populate("from", "name email");

    res.json(msgs);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "err" });
  }
});

/* =========================
   POST DM MESSAGE
========================= */
router.post("/dm/:otherId", auth, async (req, res) => {
  const me = String(req.user.id);
  const other = String(req.params.otherId);
  const { text = "", attachments = [] } = req.body;

  if (!mongoose.Types.ObjectId.isValid(other)) {
    return res.status(400).json({ message: "Invalid user" });
  }

  if (!text.trim() && attachments.length === 0) {
    return res.status(400).json({ message: "Empty message" });
  }

  const room = dmRoom(me, other);
  if (!room) {
    return res.status(400).json({ message: "Invalid room" });
  }

  try {
    const message = await Message.create({
      type: "dm",
      room,
      from: me,
      toUser: other,
      text,
      attachments,
    });

    const full = await populateMessage(message._id);

    const io = req.app.get("io");
    if (io) {
      io.to(room).emit("message", full);
    }

    res.json(full);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "err" });
  }
});

/* =========================
   GET SESSION MESSAGES
========================= */
router.get("/session/:sessionId", auth, async (req, res) => {
  const sessionId = req.params.sessionId;

  try {
    const msgs = await Message.find({
      room: `session:${sessionId}`,
    })
      .sort({ createdAt: 1 })
      .populate("from", "name email");

    res.json(msgs);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "err" });
  }
});

/* =========================
   POST SESSION MESSAGE
========================= */
router.post("/session/:sessionId", auth, async (req, res) => {
  const sessionId = req.params.sessionId;
  const { text = "", attachments = [] } = req.body;

  if (!text.trim() && attachments.length === 0) {
    return res.status(400).json({ message: "Empty message" });
  }

  const room = `session:${sessionId}`;

  try {
    const message = await Message.create({
      type: "session",
      room,
      from: String(req.user.id),
      session: sessionId,
      text,
      attachments,
    });

    const full = await populateMessage(message._id);

    const io = req.app.get("io");
    if (io) {
      io.to(room).emit("message", full);
    }

    res.json(full);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "err" });
  }
});

/* =========================
   EDIT MESSAGE
========================= */
router.put("/edit/:msgId", auth, async (req, res) => {
  const msgId = req.params.msgId;
  const { text } = req.body;

  if (!mongoose.Types.ObjectId.isValid(msgId)) {
    return res.status(400).json({ message: "Invalid message ID" });
  }

  try {
    const m = await Message.findById(msgId);
    if (!m) return res.status(404).json({ message: "Not found" });

    if (m.from.toString() !== String(req.user.id)) {
      return res.status(403).json({ message: "Forbidden" });
    }

    m.text = text;
    m.edited = true;
    await m.save();

    const full = await populateMessage(m._id);

    const io = req.app.get("io");
    if (io) {
      io.to(m.room).emit("messageEdited", full);
    }

    res.json(full);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "err" });
  }
});

/* =========================
   REACT TO MESSAGE
========================= */
router.post("/react/:msgId", auth, async (req, res) => {
  const msgId = req.params.msgId;
  const { emoji } = req.body;

  if (!mongoose.Types.ObjectId.isValid(msgId)) {
    return res.status(400).json({ message: "Invalid message ID" });
  }

  try {
    const m = await Message.findById(msgId);
    if (!m) return res.status(404).json({ message: "Not found" });

    m.reactions = m.reactions || [];

    const existingIndex = m.reactions.findIndex(
      (r) =>
        r.user.toString() === String(req.user.id) &&
        r.emoji === emoji
    );

    if (existingIndex >= 0) {
      m.reactions.splice(existingIndex, 1);
    } else {
      m.reactions.push({
        user: String(req.user.id),
        emoji,
      });
    }

    await m.save();

    const full = await populateMessage(m._id);

    const io = req.app.get("io");
    if (io) {
      io.to(m.room).emit("messageReacted", full);
    }

    res.json(full);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "err" });
  }
});

module.exports = router;