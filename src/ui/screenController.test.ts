import { describe, expect, it } from "vitest";
import { ScreenController } from "./screenController";

describe("screen transition revision", () => {
  it("changes only when the active screen changes", () => {
    const screens = new ScreenController();
    expect(screens.revision).toBe(0);
    screens.open("title");
    expect(screens.revision).toBe(0);
    screens.open("battle");
    expect(screens.revision).toBe(1);
    screens.open("title");
    expect(screens.revision).toBe(2);
    screens.close("campaign");
    expect(screens.revision).toBe(2);
    screens.close("title");
    expect(screens.current).toBe("battle");
    expect(screens.revision).toBe(3);
  });
});
