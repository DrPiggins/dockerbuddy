; electron-builder NSIS hooks
;
; CRCCheck off — fixes "Installer integrity check has failed" on the
; uninstaller. Windows Defender / SmartScreen frequently mutates unsigned
; .exes after install (stamping, Zone.Identifier ADS), which invalidates
; the CRC that NSIS embeds at build time. Until DockerBuddy is code-signed,
; turning the check off is the only way users can uninstall reliably.

!macro customHeader
  CRCCheck off
!macroend
