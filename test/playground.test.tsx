import '@testing-library/jest-dom/jest-globals'
import { test, expect } from "@jest/globals"

test('Hello', () => {
    expect('world').toBeTruthy();
})