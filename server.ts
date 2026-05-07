import express from 'express';
import WebSocket, { WebSocketServer } from 'ws';
import { createServer } from 'http';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

// Types
interface LeaderboardEntry {
  name: string;
  wins: number;
  losses: number;
  totalGuesses: number;
  fastestWin: number | null;
}

interface GameRoom {
  roomId: string;
  status: 'waiting' | 'setup' | 'playing' | 'finished';
  hostId: string;
  guestId?: string;
  hostName: string;
  guestName?: string;
  currentPlayerId: string;
  lastGuess?: number | null;
  isAwaitingFeedback: boolean;
  p1GuessCount: number;
  p2GuessCount: number;
  p1Range: { min: number; max: number };
  p2Range: { min: number; max: number };
  winnerId?: string;
  hostSecret?: number;
  guestSecret?: number;
  history: HistoryItem[];
  leaderboard: { [playerId: string]: LeaderboardEntry };
}

interface HistoryItem {
  playerId: string;
  guess: number;
  feedback: 'higher' | 'lower' | 'correct';
  timestamp: number;
}

interface PlayerSession {
  playerId: string;
  roomId?: string;
  ws: WebSocket;
}

// In-memory storage
const rooms = new Map<string, GameRoom>();
const players = new Map<string, PlayerSession>();
let playerIdCounter = 1;

// Helper to generate unique player ID
function generatePlayerId(): string {
  return `player_${playerIdCounter++}_${Date.now()}`;
}

// Helper to generate room ID
function generateRoomId(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Helper to send message to client
function sendMessage(ws: WebSocket, type: string, payload: any) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type, ...payload }));
  }
}

// Broadcast room update to both players
function broadcastRoomUpdate(roomId: string) {
  const room = rooms.get(roomId);
  if (!room) return;

  const playersInRoom = Array.from(players.values()).filter(p => p.roomId === roomId);
  
  for (const player of playersInRoom) {
    const payload: any = {
      type: 'ROOM_UPDATE',
      roomId,
      status: room.status,
      hostId: room.hostId,
      guestId: room.guestId,
      hostName: room.hostName,
      guestName: room.guestName,
      currentPlayerId: room.currentPlayerId,
      lastGuess: room.lastGuess,
      isAwaitingFeedback: room.isAwaitingFeedback,
      p1GuessCount: room.p1GuessCount,
      p2GuessCount: room.p2GuessCount,
      p1Range: room.p1Range,
      p2Range: room.p2Range,
      winnerId: room.winnerId,
      history: room.history,
      leaderboard: room.leaderboard,
    };

    // Send personal secret during setup and playing phases
    if (room.status === 'setup' || room.status === 'playing') {
      if (player.playerId === room.hostId) {
        payload.mySecret = room.hostSecret ?? null;
      } else if (player.playerId === room.guestId) {
        payload.mySecret = room.guestSecret ?? null;
      }
    }
    
    // Reveal both secrets when game is finished
    if (room.status === 'finished') {
      payload.hostSecret = room.hostSecret ?? null;
      payload.guestSecret = room.guestSecret ?? null;
    }

    sendMessage(player.ws, 'ROOM_UPDATE', payload);
  }
}

// Message handlers
function handleCreate(ws: WebSocket, payload: any) {
  const { playerId, playerName } = payload;
  if (!playerId || !playerName) {
    sendMessage(ws, 'ERROR', { message: 'Missing playerId or playerName' });
    return;
  }

  const roomId = generateRoomId();
  const room: GameRoom = {
    roomId,
    status: 'waiting',
    hostId: playerId,
    hostName: playerName,
    currentPlayerId: playerId,
    isAwaitingFeedback: false,
    p1GuessCount: 0,
    p2GuessCount: 0,
    p1Range: { min: 0, max: 100 },
    p2Range: { min: 0, max: 100 },
    history: [],
    leaderboard: {
      [playerId]: {
        name: playerName,
        wins: 0,
        losses: 0,
        totalGuesses: 0,
        fastestWin: null,
      }
    }
  };

  rooms.set(roomId, room);
  const player = players.get(playerId);
  if (player) {
    player.roomId = roomId;
  }

  sendMessage(ws, 'ROOM_CREATED', { roomId });
  broadcastRoomUpdate(roomId);
}

function handleJoin(ws: WebSocket, payload: any) {
  const { playerId, playerName, roomId } = payload;
  if (!playerId || !playerName || !roomId) {
    sendMessage(ws, 'ERROR', { message: 'Missing playerId, playerName, or roomId' });
    return;
  }

  const room = rooms.get(roomId);
  if (!room) {
    sendMessage(ws, 'ERROR', { message: 'Room not found' });
    return;
  }

  if (room.guestId && room.guestId !== playerId) {
    sendMessage(ws, 'ERROR', { message: 'Room is full' });
    return;
  }

  if (!room.guestId) {
    room.guestId = playerId;
    room.guestName = playerName;
    room.status = 'setup';
    
    // Add guest to leaderboard if not already there
    if (!room.leaderboard[playerId]) {
      room.leaderboard[playerId] = {
        name: playerName,
        wins: 0,
        losses: 0,
        totalGuesses: 0,
        fastestWin: null,
      };
    }
  }

  const player = players.get(playerId);
  if (player) {
    player.roomId = roomId;
  }

  broadcastRoomUpdate(roomId);
}

function handleSetSecret(ws: WebSocket, payload: any) {
  const { playerId, roomId, secret } = payload;
  if (!playerId || !roomId || secret === undefined) {
    sendMessage(ws, 'ERROR', { message: 'Missing playerId, roomId, or secret' });
    return;
  }

  if (isNaN(secret) || secret < 0 || secret > 100) {
    sendMessage(ws, 'ERROR', { message: 'Secret must be between 0 and 100' });
    return;
  }

  const room = rooms.get(roomId);
  if (!room) {
    sendMessage(ws, 'ERROR', { message: 'Room not found' });
    return;
  }

  if (playerId === room.hostId) {
    room.hostSecret = secret;
  } else if (playerId === room.guestId) {
    room.guestSecret = secret;
  } else {
    sendMessage(ws, 'ERROR', { message: 'You are not in this room' });
    return;
  }

  // Check if both secrets are set
  if (room.hostSecret !== undefined && room.guestSecret !== undefined) {
    room.status = 'playing';
  }

  broadcastRoomUpdate(roomId);
}

function handleGuess(ws: WebSocket, payload: any) {
  const { playerId, roomId, guess } = payload;
  if (!playerId || !roomId || guess === undefined) {
    sendMessage(ws, 'ERROR', { message: 'Missing playerId, roomId, or guess' });
    return;
  }

  if (isNaN(guess) || guess < 0 || guess > 100) {
    sendMessage(ws, 'ERROR', { message: 'Guess must be between 0 and 100' });
    return;
  }

  const room = rooms.get(roomId);
  if (!room) {
    sendMessage(ws, 'ERROR', { message: 'Room not found' });
    return;
  }

  if (room.status !== 'playing') {
    sendMessage(ws, 'ERROR', { message: 'Game is not in playing state' });
    return;
  }

  if (room.currentPlayerId !== playerId) {
    sendMessage(ws, 'ERROR', { message: 'It is not your turn' });
    return;
  }

  if (room.isAwaitingFeedback) {
    sendMessage(ws, 'ERROR', { message: 'Awaiting feedback on previous guess' });
    return;
  }

  room.lastGuess = guess;
  room.isAwaitingFeedback = true;
  const isHost = playerId === room.hostId;
  if (isHost) {
    room.p1GuessCount++;
  } else {
    room.p2GuessCount++;
  }

  broadcastRoomUpdate(roomId);
}

function handleFeedback(ws: WebSocket, payload: any) {
  const { playerId, roomId, feedback } = payload;
  if (!playerId || !roomId || !feedback) {
    sendMessage(ws, 'ERROR', { message: 'Missing playerId, roomId, or feedback' });
    return;
  }

  if (!['higher', 'lower', 'correct'].includes(feedback)) {
    sendMessage(ws, 'ERROR', { message: 'Feedback must be higher, lower, or correct' });
    return;
  }

  const room = rooms.get(roomId);
  if (!room) {
    sendMessage(ws, 'ERROR', { message: 'Room not found' });
    return;
  }

  if (room.status !== 'playing') {
    sendMessage(ws, 'ERROR', { message: 'Game is not in playing state' });
    return;
  }

  if (room.currentPlayerId === playerId) {
    sendMessage(ws, 'ERROR', { message: 'You cannot provide feedback on your own guess' });
    return;
  }

  if (!room.isAwaitingFeedback) {
    sendMessage(ws, 'ERROR', { message: 'No guess awaiting feedback' });
    return;
  }

  // Server-side validation: verify feedback matches the actual secret
  const guessingPlayerId = room.currentPlayerId;
  const isGuessingHost = guessingPlayerId === room.hostId;
  const secret = isGuessingHost ? room.guestSecret : room.hostSecret;

  if (secret !== undefined && room.lastGuess !== undefined) {
    if (feedback === 'higher' && room.lastGuess >= secret) {
      sendMessage(ws, 'ERROR', { message: 'Invalid feedback: guess is not higher' });
      return;
    }
    if (feedback === 'lower' && room.lastGuess <= secret) {
      sendMessage(ws, 'ERROR', { message: 'Invalid feedback: guess is not lower' });
      return;
    }
    if (feedback === 'correct' && room.lastGuess !== secret) {
      sendMessage(ws, 'ERROR', { message: 'Invalid feedback: guess is not correct' });
      return;
    }
  }

  // Add to history
  room.history.push({
    playerId: room.currentPlayerId,
    guess: room.lastGuess!,
    feedback,
    timestamp: Date.now(),
  });

  room.isAwaitingFeedback = false;

  if (feedback === 'correct') {
    room.status = 'finished';
    room.winnerId = room.currentPlayerId;
    
    // Update leaderboard
    const winner = room.winnerId;
    const loser = winner === room.hostId ? room.guestId : room.hostId;
    const winnerGuesses = winner === room.hostId ? room.p1GuessCount : room.p2GuessCount;
    
    if (room.leaderboard[winner]) {
      room.leaderboard[winner].wins++;
      room.leaderboard[winner].totalGuesses += winnerGuesses;
      if (room.leaderboard[winner].fastestWin === null || winnerGuesses < room.leaderboard[winner].fastestWin) {
        room.leaderboard[winner].fastestWin = winnerGuesses;
      }
    }
    
    if (loser && room.leaderboard[loser]) {
      room.leaderboard[loser].losses++;
    }
  } else {
    // Update range
    const guessingPlayerId = room.currentPlayerId;
    const isGuessingHost = guessingPlayerId === room.hostId;
    const range = isGuessingHost ? room.p1Range : room.p2Range;

    if (feedback === 'higher') {
      range.min = Math.max(range.min, room.lastGuess! + 1);
    } else {
      range.max = Math.min(range.max, room.lastGuess! - 1);
    }

    // Switch turns
    room.currentPlayerId = playerId;
  }

  broadcastRoomUpdate(roomId);
}

function handleReset(ws: WebSocket, payload: any) {
  const { playerId, roomId } = payload;
  if (!playerId || !roomId) {
    sendMessage(ws, 'ERROR', { message: 'Missing playerId or roomId' });
    return;
  }

  const room = rooms.get(roomId);
  if (!room) {
    sendMessage(ws, 'ERROR', { message: 'Room not found' });
    return;
  }

  if (playerId !== room.hostId && playerId !== room.guestId) {
    sendMessage(ws, 'ERROR', { message: 'You are not in this room' });
    return;
  }

  // Reset game
  room.status = 'setup';
  room.currentPlayerId = room.hostId;
  room.isAwaitingFeedback = false;
  room.p1GuessCount = 0;
  room.p2GuessCount = 0;
  room.p1Range = { min: 0, max: 100 };
  room.p2Range = { min: 0, max: 100 };
  room.lastGuess = null;
  room.hostSecret = undefined;
  room.guestSecret = undefined;
  room.winnerId = undefined;
  room.history = [];

  broadcastRoomUpdate(roomId);
}

function handleRejoin(ws: WebSocket, payload: any) {
  const { playerId, roomId } = payload;
  if (!playerId || !roomId) {
    sendMessage(ws, 'ERROR', { message: 'Missing playerId or roomId' });
    return;
  }

  const room = rooms.get(roomId);
  if (!room) {
    sendMessage(ws, 'ERROR', { message: 'Room not found' });
    return;
  }

  if (playerId !== room.hostId && playerId !== room.guestId) {
    sendMessage(ws, 'ERROR', { message: 'You are not in this room' });
    return;
  }

  // Update player's WebSocket connection
  const player = players.get(playerId);
  if (player) {
    player.ws = ws;
    player.roomId = roomId;
  }

  broadcastRoomUpdate(roomId);
}

// WebSocket connection handler
wss.on('connection', (ws: WebSocket) => {
  let playerSession: PlayerSession | null = null;

  ws.on('message', (data: string) => {
    try {
      const message = JSON.parse(data);
      const { type, ...payload } = message;

      // Handle initial connection
      if (type === 'CONNECT') {
        const { playerId, roomId } = payload;

        if (!playerSession) {
          let pid = playerId;
          if (!pid) {
            pid = generatePlayerId();
          }

          playerSession = { playerId: pid, ws, roomId };
          players.set(pid, playerSession);

          sendMessage(ws, 'CONNECTED', { playerId: pid });

          // If rejoining a room, send current state
          if (roomId) {
            const room = rooms.get(roomId);
            if (room && (room.hostId === pid || room.guestId === pid)) {
              broadcastRoomUpdate(roomId);
            }
          }
        }
        return;
      }

      // All other messages require a player session
      if (!playerSession) {
        sendMessage(ws, 'ERROR', { message: 'Not connected. Send CONNECT first.' });
        return;
      }

      // Route message to appropriate handler
      switch (type) {
        case 'CREATE':
          handleCreate(ws, { playerId: playerSession.playerId, ...payload });
          break;
        case 'JOIN':
          handleJoin(ws, { playerId: playerSession.playerId, ...payload });
          break;
        case 'SET_SECRET':
          handleSetSecret(ws, { playerId: playerSession.playerId, ...payload });
          break;
        case 'GUESS':
          handleGuess(ws, { playerId: playerSession.playerId, ...payload });
          break;
        case 'FEEDBACK':
          handleFeedback(ws, { playerId: playerSession.playerId, ...payload });
          break;
        case 'RESET':
          handleReset(ws, { playerId: playerSession.playerId, ...payload });
          break;
        case 'REJOIN':
          handleRejoin(ws, { playerId: playerSession.playerId, ...payload });
          break;
        default:
          sendMessage(ws, 'ERROR', { message: `Unknown message type: ${type}` });
      }
    } catch (error) {
      console.error('Message error:', error);
      sendMessage(ws, 'ERROR', { message: 'Invalid message format' });
    }
  });

  ws.on('close', () => {
    if (playerSession) {
      // Keep player session in memory for reconnection
      // In a production app, you'd want to clean this up after a timeout
    }
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

// HTTP endpoint for health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Serve static files from dist folder
app.use(express.static(path.join(__dirname, 'dist')));

// Fallback to index.html for React Router (must be after static files and specific routes)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`WebSocket server running on ws://localhost:${PORT}`);
});
