import { server } from "./src/mocks/server";
import { beforeAll, afterAll, beforeEach } from "vitest";

beforeAll(() => {
    server.listen()
})

afterAll(() => {
    server.close()
})

beforeEach(() => {
    server.resetHandlers()
})
