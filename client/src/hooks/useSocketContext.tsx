import React, { createContext, useContext } from "react";
import { useSocket, type UseSocketReturn } from "./useSocket";

const SocketContext = createContext<UseSocketReturn | null>(null);

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const socketReturn = useSocket();
  return (
    <SocketContext.Provider value={socketReturn}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocketContext(): UseSocketReturn {
  const ctx = useContext(SocketContext);
  if (!ctx)
    throw new Error("useSocketContext must be used within SocketProvider");
  return ctx;
}
