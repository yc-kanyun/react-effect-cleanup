import { setupApp } from "../setup";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { StrictMode } from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { describe, it, afterEach, beforeEach, expect, vitest } from "vitest"

describe('Home 页面', () => {
    let appContext: ReturnType<typeof setupApp>;
    let router: ReturnType<typeof createMemoryRouter>;

    beforeEach(() => {
        vitest.useFakeTimers()
        appContext = setupApp();
        router = createMemoryRouter(appContext.routes);
        render(<RouterProvider router={router} />, { wrapper: StrictMode })
    })

    afterEach(() => {
        cleanup()
        vitest.useRealTimers()
    })

    it('应该能渲染出用户名', async () => {
        expect(await screen.findByText("Hi, The Octocat")).toBeTruthy()
    })

    it('切换页面到 /foo', async () => {
        act(() => {
            void router.navigate('/foo')
        })

        expect(await screen.findByText('Foo Page')).toBeTruthy()
    })
})