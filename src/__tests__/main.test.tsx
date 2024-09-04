import { setupApp } from "../setup";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { StrictMode } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { describe, it, afterEach, beforeEach, expect } from "vitest"

describe('Home 页面', () => {
    let appContext: ReturnType<typeof setupApp>;

    beforeEach(() => {
        appContext = setupApp();
        const router = createMemoryRouter(appContext.routes);
        render(<RouterProvider router={router} />, { wrapper: StrictMode })
    })

    afterEach(() => {
        cleanup()
    })

    it('应该能渲染出用户名', async () => {
        expect(await screen.findByText("Hi, The Octocat")).toBeTruthy()
    })
})