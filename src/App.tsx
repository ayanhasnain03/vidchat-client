import React, { useEffect, useRef, useState } from "react";
import io from "socket.io-client";

// Custom Hook for Socket Connections
const useSocket = (url: string) => {
  const socketRef = useRef<any>(null);

  useEffect(() => {
    socketRef.current = io(url, { transports: ["websocket", "polling"] }); // Use both WebSocket and polling
    return () => {
      socketRef.current.disconnect();
    };
  }, [url]);

  return socketRef.current;
};

// Custom Hook for Media Stream
const useMedia = () => {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const getLocalMedia = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      setLocalStream(stream);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (error) {
      console.error("Error accessing media devices.", error);
    }
  };

  useEffect(() => {
    getLocalMedia();
  }, []);

  return { localStream, videoRef };
};

// Chat Component
const Chat: React.FC<{
  messages: string[];
  sendMessage: (msg: string) => void;
  message: string;
  setMessage: React.Dispatch<React.SetStateAction<string>>;
}> = ({ messages, sendMessage, message, setMessage }) => {
  return (
    <div className="bg-white border rounded shadow-md p-4 w-full sm:w-1/3 mb-4">
      <h2 className="text-lg font-semibold">Chat</h2>
      <div className="overflow-y-auto h-40 border-b mb-2">
        {messages.map((msg, index) => (
          <p key={index} className="py-1 text-sm text-gray-700">
            {msg}
          </p>
        ))}
      </div>
      <div className="flex">
        <input
          type="text"
          placeholder="Type a message..."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="border p-2 rounded mr-2 flex-grow"
        />
        <button
          onClick={() => {
            sendMessage(message);
            setMessage(""); // Clear the input field after sending
          }}
          className="bg-blue-500 text-white p-2 rounded hover:bg-blue-600 transition"
        >
          Send
        </button>
      </div>
    </div>
  );
};

// Video Component
const Video: React.FC<{
  videoRef: React.RefObject<HTMLVideoElement>;
  title: string;
  muted?: boolean;
}> = ({ videoRef, title, muted }) => (
  <div className="flex flex-col items-center">
    <h2 className="text-lg font-semibold">{title}</h2>
    <video
      ref={videoRef}
      autoPlay
      muted={muted}
      className="border rounded-lg shadow-md"
      style={{ width: "320px", height: "240px" }}
    />
  </div>
);

// Main App Component
const App: React.FC = () => {
  const [roomId, setRoomId] = useState<string>("");
  const [userId, setUserId] = useState<string>("");
  const [message, setMessage] = useState<string>("");
  const [messages, setMessages] = useState<string[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);

  const socket = useSocket(
    (import.meta.env.VITE_REACT_SERVER_URL as string) ||
      "https://vidchat-backend.onrender.com"
  );
  const { localStream, videoRef } = useMedia();

  useEffect(() => {
    if (!socket) return;

    // Socket event listeners
    socket.on("user-connected", (userId: string) => {
      console.log(`User connected: ${userId}`);
      if (localStream) {
        createOffer();
      }
    });

    socket.on("offer", handleOffer);
    socket.on("answer", (answer: RTCSessionDescriptionInit) => {
      peerConnectionRef.current?.setRemoteDescription(
        new RTCSessionDescription(answer)
      );
    });
    socket.on("ice-candidate", (candidate: RTCIceCandidateInit) => {
      peerConnectionRef.current?.addIceCandidate(
        new RTCIceCandidate(candidate)
      );
    });
    socket.on("receive-message", (msg: string) => {
      setMessages((prev) => [...prev, msg]);
    });

    return () => {
      peerConnectionRef.current?.close();
    };
  }, [socket, localStream]);

  const joinRoom = async () => {
    if (!roomId || !userId) {
      alert("Please enter a room ID and your name.");
      return;
    }
    setLoading(true);
    setError(""); // Reset error
    socket.emit("join-room", roomId, userId);

    if (localStream) {
      initializePeerConnection();
    } else {
      setError(
        "Failed to access media devices. Please ensure permissions are granted."
      );
      setLoading(false);
    }
  };

  const initializePeerConnection = () => {
    peerConnectionRef.current = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });

    peerConnectionRef.current.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit("ice-candidate", event.candidate);
      }
    };

    peerConnectionRef.current.ontrack = (event) => {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = event.streams[0];
        setLoading(false);
      }
    };

    localStream?.getTracks().forEach((track) => {
      peerConnectionRef.current?.addTrack(track, localStream);
    });
  };

  const createOffer = async () => {
    if (peerConnectionRef.current) {
      const offer = await peerConnectionRef.current.createOffer();
      await peerConnectionRef.current.setLocalDescription(offer);
      socket.emit("offer", offer);
    }
  };

  const handleOffer = async (offer: RTCSessionDescriptionInit) => {
    if (peerConnectionRef.current) {
      await peerConnectionRef.current.setRemoteDescription(
        new RTCSessionDescription(offer)
      );
      const answer = await peerConnectionRef.current.createAnswer();
      await peerConnectionRef.current.setLocalDescription(answer);
      socket.emit("answer", answer);
    }
  };

  const sendMessage = (msg: string) => {
    if (msg) {
      socket.emit("send-message", msg);
      setMessages((prev) => [...prev, `Me: ${msg}`]);
    }
  };

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">Video Call App</h1>
      {error && <p className="text-red-500">{error}</p>}
      <div className="mb-4">
        <input
          type="text"
          placeholder="Room ID"
          value={roomId}
          onChange={(e) => setRoomId(e.target.value)}
          className="border p-2 rounded mr-2"
        />
        <input
          type="text"
          placeholder="Your Name"
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          className="border p-2 rounded mr-2"
        />
        <button
          onClick={joinRoom}
          disabled={loading}
          className={`p-2 rounded ${
            loading ? "bg-gray-400" : "bg-blue-500 text-white"
          }`}
        >
          {loading ? "Joining..." : "Join Room"}
        </button>
      </div>
      <div className="flex">
        <Video videoRef={videoRef} title="Your Video" muted />
        <Video videoRef={remoteVideoRef} title="Remote Video" />
      </div>
      <Chat
        messages={messages}
        sendMessage={sendMessage}
        message={message}
        setMessage={setMessage}
      />
    </div>
  );
};

export default App;
