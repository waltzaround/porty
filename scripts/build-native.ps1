$ErrorActionPreference = 'Stop'
$project = Split-Path $PSScriptRoot -Parent
$sources = @((Join-Path $project 'electron/native/UsbPorts.cs'), (Join-Path $project 'electron/native/DisplayPaths.cs'))
Add-Type -Path $sources -OutputAssembly (Join-Path $project 'build/native/Porty.Native.dll') -ErrorAction Stop
