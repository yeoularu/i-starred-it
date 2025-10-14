import { describe, expect, it } from "vitest";
import { cn } from "./utils";

describe("cn", () => {
  it("merges class names", () => {
    const result = cn("px-2", "py-1");
    expect(result).toBe("px-2 py-1");
  });

  it("handles conditional classes", () => {
    const result = cn("px-2", false, "text-sm");
    expect(result).toBe("px-2 text-sm");
  });

  it("merges tailwind conflicting classes", () => {
    const result = cn("px-2", "px-4");
    expect(result).toBe("px-4");
  });

  it("handles empty inputs", () => {
    const result = cn();
    expect(result).toBe("");
  });

  it("handles null and undefined", () => {
    const result = cn("px-2", null, undefined, "py-1");
    expect(result).toBe("px-2 py-1");
  });

  it("handles arrays", () => {
    const result = cn(["px-2", "py-1"], "text-sm");
    expect(result).toBe("px-2 py-1 text-sm");
  });

  it("handles objects", () => {
    const result = cn({
      "px-2": true,
      "py-1": false,
      "text-sm": true,
    });
    expect(result).toBe("px-2 text-sm");
  });

  it("resolves tailwind class conflicts correctly", () => {
    const result = cn("text-red-500", "text-blue-500");
    expect(result).toBe("text-blue-500");
  });

  it("preserves non-conflicting tailwind classes", () => {
    const result = cn("text-red-500", "bg-blue-500");
    expect(result).toBe("text-red-500 bg-blue-500");
  });

  it("handles complex conditional scenarios", () => {
    const isActive = true;
    const isDisabled = false;
    const result = cn(
      "base-class",
      isActive && "active-class",
      isDisabled && "disabled-class",
      "end-class"
    );
    expect(result).toBe("base-class active-class end-class");
  });
});
