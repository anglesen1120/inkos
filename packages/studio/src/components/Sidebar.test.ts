import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setAppLanguage } from "../lib/app-language";
import { Sidebar } from "./Sidebar";
const apiData: Record<string, unknown> = {
  "/books": { books: [{ id: "book-1", title: "Book", genre: "", status: "", chaptersWritten: 0 }] },
  "/interactive-films": { films: [] },
  "/daemon": { running: false },
};

vi.mock("../hooks/use-api", () => ({
  useApi: (path: string) => ({
    data: apiData[path],
    refetch: vi.fn(),
    mutate: vi.fn(),
  }),
}));

const chatState = {
  sessions: {
    "session-1": {
      sessionId: "session-1",
      title: null,
      messages: [],
      isDraft: true,
      isStreaming: false,
    },
  },
  sessionIdsByBook: { __null__: ["session-1"] },
  activeSessionId: "session-1",
  bookDataVersion: 0,
  loadSessionList: vi.fn(),
  loadSessionDetail: vi.fn(),
  activateSession: vi.fn(),
  createDraftSession: vi.fn(() => "draft-1"),
  renameSession: vi.fn(),
  deleteSession: vi.fn(),
  setInput: vi.fn(),
};

vi.mock("../store/chat", () => ({
  useChatStore: (selector: (state: typeof chatState) => unknown) => selector(chatState),
}));

afterEach(() => {
  setAppLanguage("zh");
});

describe("Sidebar session labels", () => {
  it("renders Vietnamese copy for both create actions and an untitled session fallback", () => {
    setAppLanguage("vi");
    const noop = vi.fn();
    const html = renderToStaticMarkup(React.createElement(Sidebar, {
      activePage: "chat",
      sse: { messages: [] },
      t: (key: string) => key,
      nav: {
        toDashboard: noop,
        toChat: noop,
        toBook: noop,
        toBookCreate: noop,
        toServices: noop,
        toProjectSettings: noop,
        toDaemon: noop,
        toLogs: noop,
        toGenres: noop,
        toStyle: noop,
        toTranslation: noop,
        toImport: noop,
        toRadar: noop,
        toDoctor: noop,
        toFilmStudio: noop,
      },
    }));

    expect(html.match(/Phiên mới/g)).toHaveLength(3);
    expect(html).not.toContain("New session");
  });
});
