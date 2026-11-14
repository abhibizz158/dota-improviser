Unicode true
Name "Dota Improviser"
OutFile "${OUTPUT_FILE}"
InstallDir "$LOCALAPPDATA\Programs\Dota Improviser"
RequestExecutionLevel user
SetCompressor /SOLID lzma
!include "LogicLib.nsh"
!include "MUI2.nsh"
!define MUI_ABORTWARNING
!insertmacro MUI_PAGE_LICENSE "${__FILEDIR__}\..\LICENSE"
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"

Section
  SetShellVarContext current
  Sleep 1500
  SetOutPath "$INSTDIR"
  SetOverwrite on
  ClearErrors
  File /r "${APP_DIR}\*.*"
  ${If} ${Errors}
    MessageBox MB_ICONSTOP "Close Dota Improviser before installing, then run this installer again."
    SetErrorLevel 1
    Abort
  ${EndIf}
  CreateShortCut "$SMPROGRAMS\Dota Improviser.lnk" "$INSTDIR\Dota Improviser.exe"
SectionEnd
