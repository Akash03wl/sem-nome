# Teste do app instalado: instala pelo instalador, abre o Vitra e confere que ele funciona.
$ErrorActionPreference = "Stop"

$setup = Get-ChildItem "target/release/bundle/nsis/*.exe" | Select-Object -First 1
if (-not $setup) { throw "instalador não encontrado" }
Write-Host "Instalando $($setup.Name) em modo silencioso…"
Start-Process $setup.FullName -ArgumentList "/S" -Wait

$exe = @(
  (Join-Path $env:LOCALAPPDATA "Vitra\vitra.exe"),
  (Join-Path $env:LOCALAPPDATA "Programs\Vitra\vitra.exe")
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $exe) {
  $exe = (Get-ChildItem $env:LOCALAPPDATA -Recurse -Filter "vitra.exe" -ErrorAction SilentlyContinue | Select-Object -First 1).FullName
}
if (-not $exe) { throw "vitra.exe não foi instalado" }
Write-Host "Instalado em $exe"

$log = Join-Path $env:RUNNER_TEMP "vitra-smoke.txt"
Remove-Item $log -ErrorAction SilentlyContinue
$env:VITRA_SMOKE_FILE = $log

$app = Start-Process $exe -PassThru
$deadline = (Get-Date).AddSeconds(90)
do {
  Start-Sleep -Seconds 2
  $text = if (Test-Path $log) { Get-Content $log -Raw } else { "" }
  $ok = ($text -match "ready:quick") -and ($text -match "ready:panel") -and ($text -match "apps:\d+")
} until ($ok -or $app.HasExited -or (Get-Date) -gt $deadline)

Write-Host "---- diário do Vitra ----"
if (Test-Path $log) { Get-Content $log }
Write-Host "-------------------------"

if ($app.HasExited) { throw "o Vitra fechou sozinho (código $($app.ExitCode))" }
if (-not ($text -match "ready:quick")) { throw "a janela do pop-up não carregou" }
if (-not ($text -match "ready:panel")) { throw "a janela do painel não carregou" }
if (-not ($text -match "apps:(\d+)") -or [int]$Matches[1] -lt 1) { throw "nenhum programa encontrado" }
Write-Host "✔ janelas carregaram e $($Matches[1]) programas foram encontrados"

$run = Get-ItemProperty "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run" -ErrorAction SilentlyContinue
if (-not ($run.PSObject.Properties.Name -match "Vitra")) { throw "o Vitra não se registrou para abrir com o Windows" }
Write-Host "✔ registrado para abrir com o Windows"

$second = Start-Process $exe -PassThru
Start-Sleep -Seconds 10
if (-not $second.HasExited) { throw "uma segunda cópia do Vitra ficou aberta" }
if ($app.HasExited) { throw "a primeira cópia fechou quando a segunda foi aberta" }
Write-Host "✔ instância única funciona"

Stop-Process -Id $app.Id -Force

$dir = Split-Path $exe
foreach ($f in @("Everything64.dll", "Everything-SDK-LICENSE.txt")) {
  if (-not (Test-Path (Join-Path $dir $f))) { throw "$f não foi instalado junto com o Vitra" }
}
Write-Host "✔ DLL e licença do Everything instaladas"
Write-Host "---- Everything-SDK-LICENSE.txt ----"
Get-Content (Join-Path $dir "Everything-SDK-LICENSE.txt")
Write-Host "------------------------------------"
Write-Host "✔ teste do app instalado passou"
