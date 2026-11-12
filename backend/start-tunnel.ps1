param([switch]$ResetToken,[switch]$Background,[ValidateSet('auto','http2','quic')][string]$Protocol='auto')
$ErrorActionPreference='Stop'
$tunnelCommand=Get-Command cloudflared -ErrorAction SilentlyContinue
$tunnelExecutable=if($tunnelCommand){$tunnelCommand.Source}else{Join-Path $env:LOCALAPPDATA 'growgame-tools\cloudflared.exe'}
if(-not (Test-Path -LiteralPath $tunnelExecutable)){throw 'cloudflared를 서버 노트북에 먼저 설치하고 새 PowerShell 창에서 실행하세요.'}
$info=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'tunnel-info.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$tokenPath=Join-Path $env:LOCALAPPDATA 'growgame-server\tunnel-token.clixml'
if($ResetToken -or -not (Test-Path -LiteralPath $tokenPath)) {
  Write-Host ('Cloudflare 대시보드 → Networking → Tunnels → '+$info.name+' → Add a replica에서 토큰을 확인하세요.')
  $secureToken=Read-Host '해당 Tunnel의 토큰을 붙여넣으세요 (입력은 숨겨집니다)' -AsSecureString
  if($secureToken.Length -eq 0){throw '토큰이 입력되지 않았습니다.'}
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $tokenPath) | Out-Null
  $secureToken | Export-Clixml -LiteralPath $tokenPath
}
$savedToken=Import-Clixml -LiteralPath $tokenPath
$previousToken=$env:TUNNEL_TOKEN
try {
  # DPAPI로 저장한 토큰을 현재 사용자만 복호화합니다. 명령행 인수에 노출하지 않습니다.
  $env:TUNNEL_TOKEN=([System.Net.NetworkCredential]::new('', $savedToken)).Password
  Write-Host ('연결 중: https://'+$info.hostname+' → '+$info.origin)
  if($Background) {
    $logDirectory=Split-Path -Parent $tokenPath
    return Start-Process -FilePath $tunnelExecutable -ArgumentList @('tunnel','--protocol',$Protocol,'run') -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $logDirectory 'tunnel-output.log') -RedirectStandardError (Join-Path $logDirectory 'tunnel-error.log')
  }
  & $tunnelExecutable tunnel --protocol $Protocol run
  $tunnelExitCode=$LASTEXITCODE
} finally {
  $env:TUNNEL_TOKEN=$previousToken
  $savedToken.Dispose()
}
exit $tunnelExitCode
