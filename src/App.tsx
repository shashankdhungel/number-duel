import React, { useState, useEffect } from "react";
import { useGameSocket } from "./hooks/useGameSocket";
import { motion, AnimatePresence } from "motion/react";
import { 
  Trophy, 
  User, 
  Users, 
  History, 
  ChevronUp, 
  ChevronDown, 
  CheckCircle2, 
  Copy, 
  RefreshCw,
  Eye,
  EyeOff,
  Hash
} from "lucide-react";

// Types
interface RoomData {
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
  mySecret?: number | null;
  hostSecret?: number | null;
  guestSecret?: number | null;
  history: HistoryItem[];
}

interface HistoryItem {
  playerId: string;
  guess: number;
  feedback: 'higher' | 'lower' | 'correct';
  timestamp: number;
}

export default function App() {
  const [userName, setUserName] = useState("");
  const [roomId, setRoomId] = useState("");
  const [room, setRoom] = useState<RoomData | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [guessInput, setGuessInput] = useState("");
  const [feedbackError, setFeedbackError] = useState("");
  const [mySecret, setMySecret] = useState<number | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  const gameSocket = useGameSocket({
    onConnected: (playerId) => {
      setIsConnected(true);
      // Try to rejoin previous room if exists
      const savedRoomId = sessionStorage.getItem('gameRoomId');
      if (savedRoomId) {
        setRoomId(savedRoomId);
        gameSocket.rejoin(savedRoomId);
      }
    },
    onRoomUpdate: (data) => {
      const roomData: RoomData = {
        status: data.status,
        hostId: data.hostId,
        guestId: data.guestId,
        hostName: data.hostName,
        guestName: data.guestName,
        currentPlayerId: data.currentPlayerId,
        lastGuess: data.lastGuess,
        isAwaitingFeedback: data.isAwaitingFeedback,
        p1GuessCount: data.p1GuessCount,
        p2GuessCount: data.p2GuessCount,
        p1Range: data.p1Range,
        p2Range: data.p2Range,
        winnerId: data.winnerId,
        history: data.history || [],
        hostSecret: data.hostSecret,
        guestSecret: data.guestSecret,
      };
      setRoom(roomData);
      
      // Always sync mySecret with server state (including null/undefined)
      if (data.mySecret !== undefined) {
        setMySecret(data.mySecret);
      }
      
      // When transitioning to setup, clear the inputs and errors
      if (data.status === 'setup') {
        setGuessInput("");
        setFeedbackError("");
      }
      
      setRoomId(data.roomId);
      setError("");
    },
    onError: (message) => {
      setError(message);
    },
  });

  const createRoom = () => {
    if (!userName.trim()) return setError("Please enter your name first");
    setIsLoading(true);
    setError("");
    gameSocket.createRoom(userName);
    setIsLoading(false);
  };

  const joinRoom = (id: string) => {
    if (!userName.trim()) return setError("Please enter your name first");
    if (!id.trim()) return setError("Enter a Room ID");
    setIsLoading(true);
    setError("");
    gameSocket.joinRoom(id, userName);
    setGuessInput("");
    setIsLoading(false);
  };

  const setSecretValue = (val: number) => {
    if (isNaN(val) || val < 0 || val > 100) return;
    if (!roomId) return;
    gameSocket.setSecret(roomId, val);
    setMySecret(val);
  };

  const handleGuess = () => {
    if (!room || !roomId || room.currentPlayerId !== gameSocket.playerId || room.isAwaitingFeedback) return;
    const val = parseInt(guessInput);
    if (isNaN(val) || val < 0 || val > 100) return;

    gameSocket.makeGuess(roomId, val);
    setGuessInput("");
  };

  const provideFeedback = (type: 'higher' | 'lower' | 'correct') => {
    if (!room || !roomId || room.currentPlayerId === gameSocket.playerId || !room.isAwaitingFeedback) return;
    
    if (mySecret !== null) {
      if (type === 'higher' && room.lastGuess! >= mySecret) return setFeedbackError("Wait! It's not higher.");
      if (type === 'lower' && room.lastGuess! <= mySecret) return setFeedbackError("Wait! It's not lower.");
      if (type === 'correct' && room.lastGuess! !== mySecret) return setFeedbackError("That's not my number!");
    }

    setFeedbackError("");
    gameSocket.provideFeedback(roomId, type);
  };

  const resetGame = () => {
    if (!room || !roomId) return;
    setMySecret(null);
    gameSocket.resetGame(roomId);
  };

  if (!isConnected) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 font-bold text-slate-400">
        CONNECTING...
      </div>
    );
  }

  const isMyTurn = room?.currentPlayerId === gameSocket.playerId;
  const iAmHost = room?.hostId === gameSocket.playerId;
  const opponentName = iAmHost ? (room?.guestName || "Opponent") : (room?.hostName || "Host");
  const myRange = iAmHost ? room?.p1Range : room?.p2Range;

  return (
    <div className={`min-h-screen font-sans flex flex-col items-center justify-center p-0 sm:p-4 transition-colors duration-500 ${
      room?.status === 'playing' ? (isMyTurn ? 'bg-indigo-50/50' : 'bg-slate-50') : 'bg-slate-50'
    }`}>
      <div className="w-full max-w-full sm:max-w-sm h-screen sm:h-auto">
        <motion.div 
          layout
          className="bg-white sm:rounded-[2rem] rounded-none shadow-none sm:shadow-2xl overflow-hidden border-0 sm:border border-slate-100 h-full sm:h-auto flex flex-col"
        >
          {/* Top Branding */}
          <div className="bg-slate-900 p-4 sm:p-6 text-white text-center flex-shrink-0">
            <h1 className="text-lg sm:text-xl font-black tracking-tighter flex items-center justify-center gap-2">
              <Hash className="w-4 sm:w-5 h-4 sm:h-5 text-indigo-400" />
              NUMBER DUEL
            </h1>
            {roomId && (
              <div 
                className="mt-2 text-[10px] font-bold text-slate-500 flex items-center justify-center gap-1 cursor-pointer hover:text-white transition-colors"
                onClick={() => {
                  navigator.clipboard.writeText(roomId);
                  alert("Room ID copied!");
                }}
              >
                ROOM: <span className="text-indigo-400">{roomId}</span> <Copy className="w-3 h-3" />
              </div>
            )}
          </div>

          <div className="p-4 sm:p-8 flex-1 overflow-y-auto">
            <AnimatePresence mode="wait">
              {/* LOBBY */}
              {!roomId ? (
                <motion.div 
                  key="lobby"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 1.05 }}
                  className="space-y-4 sm:space-y-6"
                >
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Identify Yourself</label>
                    <div className="relative">
                      <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-indigo-300 flex-shrink-0" />
                      <input 
                        className="w-full pl-12 pr-4 py-3 sm:py-4 bg-slate-50 border-2 border-slate-50 rounded-2xl focus:border-indigo-500 focus:bg-white outline-none transition-all font-bold text-base sm:text-slate-700 placeholder:text-slate-300 text-slate-700"
                        placeholder="Your Name"
                        value={userName}
                        onChange={(e) => setUserName(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3">
                    <button 
                      onClick={createRoom}
                      disabled={isLoading}
                      className="group relative flex items-center justify-center gap-3 p-4 sm:p-5 rounded-2xl bg-indigo-600 text-white font-black text-base hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 active:scale-95 disabled:opacity-50 h-12 sm:h-auto min-h-[48px]"
                    >
                      <Users className="w-5 h-5 flex-shrink-0" />
                      HOST NEW GAME
                    </button>
                    <div className="flex gap-2">
                      <input 
                        className="flex-1 px-4 py-3 sm:py-4 bg-slate-50 border-2 border-slate-50 rounded-2xl focus:border-slate-300 focus:bg-white outline-none text-center font-black text-base placeholder:text-slate-300 min-h-[48px]"
                        placeholder="ROOM ID"
                        value={guessInput}
                        onChange={(e) => setGuessInput(e.target.value.toUpperCase())}
                      />
                      <button 
                        onClick={() => joinRoom(guessInput)}
                        disabled={isLoading}
                        className="px-4 sm:px-6 rounded-2xl bg-slate-900 text-white font-bold text-base hover:bg-black transition-all active:scale-95 disabled:opacity-50 h-12 sm:h-auto min-h-[48px] flex items-center"
                      >
                        JOIN
                      </button>
                    </div>
                  </div>
                  {error && <p className="text-red-500 text-xs text-center font-bold">{error}</p>}
                </motion.div>
              ) : room?.status === 'waiting' ? (
                /* WAITING */
                <motion.div 
                  key="waiting"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-center space-y-6 sm:space-y-8"
                >
                  <div className="relative">
                    <div className="w-16 sm:w-20 h-16 sm:h-20 bg-indigo-50 rounded-full flex items-center justify-center mx-auto">
                      <RefreshCw className="w-8 sm:w-10 h-8 sm:h-10 text-indigo-500 animate-spin" />
                    </div>
                  </div>
                  <div>
                    <h2 className="text-xl sm:text-2xl font-black text-slate-800">Recruiting Duelist</h2>
                    <p className="text-slate-400 text-xs sm:text-sm font-medium mt-1">Share the Room ID to begin</p>
                  </div>
                  <div className="p-4 sm:p-6 bg-slate-50 rounded-3xl font-black text-3xl sm:text-4xl tracking-widest text-indigo-600 border-2 border-indigo-100">
                    {roomId}
                  </div>
                  <button className="text-slate-400 text-xs font-black uppercase tracking-widest hover:text-red-500 transition-colors" onClick={() => setRoomId("")}>
                    ABORT MISSION
                  </button>
                </motion.div>
              ) : room?.status === 'setup' ? (
                /* SETUP */
                <motion.div 
                  key="setup"
                  className="space-y-6 sm:space-y-8"
                >
                  <div className="text-center">
                    <h2 className="text-xl sm:text-2xl font-black text-slate-800">The Secret Number</h2>
                    <p className="text-slate-400 text-xs sm:text-sm font-medium">Pick a number between 0 and 100</p>
                  </div>

                  {mySecret === null ? (
                    <div className="space-y-4">
                      <div className="relative">
                        <input 
                          type={showSecret ? "number" : "password"}
                          className="w-full p-6 sm:p-8 text-4xl sm:text-5xl text-center font-black bg-slate-50 border-2 border-slate-50 rounded-[2rem] focus:border-indigo-500 focus:bg-white outline-none transition-all text-base placeholder:text-slate-200"
                          placeholder="00"
                          value={guessInput}
                          onChange={(e) => setGuessInput(e.target.value)}
                        />
                        <button 
                          className="absolute right-4 sm:right-6 top-1/2 -translate-y-1/2 text-slate-300 hover:text-indigo-500 transition-colors p-2 -m-2 min-h-[48px] min-w-[48px] flex items-center justify-center"
                          onClick={() => setShowSecret(!showSecret)}
                        >
                          {showSecret ? <EyeOff className="w-6 h-6" /> : <Eye className="w-6 h-6" />}
                        </button>
                      </div>
                      <button 
                        onClick={() => {
                          setSecretValue(parseInt(guessInput));
                          setGuessInput("");
                        }}
                        className="w-full py-4 sm:py-5 bg-indigo-600 text-white font-black rounded-2xl shadow-xl shadow-indigo-100 active:scale-[0.98] transition-all text-base min-h-[48px]"
                      >
                        LOCK IT IN
                      </button>
                    </div>
                  ) : (
                    <div className="text-center py-8 sm:py-10 space-y-4">
                      <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto">
                        <CheckCircle2 className="w-8 h-8" />
                      </div>
                      <h3 className="text-lg sm:text-xl font-bold text-slate-800">Secret Locked</h3>
                      <p className="text-slate-400 text-xs sm:text-sm italic font-medium leading-relaxed">Waiting for {opponentName} to finalize their entry...</p>
                    </div>
                  )}
                </motion.div>
              ) : room?.status === 'playing' ? (
                /* PLAYING */
                <motion.div 
                  key="playing"
                  className="space-y-4 sm:space-y-6 flex flex-col h-full"
                >
                  {/* Scoreboard */}
                  <div className="flex justify-between items-center p-3 sm:p-4 bg-slate-50 rounded-2xl border border-slate-100 flex-shrink-0">
                    <div className="text-left">
                      <p className={`text-[10px] font-black uppercase ${iAmHost ? 'text-indigo-600' : 'text-slate-400'}`}>{room.hostName}</p>
                      <p className="text-base sm:text-lg font-black">{room.p1GuessCount} <span className="text-[10px] font-bold text-slate-300 uppercase">Guesses</span></p>
                    </div>
                    <div className="w-px h-8 bg-slate-200" />
                    <div className="text-right">
                      <p className={`text-[10px] font-black uppercase ${!iAmHost ? 'text-indigo-600' : 'text-slate-400'}`}>{room.guestName}</p>
                      <p className="text-base sm:text-lg font-black">{room.p2GuessCount} <span className="text-[10px] font-bold text-slate-300 uppercase">Guesses</span></p>
                    </div>
                  </div>

                  {/* Main Action */}
                  <div className="text-center py-2 sm:py-4 flex-1 overflow-y-auto">
                    {isMyTurn ? (
                      <div>
                        {room.isAwaitingFeedback ? (
                          <div className="space-y-4 sm:space-y-6">
                            <RefreshCw className="w-10 sm:w-12 h-10 sm:h-12 text-indigo-300 animate-spin mx-auto" />
                            <div>
                              <h3 className="text-lg sm:text-xl font-black text-slate-800">Awaiting Verdict</h3>
                              <p className="text-slate-400 text-xs sm:text-sm font-medium mt-1">You guessed <span className="text-slate-900 font-black">{room.lastGuess}</span></p>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-4 sm:space-y-6">
                            <div>
                              <h3 className="text-xl sm:text-2xl font-black text-indigo-600">Your Move</h3>
                              <p className="text-slate-400 text-xs sm:text-sm font-medium">Guess {opponentName}'s secret number</p>
                            </div>
                            <div className="flex flex-col sm:flex-row gap-2">
                              <input 
                                type="number"
                                className="flex-1 p-4 sm:p-5 text-3xl sm:text-4xl font-black bg-slate-50 border-2 border-slate-50 rounded-2xl focus:border-indigo-500 focus:bg-white outline-none transition-all placeholder:text-slate-200 text-base min-h-[48px]"
                                placeholder="..."
                                value={guessInput}
                                onChange={(e) => setGuessInput(e.target.value)}
                                onKeyPress={(e) => e.key === 'Enter' && handleGuess()}
                              />
                              <button 
                                onClick={handleGuess}
                                className="px-6 sm:px-8 rounded-2xl bg-indigo-600 text-white font-black shadow-xl shadow-indigo-100 active:scale-95 transition-all text-lg sm:text-xl h-12 sm:h-auto min-h-[48px] flex items-center justify-center"
                              >
                                GO
                              </button>
                            </div>
                            <div className="space-y-2">
                              <div className="flex justify-between text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">
                                <span>{myRange?.min}</span>
                                <span>Range Indicator</span>
                                <span>{myRange?.max}</span>
                              </div>
                              <div className="h-3 sm:h-4 bg-slate-100 rounded-full relative overflow-hidden">
                                <motion.div 
                                  className="absolute top-0 h-full rounded-full bg-gradient-to-r from-indigo-500 to-blue-500"
                                  animate={{ 
                                    left: `${myRange?.min}%`,
                                    width: `${(myRange?.max || 100) - (myRange?.min || 0)}%`
                                  }}
                                />
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-4 sm:space-y-6">
                        {room.isAwaitingFeedback ? (
                          <div className="space-y-4 sm:space-y-6">
                            <div className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Incoming Guess</div>
                            <div className="text-6xl sm:text-8xl font-black text-slate-900 drop-shadow-sm">{room.lastGuess}</div>
                            <p className="text-xs sm:text-sm font-bold text-slate-500 italic">Your secret is <span className="text-indigo-600 font-black px-2 py-1 bg-indigo-50 rounded-lg">{mySecret}</span></p>
                            <div className="grid grid-cols-3 gap-2">
                              <button onClick={() => provideFeedback('higher')} className="flex flex-col items-center justify-center gap-1 sm:gap-2 p-3 sm:p-4 bg-amber-50 text-amber-600 border-2 border-amber-100 rounded-xl sm:rounded-2xl hover:bg-amber-100 active:scale-95 transition-all font-black text-[10px] sm:text-xs uppercase tracking-tighter min-h-[48px]">
                                <ChevronUp className="w-5 sm:w-6 h-5 sm:h-6" /> Higher
                              </button>
                              <button onClick={() => provideFeedback('correct')} className="flex flex-col items-center justify-center gap-1 sm:gap-2 p-3 sm:p-4 bg-green-50 text-green-600 border-2 border-green-100 rounded-xl sm:rounded-2xl hover:bg-green-100 active:scale-95 transition-all font-black text-[10px] sm:text-xs uppercase tracking-tighter min-h-[48px]">
                                <CheckCircle2 className="w-5 sm:w-6 h-5 sm:h-6" /> Got It
                              </button>
                              <button onClick={() => provideFeedback('lower')} className="flex flex-col items-center justify-center gap-1 sm:gap-2 p-3 sm:p-4 bg-indigo-50 text-indigo-600 border-2 border-indigo-100 rounded-xl sm:rounded-2xl hover:bg-indigo-100 active:scale-95 transition-all font-black text-[10px] sm:text-xs uppercase tracking-tighter min-h-[48px]">
                                <ChevronDown className="w-5 sm:w-6 h-5 sm:h-6" /> Lower
                              </button>
                            </div>
                            {feedbackError && <p className="text-red-500 text-[10px] font-black uppercase">{feedbackError}</p>}
                          </div>
                        ) : (
                          <div className="space-y-4 sm:space-y-6">
                            <RefreshCw className="w-10 sm:w-12 h-10 sm:h-12 text-slate-200 animate-spin mx-auto" />
                            <div>
                              <h3 className="text-base sm:text-xl font-black text-slate-400 uppercase tracking-widest">Defense Mode</h3>
                              <p className="text-slate-400 text-xs sm:text-sm font-medium mt-1 italic">{opponentName} is calculating...</p>
                            </div>
                            <div className="p-3 sm:p-4 bg-indigo-50/50 rounded-2xl border border-indigo-100 inline-block">
                              <p className="text-[10px] font-black text-indigo-400 uppercase mb-1">Your Secret</p>
                              <p className="text-xl sm:text-2xl font-black text-indigo-600">{mySecret}</p>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* History */}
                  <div className="pt-4 sm:pt-6 border-t border-slate-100 flex flex-col flex-shrink-0 max-h-40 sm:max-h-48">
                    <h4 className="text-[10px] font-black uppercase text-slate-300 tracking-[0.2em] mb-2 sm:mb-4 flex items-center justify-center gap-2">
                      <History className="w-3 h-3 flex-shrink-0" /> Live Feed
                    </h4>
                    <div className="h-32 sm:h-40 overflow-y-auto space-y-2 pr-1 sm:pr-2 custom-scrollbar flex-1">
                      {room.history.map((item, i) => (
                        <motion.div 
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          key={i} 
                          className="flex items-center justify-between p-2 sm:p-3 bg-slate-50 rounded-lg sm:rounded-xl text-xs sm:text-base"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${item.playerId === room.hostId ? 'bg-indigo-500' : 'bg-purple-500'}`} />
                            <span className="text-[10px] font-bold text-slate-400 uppercase truncate max-w-[60px]">
                              {item.playerId === room.hostId ? room.hostName : room.guestName}
                            </span>
                          </div>
                          <span className="font-black text-sm sm:text-base mx-2">{item.guess}</span>
                          <span className={`text-[9px] sm:text-[10px] font-black px-2 py-0.5 rounded-lg border uppercase tracking-tighter flex-shrink-0 ${
                            item.feedback === 'correct' ? 'bg-green-50 text-green-600 border-green-100' : 
                            item.feedback === 'higher' ? 'bg-amber-50 text-amber-600 border-amber-100' : 'bg-indigo-50 text-indigo-600 border-indigo-100'
                          }`}>
                            {item.feedback}
                          </span>
                        </motion.div>
                      ))}
                    </div>
                  </div>
                </motion.div>
              ) : (
                /* FINISHED */
                <motion.div 
                  key="win"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="text-center space-y-6 sm:space-y-10 py-4 sm:py-6"
                >
                  <div className="relative">
                    <motion.div
                      animate={{ rotate: [0, 10, -10, 0] }}
                      transition={{ repeat: Infinity, duration: 4 }}
                    >
                      <Trophy className={`w-20 sm:w-24 h-20 sm:h-24 mx-auto ${room?.winnerId === gameSocket.playerId ? "text-yellow-400" : "text-slate-200"}`} />
                    </motion.div>
                  </div>
                  <div className="space-y-2">
                    <h2 className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tighter">{room?.winnerId === gameSocket.playerId ? "VICTORY!" : "DEFEATED"}</h2>
                    <p className="text-slate-400 font-bold uppercase text-[10px] sm:text-xs tracking-widest">
                      {room?.winnerId === gameSocket.playerId ? "You outsmarted the competition" : "The opponent was one step ahead"}
                    </p>
                  </div>
                  <div className="bg-slate-900 text-white p-6 sm:p-8 rounded-2xl sm:rounded-[2rem] shadow-2xl relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                      <Hash className="w-16 sm:w-20 h-16 sm:h-20" />
                    </div>
                    <div className="relative z-10 grid grid-cols-2 gap-6 sm:gap-8">
                      <div>
                        <div className="text-[10px] text-slate-500 font-black uppercase mb-1">Winning Guess</div>
                        <div className="text-3xl sm:text-4xl font-black text-indigo-400">{room?.lastGuess}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-500 font-black uppercase mb-1">Efficiency</div>
                        <div className="text-3xl sm:text-4xl font-black text-indigo-400">{room?.winnerId === room?.hostId ? room?.p1GuessCount : room?.p2GuessCount}x</div>
                      </div>
                    </div>
                  </div>

                  {/* Secrets Revealed */}
                  <div className="bg-slate-50 p-6 sm:p-8 rounded-2xl border-2 border-slate-200">
                    <div className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-4">Both Secrets Revealed</div>
                    <div className="grid grid-cols-2 gap-4 mb-6">
                      <div className={`p-4 rounded-xl text-center ${room?.winnerId === room?.hostId ? 'bg-green-50 border-2 border-green-200' : 'bg-slate-100 border-2 border-slate-200'}`}>
                        <div className="text-xs font-black uppercase text-slate-600 mb-2">{room?.hostName}</div>
                        <div className={`text-2xl sm:text-3xl font-black ${room?.winnerId === room?.hostId ? 'text-green-600' : 'text-slate-400'}`}>{room?.hostSecret}</div>
                      </div>
                      <div className={`p-4 rounded-xl text-center ${room?.winnerId === room?.guestId ? 'bg-green-50 border-2 border-green-200' : 'bg-slate-100 border-2 border-slate-200'}`}>
                        <div className="text-xs font-black uppercase text-slate-600 mb-2">{room?.guestName}</div>
                        <div className={`text-2xl sm:text-3xl font-black ${room?.winnerId === room?.guestId ? 'text-green-600' : 'text-slate-400'}`}>{room?.guestSecret}</div>
                      </div>
                    </div>
                    <div className="text-center text-sm font-bold text-slate-600">
                      <span className="text-indigo-600 font-black">{room?.winnerId === room?.hostId ? room?.hostName : room?.guestName}</span> 
                      {' '}guessed correctly in 
                      <span className="text-indigo-600 font-black ml-1">{room?.winnerId === room?.hostId ? room?.p1GuessCount : room?.p2GuessCount}</span>
                      {' '}guesses
                    </div>
                  </div>
                  <div className="space-y-3">
                    <button 
                      onClick={resetGame}
                      className="w-full py-4 sm:py-5 bg-indigo-600 text-white font-black rounded-2xl shadow-xl shadow-indigo-100 hover:bg-indigo-700 active:scale-95 transition-all uppercase tracking-widest text-xs sm:text-sm min-h-[48px]"
                    >
                      REMATCH
                    </button>
                    <button 
                      onClick={() => setRoomId("")}
                      className="text-slate-400 text-xs font-black uppercase tracking-[0.3em] hover:text-indigo-600 transition-colors"
                    >
                      LEAVE ARENA
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      </div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #e2e8f0;
          border-radius: 10px;
        }
        input::-webkit-outer-spin-button,
        input::-webkit-inner-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }
        /* Ensure font-size is 16px to prevent iOS zoom on input focus */
        input {
          font-size: 16px !important;
        }
      `}</style>
    </div>
  );
}
