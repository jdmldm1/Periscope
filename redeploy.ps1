[CmdletBinding()]
param (
    [Parameter()]
    [ValidateSet("Airgap", "Connected", "Both")]
    [string]$Mode = "Airgap"
)

$ErrorActionPreference = "Stop"

Write-Host "Building frontend..."
Push-Location frontend
npm run build > $null
Pop-Location

function Build-Airgap {
    Write-Host "Building Airgap docker image..."
    docker build --build-arg CACHE_GRYPE_DB=true -t ghcr.io/jdmldm1/periscope-kubernetes:1.0.1 . > $null

    Write-Host "Creating Airgap Zarf package..."
    if (Test-Path .\zarf-package-periscope-amd64-1.0.1.tar.zst) {
        Remove-Item .\zarf-package-periscope-amd64-1.0.1.tar.zst -Force
    }
    zarf package create --confirm > $null
}

function Build-Connected {
    Write-Host "Building Connected docker image..."
    docker build --build-arg CACHE_GRYPE_DB=false -t ghcr.io/jdmldm1/periscope-kubernetes:1.0.1-connected . > $null

    Write-Host "Creating Connected Zarf package..."
    if (Test-Path .\zarf-package-periscope-connected-amd64-1.0.1.tar.zst) {
        Remove-Item .\zarf-package-periscope-connected-amd64-1.0.1.tar.zst -Force
    }
    
    # Temporarily swap manifests
    Rename-Item -Path "zarf.yaml" -NewName "zarf-airgap.tmp"
    try {
        Copy-Item -Path "zarf-connected.yaml" -Destination "zarf.yaml"
        zarf package create --confirm > $null
    }
    finally {
        if (Test-Path "zarf.yaml") {
            Remove-Item -Path "zarf.yaml" -Force
        }
        Rename-Item -Path "zarf-airgap.tmp" -NewName "zarf.yaml"
    }
}

if ($Mode -eq "Airgap") {
    Build-Airgap
    Write-Host "Deploying Airgap Zarf package..."
    zarf package deploy .\zarf-package-periscope-amd64-1.0.1.tar.zst --confirm > $null
    
    Write-Host "Restarting deployment..."
    kubectl rollout restart deployment periscope -n periscope > $null
}
elseif ($Mode -eq "Connected") {
    Build-Connected
    Write-Host "Deploying Connected Zarf package..."
    zarf package deploy .\zarf-package-periscope-connected-amd64-1.0.1.tar.zst --confirm > $null
    
    Write-Host "Restarting deployment..."
    kubectl rollout restart deployment periscope -n periscope > $null
}
elseif ($Mode -eq "Both") {
    Build-Airgap
    Build-Connected
    Write-Host "Finished compiling both Airgap and Connected Zarf packages."
}
