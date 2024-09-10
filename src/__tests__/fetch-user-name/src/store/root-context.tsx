import { createContext, FC, ReactNode } from "react";
import { createUserStore } from "./user";
import { EffectContext } from "../../../../effect";

export interface RootContext {
    userStore: ReturnType<typeof createUserStore>,
    rootEffectContext: EffectContext
}

export const RootContext = createContext<RootContext>({} as RootContext)
export const RootProvider: FC<{
    children: ReactNode,
    userStore: ReturnType<typeof createUserStore>,
    rootEffectContext: EffectContext
}> = ({ children, userStore, rootEffectContext }) => {
    return <RootContext.Provider value={{ userStore, rootEffectContext }}>{children}</RootContext.Provider>
}
