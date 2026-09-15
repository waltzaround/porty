$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$warnings = @()
$assembly = Join-Path $PSScriptRoot 'Porty.Native.dll'
$assemblyLoaded = $false
if (Test-Path -LiteralPath $assembly) {
    try { Add-Type -Path $assembly; $assemblyLoaded = $true }
    catch { $warnings += 'The native hardware helper could not be loaded.' }
}
$usb = $null
try {
    if (!$assemblyLoaded) { Add-Type -Path (Join-Path $PSScriptRoot 'UsbPorts.cs') }
    $usb = [PortyUsb]::Scan()
} catch { $warnings += 'Native USB queries failed. Windows policy or a hub driver may prevent access.' }
$displays = $null
try {
    if (!$assemblyLoaded) { Add-Type -Path (Join-Path $PSScriptRoot 'DisplayPaths.cs') }
    $displays = [PortyDisplays]::Scan()
} catch { $warnings += 'Active display queries failed. Windows policy, the graphics driver, or a remote session may prevent access.' }
$machine = Get-CimInstance Win32_ComputerSystem | Select-Object Manufacturer, Model
$os = Get-CimInstance Win32_OperatingSystem | Select-Object Caption, Version
$cpu = Get-CimInstance Win32_Processor | Select-Object -First 1 Name
$connectors = @()
$devices = @()
try { $connectors = @(Get-CimInstance Win32_PortConnector | Select-Object ExternalReferenceDesignator, ExternalConnectorType, PortType) } catch { $warnings += 'Firmware connector inventory is unavailable.' }
try { $devices = @(Get-CimInstance Win32_PnPEntity -Filter "PNPDeviceID LIKE 'USB%'" | Where-Object { $_.ConfigManagerErrorCode -eq 0 } | Select-Object Name, PNPDeviceID) } catch { $warnings += 'Connected USB device names are unavailable.' }
@{ machine = $machine; os = $os; cpu = $cpu; usb = $usb; displays = $displays; connectors = $connectors; devices = $devices; warnings = $warnings } | ConvertTo-Json -Depth 10 -Compress
