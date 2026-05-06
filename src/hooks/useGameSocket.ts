import { useEffect, useRef, useCallback, useState } from 'react';

export interface GameMessage {
  type: string;
  [key: string]: any;
}

interface UseGameSocketOptions {
  onConnected?: (playerId: string) => void;
  onRoomUpdate?: (data: any) => void;
  onError?: (message: string) => void;
}

export function useGameSocket(options: UseGameSocketOptions = {}) {
  const wsRef = useRef<WebSocket | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const reconnectAttemptsRef = useRef(0);

  // Try to restore session from sessionStorage
  useEffect(() => {
    const storedPlayerId = sessionStorage.getItem('gamePlayerId');
    if (storedPlayerId) {
      setPlayerId(storedPlayerId);
    }
  }, []);

  // Connect to WebSocket
  useEffect(() => {
    

    const connect = () => {
      try {
        // Determine WebSocket URL
        let wsUrl = import.meta.env.VITE_WS_URL;
        if (!wsUrl) {
          // In production, construct from current origin
          const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
          wsUrl = `${protocol}//${window.location.host}`;
        }
        const ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          console.log('WebSocket connected');
          reconnectAttemptsRef.current = 0;

          // Send CONNECT message with playerId
          const roomId = sessionStorage.getItem('gameRoomId');
          ws.send(
            JSON.stringify({
              type: 'CONNECT',
              playerId,
              roomId: roomId || undefined,
            })
          );
        };

        ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            handleMessage(message);
          } catch (error) {
            console.error('Failed to parse message:', error);
          }
        };

        ws.onerror = (error) => {
          console.error('WebSocket error:', error);
        };

        ws.onclose = () => {
          console.log('WebSocket disconnected');
          wsRef.current = null;

          // Attempt to reconnect with exponential backoff
          const backoffTime = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 10000);
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectAttemptsRef.current++;
            connect();
          }, backoffTime);
        };

        wsRef.current = ws;
      } catch (error) {
        console.error('Failed to create WebSocket:', error);
        if (options.onError) {
          options.onError('Failed to connect to server');
        }
      }
    };

    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.close();
      }
    };
  }, []);

  const handleMessage = useCallback(
    (message: GameMessage) => {
      const { type } = message;

      switch (type) {
        case 'CONNECTED':
          const newPlayerId = message.playerId;
          setPlayerId(newPlayerId);
          sessionStorage.setItem('gamePlayerId', newPlayerId);
          if (options.onConnected) {
            options.onConnected(newPlayerId);
          }
          break;

        case 'ROOM_UPDATE':
          // Store current room ID
          if (message.roomId) {
            sessionStorage.setItem('gameRoomId', message.roomId);
          }
          if (options.onRoomUpdate) {
            options.onRoomUpdate(message);
          }
          break;

        case 'ROOM_CREATED':
          if (message.roomId) {
            sessionStorage.setItem('gameRoomId', message.roomId);
          }
          break;

        case 'ERROR':
          if (options.onError) {
            options.onError(message.message || 'An error occurred');
          }
          break;

        default:
          console.warn('Unknown message type:', type);
      }
    },
    [options]
  );

  const send = useCallback((type: string, payload: any = {}) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.warn('WebSocket not connected');
      if (options.onError) {
        options.onError('Not connected to server');
      }
      return;
    }

    try {
      wsRef.current.send(JSON.stringify({ type, ...payload }));
    } catch (error) {
      console.error('Failed to send message:', error);
      if (options.onError) {
        options.onError('Failed to send message');
      }
    }
  }, [options]);

  const createRoom = useCallback(
    (playerName: string) => {
      send('CREATE', { playerName });
    },
    [send]
  );

  const joinRoom = useCallback(
    (roomId: string, playerName: string) => {
      send('JOIN', { roomId, playerName });
    },
    [send]
  );

  const setSecret = useCallback(
    (roomId: string, secret: number) => {
      send('SET_SECRET', { roomId, secret });
    },
    [send]
  );

  const makeGuess = useCallback(
    (roomId: string, guess: number) => {
      send('GUESS', { roomId, guess });
    },
    [send]
  );

  const provideFeedback = useCallback(
    (roomId: string, feedback: 'higher' | 'lower' | 'correct') => {
      send('FEEDBACK', { roomId, feedback });
    },
    [send]
  );

  const resetGame = useCallback(
    (roomId: string) => {
      send('RESET', { roomId });
    },
    [send]
  );

  const rejoin = useCallback(
    (roomId: string) => {
      send('REJOIN', { roomId });
    },
    [send]
  );

  return {
    playerId,
    isConnected: wsRef.current?.readyState === WebSocket.OPEN,
    createRoom,
    joinRoom,
    setSecret,
    makeGuess,
    provideFeedback,
    resetGame,
    rejoin,
  };
}
