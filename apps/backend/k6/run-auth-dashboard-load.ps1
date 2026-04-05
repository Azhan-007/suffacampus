param(
  [string]$BaseUrl = "http://localhost:5000",
  [string]$SchoolCode = "DEMO01",
  [string]$Username = "teacher_demo",
  [string]$AuthToken = "",
  [string]$SchoolId = ""
)

$env:BASE_URL = $BaseUrl
$env:SCHOOL_CODE = $SchoolCode
$env:USERNAME = $Username
$env:AUTH_TOKEN = $AuthToken
$env:SCHOOL_ID = $SchoolId

Write-Host "Running k6 auth+dashboard profile"
Write-Host "BASE_URL=$($env:BASE_URL) SCHOOL_CODE=$($env:SCHOOL_CODE) USERNAME=$($env:USERNAME)"

$k6Path = (Get-Command k6 -ErrorAction SilentlyContinue).Source
if (-not $k6Path) {
  $fallback = "C:\Program Files\k6\k6.exe"
  if (Test-Path $fallback) {
    $k6Path = $fallback
  } else {
    throw "k6 executable was not found in PATH or fallback location."
  }
}

& $k6Path run k6/login-dashboard.js
