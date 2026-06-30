[CmdletBinding()]
param (
    [Parameter()]
    [ValidateSet("Airgap", "Connected", "Both")]
    [string]$Mode = "Connected",

    [Parameter()]
    [switch]$Nuke
)

$ErrorActionPreference = "Stop"

$zarfExe = "C:\Users\Owner\code\code\zarf.exe"
function Invoke-Zarf { & $zarfExe @args }

if ($Nuke) {
    Write-Host "Current k3d clusters:"
    k3d cluster list

    Write-Host "Deleting all k3d clusters..."
    k3d cluster delete --all
    Write-Host "All clusters deleted."

    Write-Host "Recreating k3d cluster..."
    k3d cluster create --port "30080:30080@loadbalancer"
    Write-Host "Cluster created."

    Write-Host "Running zarf init..."
    $zarfCache = "$env:USERPROFILE\.zarf-cache"
    if (Test-Path $zarfCache) {
        Write-Host "Clearing zarf cache to avoid corrupted package errors..."
        Remove-Item $zarfCache -Recurse -Force
    }
    Invoke-Zarf init --set K3S_ARGS=""
    Write-Host "Zarf initialized. Cluster ready."
}





function Ensure-ZarfInit {
    $prev = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    kubectl get secret zarf-state -n zarf 2>&1 | Out-Null
    $missing = $LASTEXITCODE -ne 0
    $ErrorActionPreference = $prev

    if ($missing) {
        Write-Host "Zarf not initialized - running zarf init..."
        Invoke-Zarf init --set K3S_ARGS="" --confirm
    }
}

if ($Mode -eq "Connected") {
    
    Ensure-ZarfInit
    Write-Host "Deploying Connected Zarf package..."
    zarf package deploy oci://ghcr.io/jdmldm1/packages/periscope:1.3.0 --confirm
    Write-Host "Restarting deployment..."
    kubectl rollout restart deployment periscope -n periscope
}
elseif ($Mode -eq "Airgap") {
    Ensure-ZarfInit
    Write-Host "Deploying Airgap Zarf package..."
    zarf package deploy oci://ghcr.io/jdmldm1/packages/periscope-airgap:1.3.0 --confirm
    Write-Host "Restarting deployment..."
    kubectl rollout restart deployment periscope -n periscope
}
