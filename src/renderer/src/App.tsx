import { useEffect, useState } from 'react'
import type { AppConfig } from '../../shared/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Progress } from '@/components/ui/progress'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Loader2, LogOut, LogIn, FolderOpen, Settings, Image as ImageIcon, Search, User, RefreshCw, HelpCircle } from 'lucide-react'

function LabelWithTooltip({ children, tooltip }: { children: React.ReactNode; tooltip: string }) {
  return (
    <div className="flex items-center gap-1">
      <span>{children}</span>
      <span className="group relative inline-flex">
        <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
        <span className="pointer-events-none absolute left-1/2 top-full z-50 hidden w-56 -translate-x-1/2 rounded-md bg-black px-2 py-1.5 text-xs text-white group-hover:block mt-1 whitespace-normal shadow-md">
          {tooltip}
        </span>
      </span>
    </div>
  )
}

const defaultConfig: AppConfig = {
  folderPath: '',
  captionTemplate: '',
  delayMinSec: 20,
  delayMaxSec: 60,
  dailyCap: 50,
  mode: 'confirm',
  supportedExtensions: ['jpg', 'jpeg', 'png', 'webp'],
  loginTimeoutSec: 300
}

export default function App() {
  const [ping, setPing] = useState<string>('...')
  const [log, setLog] = useState<string[]>([])
  const [cfg, setCfg] = useState<AppConfig>(defaultConfig)
  const [scanResult, setScanResult] = useState<string>('')
  const [loginStatus, setLoginStatus] = useState<string>('unknown')
  const [loginLoading, setLoginLoading] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [picker, setPicker] = useState<{ phone: string; candidates: { index: number; name: string; subtitle?: string }[] } | null>(null)
  const [confirm, setConfirm] = useState<{ phone: string; name?: string; files?: string[]; caption?: string } | null>(null)
  const [confirmEditCaption, setConfirmEditCaption] = useState('')
  const [confirmImages, setConfirmImages] = useState<{ src: string; name: string }[]>([])
  const [galleryImage, setGalleryImage] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<string>('')
  const [progressInfo, setProgressInfo] = useState<{ index: number; total: number; phone: string; status: string } | null>(null)
  const [progressHistory, setProgressHistory] = useState<{ index: number; total: number; phone: string; status: string }[]>([])
  const [forceResend, setForceResend] = useState(false)
  const [lastReport, setLastReport] = useState<string>('')
  const [updaterMsg, setUpdaterMsg] = useState<string>('')
  const [updateReady, setUpdateReady] = useState(false)
  const [debugLog, setDebugLog] = useState<string>('')
  const [debugPath, setDebugPath] = useState<string>('')
  const [tableItems, setTableItems] = useState<{ key: string; id: string; phone: string; files: string[]; rawPhone: string }[]>([])
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set())
  const [appVersion, setAppVersion] = useState<string>('')

  useEffect(() => {
    window.api.ping().then((v: unknown) => setPing(String(v))).catch((e: unknown) => setPing(`error: ${String(e)}`))
    window.api.configLoad().then((c) => { if (c && typeof c === 'object') setCfg(c as AppConfig) }).catch(() => {})
    window.api.zaloLoginStatus().then((r) => setLoginStatus(r.loggedIn ? 'logged in' : 'not logged in')).catch(() => setLoginStatus('not logged in'))
    window.api.debugGetLogPath().then((r) => setDebugPath(r.path)).catch(() => {})
    window.api.getVersion().then((v) => setAppVersion(v)).catch(() => {})
    const offLog = window.api.on('run:log', (...args: unknown[]) => {
      const entry = args[0] as { message?: string } | string
      const msg = typeof entry === 'string' ? entry : (entry as { message?: string }).message ?? JSON.stringify(entry)
      setLog((l) => [...l.slice(-500), msg])
    })
    const offPick = window.api.on('zalo:pick-candidate', (...args: unknown[]) => {
      const data = args[0] as { phone: string; candidates: { index: number; name: string; subtitle?: string }[] }
      setPicker(data)
    })
    const offConfirm = window.api.on('zalo:confirm-send', (...args: unknown[]) => {
      const data = args[0] as { phone: string; name?: string; files?: string[]; caption?: string }
      setConfirm(data)
      setConfirmEditCaption(data.caption ?? '')
    })
    const offProg = window.api.on('run:progress', (...args: unknown[]) => {
      const p = args[0] as { index: number; total: number; phone: string; status: string }
      setProgress(`${p.index}/${p.total} ${p.phone} → ${p.status}`)
      setProgressInfo(p)
      setProgressHistory((h) => [...h.slice(-500), p])
      setLog((l) => [...l.slice(-500), `${p.index}/${p.total} ${p.phone} ${p.status}`])
    })
    const offDone = window.api.on('run:done', (...args: unknown[]) => {
      setRunning(false)
      setLastReport(JSON.stringify(args[0], null, 2))
      setProgress('Done')
      const r = args[0] as { totals?: Record<string, number> }
      if (r?.totals) setLog((l) => [...l.slice(-500), `Done totals: ${JSON.stringify(r.totals)}`])
    })
    const offUpd = window.api.on('updater:event', (...args: unknown[]) => {
      const e = args[0] as { type: string; progress?: { percent?: number }; info?: unknown; message?: string }
      if (e.type === 'checking-for-update') setUpdaterMsg('Checking for updates...')
      if (e.type === 'update-available') setUpdaterMsg('Update available — downloading...')
      if (e.type === 'download-progress') setUpdaterMsg(`Downloading ${Math.round(e.progress?.percent ?? 0)}%`)
      if (e.type === 'update-downloaded') { setUpdaterMsg('Update ready — restart to install'); setUpdateReady(true) }
      if (e.type === 'update-not-available') setUpdaterMsg('')
      if (e.type === 'error') setUpdaterMsg(`Updater: ${e.message ?? 'error'}`)
    })
    return () => { offLog(); offPick(); offConfirm(); offProg(); offDone(); offUpd() }
  }, [])

  useEffect(() => {
    if (cfg.folderPath && tableItems.length === 0 && !running) {
      handleScan()
    }
  }, [cfg.folderPath])

  useEffect(() => {
    if (!confirm?.files?.length) {
      setConfirmImages([])
      return
    }
    let cancelled = false
    Promise.all(
      confirm.files.map(async (p) => {
        try {
          const r = await window.api.readImage(p)
          if (r.ok && r.data && r.mime) {
            return { src: `data:${r.mime};base64,${r.data}`, name: r.name || p.split(/[\\/]/).pop() || 'image' }
          }
          return null
        } catch {
          return null
        }
      })
    ).then((imgs) => {
      if (!cancelled) setConfirmImages(imgs.filter(Boolean) as { src: string; name: string }[])
    })
    return () => { cancelled = true }
  }, [confirm])

  async function handleLogin() {
    setLoginLoading(true)
    setLog((l) => [...l, 'Opening browser for login — please scan QR...'])
    try {
      await window.api.zaloLogin()
      setLog((l) => [...l, 'Login flow finished — checking status...'])
    } catch (e) {
      setLog((l) => [...l, `Login flow error: ${String(e)}`])
    }
    try {
      const r = await window.api.zaloLoginStatus()
      setLoginStatus(r.loggedIn ? 'logged in' : 'not logged in')
      setLog((l) => [...l, `Status now: ${r.loggedIn ? 'logged in' : 'not logged in'}`])
    } catch (_e) { void _e }
    setLoginLoading(false)
  }
  async function handleLogout() {
    setLoginLoading(true)
    setLog((l) => [...l, 'Opening browser to logout...'])
    try {
      await window.api.zaloLogout()
      setLog((l) => [...l, 'Logout flow finished — checking status...'])
    } catch (e) {
      setLog((l) => [...l, `Logout flow error: ${String(e)}`])
    }
    try {
      const r = await window.api.zaloLoginStatus()
      setLoginStatus(r.loggedIn ? 'logged in' : 'not logged in')
      setLog((l) => [...l, `Status now: ${r.loggedIn ? 'logged in' : 'not logged in'}`])
    } catch (_e) { void _e }
    setLoginLoading(false)
    setUserMenuOpen(false)
  }
  async function handlePickFolder() {
    const r = await window.api.pickFolder()
    if (!r.canceled && r.path) {
      const next = { ...cfg, folderPath: r.path }
      setCfg(next)
      await window.api.configSave(next)
      try {
        const res = (await window.api.scanFolder(r.path)) as { items: { key: string; id: string; phone: string; files: string[]; rawPhone: string }[]; errors: unknown[] }
        setScanResult(`Items: ${res.items.length}, Errors: ${res.errors.length}`)
        setTableItems(res.items)
        setSelectedKeys(new Set(res.items.map((it) => it.key)))
        if (res.items.length === 0) setScanResult('No images found — check folder and file names like 123-0123.456.789.jpg')
      } catch (e) { setScanResult(`scan error: ${String(e)}`) }
    }
  }
  async function handleScan() {
    if (!cfg.folderPath) return setScanResult('Set folderPath in config')
    try {
      const r = (await window.api.scanFolder(cfg.folderPath)) as { items: { key: string; id: string; phone: string; files: string[]; rawPhone: string }[]; errors: unknown[] }
      setScanResult(`Items: ${r.items.length}, Errors: ${r.errors.length}`)
      setTableItems(r.items)
      setSelectedKeys(new Set(r.items.map((it) => it.key)))
      if (r.items.length === 0) setScanResult('No images found — check folder and file names like 123-0123.456.789.jpg')
    } catch (e) { setScanResult(`scan error: ${String(e)}`) }
  }
  async function saveCfg() {
    try { await window.api.configSave(cfg); setLog((l) => [...l, 'Config saved']) } catch (e) { setLog((l) => [...l, `Save failed: ${String(e)}`]) }
  }
  async function startRun() {
    if (tableItems.length === 0) {
      setLog((l) => [...l, 'No items loaded — set a folder and click Load'])
      return
    }
    const selected = tableItems.filter((it) => selectedKeys.has(it.key))
    if (selected.length === 0) {
      setLog((l) => [...l, 'No rows selected'])
      return
    }
    setRunning(true); setProgress('Starting...'); setProgressInfo(null); setProgressHistory([]); setLastReport('')
    try {
      const r = await window.api.runStart({ config: cfg, items: selected, forceResend }) as unknown
      setLastReport(JSON.stringify(r, null, 2))
    } catch (e) { setLog((l) => [...l, `Run failed: ${String(e)}`]) } finally { setRunning(false) }
  }
  async function stopRun() { try { await window.api.runStop() } catch (_e) { void _e } }

  if (loginStatus === 'unknown') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#f5f5f5] p-8">
        <Loader2 className="h-9 w-9 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Checking login state...</p>
      </div>
    )
  }

  if (loginStatus === 'not logged in') {
    return (
      <div className="min-h-screen bg-[#f5f5f5]">
        <header className="sticky top-0 z-40 w-full border-b bg-white/80 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-[1600px] items-center px-4 sm:px-6">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-sm">Z</div>
              <h1 className="text-lg font-semibold tracking-tight">zalo-auto</h1>
            </div>
          </div>
        </header>
        <div className="flex flex-col items-center justify-center p-6" style={{ minHeight: 'calc(100vh - 56px)' }}>
          <Card className="w-full max-w-[420px] bg-white shadow-sm">
            <CardHeader className="text-center">
              <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                <LogIn className="h-6 w-6" />
              </div>
              <CardTitle>Welcome back</CardTitle>
              <CardDescription>Please log in to Zalo to continue. A browser window will open — scan the QR code, then it will close automatically.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button onClick={handleLogin} disabled={loginLoading} className="w-full">
                {loginLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Opening browser...</> : <><LogIn className="mr-2 h-4 w-4" />Log in to Zalo</>}
              </Button>
              <p className="text-center text-xs text-muted-foreground">IPC ping: {ping}</p>
            </CardContent>
          </Card>
          {updaterMsg && (
            <Alert variant="warning" className="mt-4 max-w-[420px] w-full">
              <AlertTitle>{updaterMsg}</AlertTitle>
              {updateReady && <Button onClick={() => window.api.updaterQuitAndInstall()} size="sm" className="mt-2">Restart & install</Button>}
            </Alert>
          )}
        </div>
      </div>
    )
  }

  const percent = progressInfo ? Math.round((progressInfo.index / progressInfo.total) * 100) : running ? 5 : 0

  return (
    <div className="min-h-screen bg-[#f5f5f5]">
      {/* Header */}
      <header className="sticky top-0 z-40 w-full border-b bg-white/80 backdrop-blur supports-[backdrop-filter]:bg-white/60">
        <div className="mx-auto flex h-14 max-w-[1600px] items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-sm" title={appVersion ? `v${appVersion}` : undefined}>Z</div>
            <h1 className="text-lg font-semibold tracking-tight">zalo-auto</h1>
            <span className="hidden text-xs text-muted-foreground sm:inline">· {running ? 'RUNNING' : 'idle'} {progress ? `· ${progress}` : ''}</span>
            {appVersion && <span className="hidden rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground sm:inline">v{appVersion}</span>}
          </div>
          <div className="relative">
            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full border" onClick={() => setUserMenuOpen((v) => !v)}>
              <User className="h-5 w-5" />
            </Button>
            {userMenuOpen && (
              <div className="absolute right-0 mt-2 w-56 rounded-lg border bg-white p-1 shadow-lg z-50">
                <button onClick={() => { setUserMenuOpen(false); document.getElementById('config-card')?.scrollIntoView({ behavior: 'smooth' }) }} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-accent">
                  <Settings className="h-4 w-4" /> Settings
                </button>
                <button
                  onClick={() => {
                    setUserMenuOpen(false)
                    window.api.updaterCheck()
                    setLog((l) => [...l, 'Checking for updates...'])
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-accent"
                >
                  <RefreshCw className="h-4 w-4" /> Check for updates
                </button>
                <button onClick={handleLogout} disabled={loginLoading} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-accent text-destructive">
                  <LogOut className="h-4 w-4" /> {loginLoading ? '...' : 'Logout'}
                </button>
                <div className="my-1 border-t" />
                <div className="px-3 py-1 text-xs text-muted-foreground">IPC ping: {ping}</div>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1600px] p-4 sm:p-6 space-y-4">
        {updaterMsg && (
          <Alert variant="warning" className="flex items-center justify-between">
            <AlertDescription>{updaterMsg}</AlertDescription>
            <div className="flex gap-2">
              {updateReady && <Button size="sm" onClick={() => window.api.updaterQuitAndInstall()} className="bg-[#ef6c00] hover:bg-[#ef6c00]/90">Restart & install</Button>}
              <Button variant="ghost" size="sm" onClick={() => setUpdaterMsg('')}>Dismiss</Button>
            </div>
          </Alert>
        )}

        <Card id="config-card" className="bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Settings className="h-5 w-5" />Config</CardTitle>
            <CardDescription>Folder, caption, delays and limits. Folder loads into the table below.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 p-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <LabelWithTooltip tooltip="Folder containing images named like 123-0123.456.789.jpg. Click Load or the field to pick a folder. Only the button can change the folder.">Folder</LabelWithTooltip>
                <div className="flex gap-2">
                  <Input value={cfg.folderPath} readOnly placeholder="Click Load to pick folder" className="h-10 bg-transparent rounded-md cursor-pointer" onClick={handlePickFolder} />
                  <Button variant="outline" onClick={handlePickFolder} className="h-10"><FolderOpen className="mr-2 h-4 w-4" />Load</Button>
                </div>
              </div>
              {cfg.mode === 'auto' && (
                <div className="space-y-2">
                  <LabelWithTooltip tooltip="Template for message caption. Supports tokens: {id}, {phone}, {filename}, {name}, {index}, {total}. Leave blank for no caption.">Caption template</LabelWithTooltip>
                  <Input value={cfg.captionTemplate} onChange={(e) => setCfg({ ...cfg, captionTemplate: e.target.value })} placeholder="Hi {name} id {id}" className="h-10 bg-transparent rounded-md" />
                </div>
              )}
              <div className="space-y-2">
                <LabelWithTooltip tooltip="Minimum random delay (seconds) between sending each message to avoid spam detection.">Delay min (s)</LabelWithTooltip>
                <Input type="number" value={cfg.delayMinSec} onChange={(e) => setCfg({ ...cfg, delayMinSec: Number(e.target.value) })} className="h-10 bg-transparent rounded-md" />
              </div>
              <div className="space-y-2">
                <LabelWithTooltip tooltip="Maximum random delay (seconds) between messages. Actual delay is random between min and max.">Delay max (s)</LabelWithTooltip>
                <Input type="number" value={cfg.delayMaxSec} onChange={(e) => setCfg({ ...cfg, delayMaxSec: Number(e.target.value) })} className="h-10 bg-transparent rounded-md" />
              </div>
              <div className="space-y-2">
                <LabelWithTooltip tooltip="Maximum number of messages to send per day. Prevents over-sending and spam flags.">Daily cap</LabelWithTooltip>
                <Input type="number" value={cfg.dailyCap} onChange={(e) => setCfg({ ...cfg, dailyCap: Number(e.target.value) })} className="h-10 bg-transparent rounded-md" />
              </div>
              <div className="space-y-2">
                <LabelWithTooltip tooltip="How to send: debug = preview only (no send), confirm = show dialog before each send (you can edit caption), auto = send automatically using template.">Mode</LabelWithTooltip>
                <Select value={cfg.mode} onValueChange={(v) => setCfg({ ...cfg, mode: v as AppConfig['mode'] })}>
                  <SelectTrigger className="h-10 bg-transparent rounded-md"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="debug">debug</SelectItem>
                    <SelectItem value="confirm">confirm</SelectItem>
                    <SelectItem value="auto">auto</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <LabelWithTooltip tooltip="How long to wait (seconds) for QR scan before timing out.">Login timeout (s)</LabelWithTooltip>
                <Input type="number" value={cfg.loginTimeoutSec} onChange={(e) => setCfg({ ...cfg, loginTimeoutSec: Number(e.target.value) })} className="h-10 bg-transparent rounded-md" />
              </div>
              <div className="flex items-center gap-2 pt-6">
                <Checkbox id="force" checked={forceResend} onCheckedChange={(v) => setForceResend(v as boolean)} />
                <LabelWithTooltip tooltip="If checked, resend images even if they were already sent before (based on file hash).">Force resend</LabelWithTooltip>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={saveCfg}>Save config</Button>
              <Button variant="outline" onClick={handleScan}><Search className="mr-2 h-4 w-4" />Scan</Button>
              {running ? (
                <Button variant="outline" onClick={stopRun} className="border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Stop</Button>
              ) : (
                <Button onClick={startRun} disabled={tableItems.length === 0 || selectedKeys.size === 0} className="bg-primary hover:bg-primary/90"><ImageIcon className="mr-2 h-4 w-4" />Start run</Button>
              )}
            </div>
            {(running || progressInfo) && (
              <div className="rounded-lg border border-primary/20 bg-[#e3f2fd] p-3">
                <div className="flex justify-between text-sm">
                  <span className="font-medium">{progressInfo ? `${progressInfo.index}/${progressInfo.total}` : progress || 'Starting...'} {progressInfo ? `· ${progressInfo.phone} → ${progressInfo.status}` : ''}</span>
                  <span>{progressInfo ? `Remaining: ${progressInfo.total - progressInfo.index}` : ''}</span>
                </div>
                <Progress value={percent} className="mt-2 h-3" />
                {progressHistory.length > 0 && (
                  <details className="mt-2" open={running}>
                    <summary className="cursor-pointer text-xs">History ({progressHistory.length})</summary>
                    <div className="mt-2 max-h-[120px] overflow-auto text-xs">
                      {progressHistory.map((p, i) => (
                        <div key={i} className="flex gap-2 border-b border-primary/20 py-1">
                          <span className="min-w-[60px]">{p.index}/{p.total}</span>
                          <span className="min-w-[110px]">{p.phone}</span>
                          <span className={p.status === 'sent' ? 'text-green-600 font-semibold' : p.status === 'failed' ? 'text-red-600 font-semibold' : 'text-muted-foreground'}>{p.status}</span>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            )}
            <pre className="rounded-md bg-muted p-3 text-xs overflow-auto max-h-[160px]">{scanResult || 'no scan yet'}</pre>
            {lastReport && <pre className="rounded-md bg-green-50 p-3 text-xs overflow-auto max-h-[200px] border border-green-200">{lastReport}</pre>}
          </CardContent>
        </Card>

        {tableItems.length > 0 && (
          <Card className="bg-white shadow-sm">
            <CardHeader>
              <CardTitle>Images — {tableItems.length} found, {selectedKeys.size} selected</CardTitle>
              <CardDescription>Uncheck rows you don’t want to send. Only checked rows will be processed.</CardDescription>
            </CardHeader>
            <CardContent className="p-4">
              <div className="max-h-[300px] overflow-auto rounded-md border">
                <Table>
                  <TableHeader className="sticky top-0 bg-muted">
                    <TableRow>
                      <TableHead className="w-[36px]">
                        <Checkbox checked={selectedKeys.size === tableItems.length && tableItems.length > 0} onCheckedChange={(v) => { if (v) setSelectedKeys(new Set(tableItems.map((it) => it.key))); else setSelectedKeys(new Set()) }} />
                      </TableHead>
                      <TableHead>File name</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>ID</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tableItems.map((it) => {
                      const checked = selectedKeys.has(it.key)
                      return (
                        <TableRow key={it.key} data-state={checked ? 'selected' : undefined} className={checked ? '' : 'opacity-60'}>
                          <TableCell>
                            <Checkbox checked={checked} onCheckedChange={(v) => { const next = new Set(selectedKeys); if (v) next.add(it.key); else next.delete(it.key); setSelectedKeys(next) }} />
                          </TableCell>
                          <TableCell className="break-all">{it.files.map((f) => f.split(/[\\/]/).pop()).join(', ')}</TableCell>
                          <TableCell>{it.phone}</TableCell>
                          <TableCell>{it.id}</TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{selectedKeys.size} of {tableItems.length} selected — only checked rows will be sent.</p>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Logs</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <pre className="rounded-md bg-[#111] p-3 text-xs text-[#0f0] min-h-[80px] max-h-[250px] overflow-auto">{log.join('\n') || '(empty)'}</pre>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => navigator.clipboard.writeText(log.join('\n'))}>Copy logs</Button>
              <Button variant="outline" size="sm" onClick={async () => { const r = await window.api.debugGetLog(); setDebugLog(r.log); setDebugPath(r.path) }}>Load debug file</Button>
              <Button variant="outline" size="sm" onClick={async () => { await window.api.debugClearLog(); setDebugLog(''); setLog((l) => [...l, 'debug file cleared']) }}>Clear debug file</Button>
              <span className="self-center text-xs text-muted-foreground">{debugPath || 'debug.log in AppData/Roaming/zalo-auto/logs'}</span>
            </div>
            {debugLog && (
              <div>
                <p className="text-xs text-yellow-600">Debug file ({debugPath}):</p>
                <pre className="rounded-md bg-[#222] p-3 text-xs text-[#ff0] max-h-[200px] overflow-auto">{debugLog.slice(-8000) || '(empty)'}</pre>
              </div>
            )}
          </CardContent>
        </Card>

        <footer className="border-t pt-4 text-center text-xs text-muted-foreground/30 select-none" title={`zalo-auto v${appVersion || ''} · ${ping}`}>
          v{appVersion || '...'} · zalo-auto
        </footer>
      </div>

      <Dialog open={!!picker} onOpenChange={(o) => !o && setPicker(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Multiple matches for {picker?.phone}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {picker?.candidates.map((c) => (
              <Button key={c.index} variant="outline" className="w-full justify-start text-left h-auto py-2" onClick={() => { window.api.sendPickCandidateResponse(c.index); setPicker(null) }}>
                <span><strong>{c.name}</strong> {c.subtitle ? `— ${c.subtitle}` : ''}</span>
              </Button>
            ))}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { window.api.sendPickCandidateResponse('skip'); setPicker(null) }}>Skip</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent className="max-h-[90vh] overflow-auto sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>Confirm send</DialogTitle>
            <DialogDescription>Phone: {confirm?.phone} · Name: {confirm?.name ?? '-'}</DialogDescription>
          </DialogHeader>
          {confirmImages.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {confirmImages.map((img, idx) => (
                <img
                  key={idx}
                  src={img.src}
                  alt={img.name}
                  title={`${img.name} — click to enlarge`}
                  onClick={() => setGalleryImage(img.src)}
                  className="h-[120px] w-[120px] cursor-pointer rounded-lg border object-cover"
                />
              ))}
            </div>
          )}
          <div className="space-y-2">
            <Label>Caption (leave blank to send image only)</Label>
            <Textarea value={confirmEditCaption} onChange={(e) => setConfirmEditCaption(e.target.value)} rows={3} placeholder="Type caption or leave blank" />
          </div>
          <p className="break-all text-xs text-muted-foreground">{confirm?.files?.length} file(s)</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => { window.api.sendConfirmSendResponse('skip'); setConfirm(null) }}>Skip</Button>
            <Button onClick={() => { window.api.sendConfirmSendResponse('send', confirmEditCaption); setConfirm(null) }} className="bg-green-600 hover:bg-green-700">Send</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {galleryImage && (
        <div onClick={() => setGalleryImage(null)} className="fixed inset-0 z-[10000] flex cursor-zoom-out items-center justify-center bg-black/85 p-5">
          <img src={galleryImage} alt="preview" className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain shadow-xl" />
        </div>
      )}
    </div>
  )
}
