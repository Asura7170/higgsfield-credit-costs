# Refreshes public/higgsfield-costs.json from the higgsfield CLI.
# Re-run: powershell -ExecutionPolicy Bypass -File scripts/fetch-higgsfield-costs.ps1
# Requires: higgsfield CLI authenticated (`higgsfield account status` must succeed).
# 5.1-compatible syntax (works on Windows PowerShell 5.1 and pwsh 7+).
# ponytail: flat hashtable config, no functions/params - edit enums below after `higgsfield model get <id>`.

$ErrorActionPreference = "Stop"

if (-not (Get-Command "higgsfield" -ErrorAction SilentlyContinue)) {
  Write-Error "higgsfield CLI not found on PATH. Install it, run 'higgsfield auth login', then re-run this script."
}

$status = & higgsfield account status 2>&1
if ($LASTEXITCODE -ne 0) {
  Write-Error "Not authenticated. Run 'higgsfield auth login' first. Details: $status"
}

# Per-model enums from `higgsfield model get <id>` (verified 2026-09-13).
# grok_image/nano_banana_pro have no --quality param; grok_image tiers go through --mode.
$models = [ordered]@{
  "gpt_image_2_5"   = @{ resolutions = @("1k", "2k", "4k"); qualities = @("low", "medium", "high", "xhigh", "max") }
  "grok_image"      = @{ resolutions = @("1k", "2k"); modes = [ordered]@{ standard = "std"; quality = "quality" } }
  "grok_image_2_0"  = @{ resolutions = @("1k", "2k"); qualities = @("low", "medium") }
  "nano_banana_pro" = @{ resolutions = @("1k", "2k", "4k"); noQuality = $true }
}

$out = [ordered]@{
  updatedAt    = (Get-Date).ToUniversalTime().ToString("o")
  aspect_ratio = "1:1"
  models       = [ordered]@{}
}
$failures = 0
$total = 0

foreach ($id in $models.Keys) {
  $resolutions = $models[$id].resolutions
  # ponytail: noQuality models get one "default" row; modes models map rows to --mode values.
  $noQuality = $models[$id].noQuality -eq $true
  $modes = $models[$id].modes
  # ponytail: plain assignment keeps single rows an array; if-as-expression would unwrap to a string.
  if ($modes) { $qualities = @($modes.Keys) } elseif ($noQuality) { $qualities = @("default") } else { $qualities = $models[$id].qualities }
  $matrix = [ordered]@{}
  foreach ($q in $qualities) { $matrix[$q] = [ordered]@{} }
  foreach ($r in $resolutions) {
    foreach ($q in $qualities) {
      $total++
      try {
        $costArgs = @("generate", "cost", $id, "--prompt", "test", "--resolution", $r, "--aspect_ratio", "1:1", "--json")
        if ($modes) { $costArgs += @("--mode", $modes[$q]) } elseif (-not $noQuality) { $costArgs += @("--quality", $q) }
        $raw = & higgsfield @costArgs 2>&1
        if ($LASTEXITCODE -ne 0) { throw $raw }
        $parsed = $raw | ConvertFrom-Json
        $matrix[$q][$r] = $parsed.credits
      } catch {
        $failures++
        Write-Warning "[$id][$q][$r] failed: $_"
      }
    }
  }
  $out.models[$id] = [ordered]@{ resolutions = $resolutions; qualities = $qualities; matrix = $matrix }
}

$target = Join-Path $PSScriptRoot "..\\public\\higgsfield-costs.json"
$json = $out | ConvertTo-Json -Depth 6
[IO.File]::WriteAllText($target, $json, [Text.UTF8Encoding]::new($false))

Write-Output "Wrote $target - $($total - $failures)/$total combos ok, $failures failed. Reload the page to see updatedAt change."
