param([switch]$ChooseFolder)
$ErrorActionPreference='Stop'
$settingsPath=Join-Path $env:LOCALAPPDATA 'growgame-server\config.json'
if($ChooseFolder -or -not (Test-Path -LiteralPath $settingsPath)) {
  Add-Type -AssemblyName System.Windows.Forms
  $picker=New-Object System.Windows.Forms.FolderBrowserDialog
  $picker.Description='게임 데이터베이스를 저장할 로컬 폴더를 선택하세요. Google Drive 등 동기화 폴더는 피해주세요.'
  $picker.ShowNewFolderButton=$true
  if($picker.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK){$picker.Dispose();return}
  $selectedDirectory=[IO.Path]::GetFullPath($picker.SelectedPath)
  $picker.Dispose()
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $settingsPath) | Out-Null
  @{dataDirectory=$selectedDirectory} | ConvertTo-Json | Set-Content -LiteralPath $settingsPath -Encoding UTF8
}
$settings=Get-Content -LiteralPath $settingsPath -Raw -Encoding UTF8 | ConvertFrom-Json
if(-not (Test-Path -LiteralPath $settings.dataDirectory -PathType Container)){throw '저장 폴더를 찾지 못했습니다. -ChooseFolder 옵션으로 다시 선택하세요.'}
$env:GROWGAME_DATA_DIR=$settings.dataDirectory
# 배포 시 FRONTEND_ORIGINS에 프론트의 https 주소를 설정합니다.
& node (Join-Path $PSScriptRoot 'server.cjs')
exit $LASTEXITCODE
