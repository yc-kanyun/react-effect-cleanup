import { useContext } from "react"
import { RootContext } from "../store/root-context"

export function Home() {
    const { userStore, rootEffectContext } = useContext(RootContext)
    const userName = userStore(state => state.name)
    const _loading = userStore(state => state._loading)

    if (_loading) {
        return <div>Loading...</div>
    }

    return (<>
        <div>Hi, {userName}</div>
        <button onClick={() => { void userStore.getState().fetch(rootEffectContext) }}>Fetch</button>
    </>
    )
}