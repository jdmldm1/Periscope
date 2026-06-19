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

Write-Host "Building frontend..."
Push-Location frontend
npm run build
Pop-Location

function Build-Connected {
    Write-Host "Building Connected docker image..."
    docker build --build-arg CACHE_GRYPE_DB=false -t ghcr.io/jdmldm1/periscope-kubernetes:1.1.3-connected .

    Write-Host "Creating Connected Zarf package..."
    if (Test-Path .\zarf-package-periscope-amd64-1.1.3.tar.zst) {
        Remove-Item .\zarf-package-periscope-amd64-1.1.3.tar.zst -Force
    }
    Invoke-Zarf package create --confirm
}

function Build-Airgap {
    Write-Host "Building Airgap docker image..."
    docker build --build-arg CACHE_GRYPE_DB=true -t ghcr.io/jdmldm1/periscope-kubernetes:1.1.3 .

    Write-Host "Creating Airgap Zarf package..."
    if (Test-Path .\zarf-package-periscope-airgap-amd64-1.1.3.tar.zst) {
        Remove-Item .\zarf-package-periscope-airgap-amd64-1.1.3.tar.zst -Force
    }

    # Temporarily swap manifests for Airgap
    Rename-Item -Path "zarf.yaml" -NewName "zarf-connected.tmp"
    try {
        Copy-Item -Path "zarf-airgap.yaml" -Destination "zarf.yaml"
        Invoke-Zarf package create --confirm
    }
    finally {
        if (Test-Path "zarf.yaml") {
            Remove-Item -Path "zarf.yaml" -Force
        }
        Rename-Item -Path "zarf-connected.tmp" -NewName "zarf.yaml"
    }
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
    Build-Connected
    Ensure-ZarfInit
    Write-Host "Deploying Connected Zarf package..."
    Invoke-Zarf package deploy .\zarf-package-periscope-amd64-1.1.3.tar.zst --confirm

    Write-Host "Restarting deployment..."
    kubectl rollout restart deployment periscope -n periscope
}
elseif ($Mode -eq "Airgap") {
    Build-Airgap
    Ensure-ZarfInit
    Write-Host "Deploying Airgap Zarf package..."
    Invoke-Zarf package deploy .\zarf-package-periscope-airgap-amd64-1.1.3.tar.zst --confirm

    Write-Host "Restarting deployment..."
    kubectl rollout restart deployment periscope -n periscope
}
elseif ($Mode -eq "Both") {
    Build-Connected
    Build-Airgap
    Write-Host "Finished compiling both Connected and Airgap Zarf packages."
}
