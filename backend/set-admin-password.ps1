$ErrorActionPreference='Stop'
$secret=Read-Host '관리자 비밀번호 (숫자 4~64자리)' -AsSecureString
$pointer=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
try {
  [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) | & node (Join-Path $PSScriptRoot 'set-admin-password.cjs')
  if($LASTEXITCODE -ne 0){throw '관리자 비밀번호를 저장하지 못했습니다.'}
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  $secret.Dispose()
}
