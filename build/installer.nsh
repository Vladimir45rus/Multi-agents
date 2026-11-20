; Installer override: the stock NSIS check politely asks a running copy to
; close itself and gives up if the process has no window (our app can sit
; headless while its embedded server starts). Users saw "Не удалось закрыть
; Multi-Agent Code Studio" even with no process in Task Manager, so we replace
; the check with a hard, silent cleanup of any leftover copy.
!macro customCheckAppRunning
  DetailPrint "Закрываю предыдущую версию (если запущена)..."
  nsExec::Exec 'taskkill /IM "${APP_EXECUTABLE_FILENAME}" /T /F'
  Pop $0
  Sleep 1200
  ; Give the file locks a moment to disappear before files are replaced.
  nsExec::Exec 'cmd /c ping 127.0.0.1 -n 2 > nul'
  Pop $0
!macroend
