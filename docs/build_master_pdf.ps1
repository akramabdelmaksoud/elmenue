# Rebuilds docs\elmenue_Luxury_Master_Plan.pdf from the HTML master plan using headless Edge.
# Usage: powershell -ExecutionPolicy Bypass -File docs\build_master_pdf.ps1
$ErrorActionPreference = 'Stop'
$docs = Split-Path -Parent $MyInvocation.MyCommand.Path
$html = Join-Path $docs 'elmenue_Luxury_Master_Plan.html'
$pdf  = Join-Path $docs 'elmenue_Luxury_Master_Plan.pdf'
$prof = 'A:\Apps and Compilers\_work\tmp\edgeprof'
$edge = @("${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe", "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $edge) { throw 'Microsoft Edge not found' }
if (-not (Test-Path $html)) { throw "Missing $html" }
New-Item -ItemType Directory -Force $prof | Out-Null
$uri = ([System.Uri]$html).AbsoluteUri
if (Test-Path $pdf) { Remove-Item $pdf -Force }
$argList = @('--headless=new', '--disable-gpu', '--no-pdf-header-footer', '--virtual-time-budget=8000', "--user-data-dir=`"$prof`"", "--print-to-pdf=`"$pdf`"", "`"$uri`"")
Start-Process -FilePath $edge -ArgumentList $argList -Wait -NoNewWindow -RedirectStandardError (Join-Path $prof 'edge-stderr.txt')
Start-Sleep -Seconds 2
if (-not (Test-Path $pdf)) { throw 'PDF was not created' }
"{0} bytes -> {1}" -f (Get-Item $pdf).Length, $pdf
