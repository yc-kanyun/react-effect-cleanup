import '@testing-library/jest-dom/jest-globals'
import { test, afterEach, expect } from "@jest/globals";
import { setupApp } from "../setup";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { StrictMode } from "react";
import { cleanup, render, screen } from "@testing-library/react";

afterEach(() => {
    cleanup()
})

test("页面渲染测试", async () => {
    const appContext = setupApp();

    const router = createMemoryRouter(appContext.routes);

    render(<StrictMode><RouterProvider router={router} /></StrictMode>)

    expect(await screen.findByText("Hi, The Octocat")).toBeInTheDocument()
})