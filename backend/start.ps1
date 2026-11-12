param([switch]$ChooseFolder,[switch]$LocalOnly,[ValidateSet('auto','http2','quic')][string]$Protocol='auto')
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
$port=if($env:PORT){[int]$env:PORT}else{8787}
if(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue){throw "포트 $port 에 서버가 이미 실행 중입니다. 중복 실행하지 않습니다."}
if(-not $LocalOnly -and $port -ne 8787){throw '도메인 연결에는 8787 포트를 사용하세요. 별도 로컬 테스트는 -LocalOnly를 사용하세요.'}
$tunnelProcess=$null
try {
  if(-not $LocalOnly){
    $tunnelProcess=& (Join-Path $PSScriptRoot 'start-tunnel.ps1') -Background -Protocol $Protocol
    Write-Host '게임 주소: https://cropgrow.sangsangbar.com (이 컴퓨터의 DB에 연결)'
  }
  & node (Join-Path $PSScriptRoot 'server.cjs')
  $serverExitCode=$LASTEXITCODE
} finally {
  if($tunnelProcess -and -not $tunnelProcess.HasExited){Stop-Process -Id $tunnelProcess.Id -ErrorAction SilentlyContinue}
}
exit $serverExitCode
