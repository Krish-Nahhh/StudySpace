import { io } from "socket.io-client";

const SOCKET_URL =
  process.env.REACT_APP_SOCKET_URL ||
  "https://studyspace-q5gn.onrender.com";

export function createSocket(token) {
  return io(SOCKET_URL, {
    auth: { token },
    autoConnect: false,
    transports: ["websocket"],
    reconnection: true,
    reconnectionAttempts: 5,
  });
}