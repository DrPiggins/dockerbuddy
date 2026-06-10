; DockerBuddy — per-context Windows installer
; One .exe that installs DockerBuddy on the Windows host,
; bootstraps the SSH server, and pre-pairs to this Mac.
;
; Template vars (substituted at build time on the Mac):
;   {{CONTEXT_NAME}}   — Docker context name
;   {{OUTPUT_EXE}}     — absolute path the wrapper .exe will be written to
;   {{PS1_PATH}}       — absolute path to the rendered windows-setup.ps1
;   {{WIN_EXE}}        — absolute path to the prebuilt DockerBuddy-Windows-<arch>.exe
;   {{PAIRED_JSON}}    — absolute path to the rendered paired.json
;   {{NSI_NAME}}       — display name shown in title bar / installer chrome

!include "MUI2.nsh"

Name "{{NSI_NAME}}"
OutFile "{{OUTPUT_EXE}}"
Unicode True
RequestExecutionLevel admin
InstallDir "$TEMP\DockerBuddy"
ShowInstDetails show
BrandingText "DockerBuddy"

; Disable CRC self-check. Windows Defender/SmartScreen mutates unsigned .exes
; after download (Zone.Identifier ADS, AV stamping), which invalidates the
; CRC NSIS embeds at build time. Without this, downloads frequently fail
; "Installer integrity check has failed" on first run.
CRCCheck off

!define MUI_ABORTWARNING
!define MUI_WELCOMEPAGE_TITLE "DockerBuddy setup"
!define MUI_WELCOMEPAGE_TEXT "This will install DockerBuddy on this PC and pair it with your Mac.$\r$\n$\r$\nContext: {{CONTEXT_NAME}}$\r$\nSSH port: {{SSH_PORT}}$\r$\n$\r$\nWhat happens next:$\r$\n  • Install DockerBuddy$\r$\n  • Install Windows OpenSSH Server$\r$\n  • Configure sshd on port {{SSH_PORT}}$\r$\n  • Open TCP/{{SSH_PORT}} in the firewall$\r$\n  • Authorize your Mac's SSH key$\r$\n  • Save pairing details so DockerBuddy launches paired$\r$\n$\r$\nClick Next, then Install."
!define MUI_FINISHPAGE_TITLE "All set."
!define MUI_FINISHPAGE_TEXT "DockerBuddy is installed and paired. Launch it from the Start menu. Make sure Docker Desktop is installed and running so DockerBuddy has something to drive."
!define MUI_FINISHPAGE_NOAUTOCLOSE
!define MUI_FINISHPAGE_RUN "$APPDATA\DockerBuddy\Launch.lnk"
!define MUI_FINISHPAGE_RUN_TEXT "Launch DockerBuddy now"

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_LANGUAGE "English"

Section "Install"
  SetOutPath "$PLUGINSDIR"
  File /oname=dockerbuddy-windows.exe "{{WIN_EXE}}"
  File /oname=dockerbuddy-setup.ps1   "{{PS1_PATH}}"
  File /oname=paired.json             "{{PAIRED_JSON}}"

  ; 1. Pre-place the pairing config so DockerBuddy picks it up on first launch
  DetailPrint "Saving pairing config..."
  CreateDirectory "$APPDATA\DockerBuddy"
  CopyFiles /SILENT "$PLUGINSDIR\paired.json" "$APPDATA\DockerBuddy\paired.json"

  ; 2. Install DockerBuddy silently
  DetailPrint "Installing DockerBuddy..."
  ExecWait '"$PLUGINSDIR\dockerbuddy-windows.exe" /S' $0
  DetailPrint "DockerBuddy installer exited with code $0"

  ; 3. SSH server + firewall + key authorization via PowerShell.
  ; PS1 renders a WPF dialog; -WindowStyle Hidden suppresses the PowerShell console.
  DetailPrint "Bootstrapping SSH server..."
  ExecWait 'powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "$PLUGINSDIR\dockerbuddy-setup.ps1"' $1
  DetailPrint "PowerShell exited with code $1"

  IntCmp $1 0 done
    DetailPrint "SSH setup did not complete cleanly. Scroll up for details."
  done:
SectionEnd
