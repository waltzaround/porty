param([Parameter(Mandatory=$true)][string]$Version)
$ErrorActionPreference = 'Stop'
$files = @('release/win-unpacked/Porty.exe', "release/Porty Setup $Version.exe", "release/Porty $Version.exe")
foreach ($file in $files) {
    $signature = Get-AuthenticodeSignature -LiteralPath $file
    if ($signature.Status -ne 'Valid') { throw "Missing or invalid signature on $file" }
}
Write-Output 'All Windows release signatures are valid.'
