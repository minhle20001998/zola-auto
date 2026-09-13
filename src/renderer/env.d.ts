interface Window {
  api: {
    ping: () => Promise<string>
    configLoad: () => Promise<unknown>
    configSave: (cfg: unknown) => Promise<unknown>
    scanFolder: (folderPath: string) => Promise<unknown>
    zaloOpen: () => Promise<unknown>
    zaloLoginStatus: () => Promise<{ loggedIn: boolean }>
    zaloWaitLogin: (t?: number) => Promise<unknown>
    zaloLogin: () => Promise<unknown>
    zaloLogout: () => Promise<unknown>
    zaloSearch: (phone: string) => Promise<unknown>
    debugDump: () => Promise<unknown>
    debugGetLog: () => Promise<{ log: string; path: string }>
    debugGetLogPath: () => Promise<{ path: string }>
    debugClearLog: () => Promise<unknown>
    readImage: (filePath: string) => Promise<{ ok: boolean; data?: string; mime?: string; name?: string; error?: string }>
    pickFolder: () => Promise<{ canceled: boolean; path?: string }>
    getVersion: () => Promise<string>
    selectorsGet: () => Promise<{ selectors: unknown; path: string | null }>
    selectorsGetPath: () => Promise<{ path: string | null }>
    selectorsReload: () => Promise<{ selectors: unknown; path: string | null }>
    runStart: (p: unknown) => Promise<unknown>
    runStop: () => Promise<unknown>
    updaterCheck: () => Promise<unknown>
    updaterQuitAndInstall: () => Promise<void>
    on: (ch: string, cb: (...a: unknown[]) => void) => () => void
    sendPickCandidateResponse: (c: number | 'skip') => void
    sendConfirmSendResponse: (a: 'send' | 'skip', caption?: string) => void
  }
}
