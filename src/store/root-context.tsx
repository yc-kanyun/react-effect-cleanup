import { createContext, FC, ReactNode } from "react";
import { AbortContext } from "../abort";
import { createUserStore } from "./user";

export interface RootContext {
    userStore: ReturnType<typeof createUserStore>,
    rootAbortContext: AbortContext
}

export const RootContext = createContext<RootContext>({} as RootContext)
export const RootProvider: FC<{
    children: ReactNode,
    userStore: ReturnType<typeof createUserStore>,
    rootAbortContext: AbortContext
}> = ({ children, userStore, rootAbortContext }) => {
    return <RootContext.Provider value={{ userStore, rootAbortContext }}>{children}</RootContext.Provider>
}
