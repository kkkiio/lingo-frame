import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ get: vi.fn(), language: vi.fn() }));
vi.mock("wxt/browser", () => ({
  browser: { storage: { local: { get: mocks.get } }, i18n: { getUILanguage: mocks.language } },
}));
import { readUiPreferences } from "../src/shared/ui-preferences";
import { i18n, uiMessages } from "../src/shared/i18n";

beforeEach(() => {
  mocks.get.mockResolvedValue({});
  mocks.language.mockReturnValue("en-US");
});
describe("interface language", () => {
  it.each([
    ["en-GB", "en"],
    ["zh-CN", "zh-CN"],
    ["zh-TW", "zh-CN"],
    ["fr", "en"],
  ])("follows browser %s as %s", async (browserLanguage, locale) => {
    mocks.language.mockReturnValue(browserLanguage);
    expect(await readUiPreferences()).toEqual({ preference: "auto", locale });
  });
  it("restores an explicit choice independently of browser language", async () => {
    mocks.language.mockReturnValue("zh-CN");
    mocks.get.mockResolvedValue({ uiPreferences: { locale: "en" } });
    expect(await readUiPreferences()).toEqual({ preference: "en", locale: "en" });
  });
  it("formats compiled catalogs in both languages", () => {
    i18n.activate("zh-CN");
    expect(i18n._(uiMessages.save)).toBe("保存设置");
    expect(i18n._(uiMessages.httpError.id, { status: 429 })).toContain("HTTP 429");
    i18n.activate("en");
    expect(i18n._(uiMessages.save)).toBe("Save settings");
  });
});
