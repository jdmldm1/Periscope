[CmdletBinding()]
param (
    [Parameter()]
    [ValidateSet("Airgap", "Connected", "Both")]
    [string]$Mode = "Connected"
)

$ErrorActionPreference = "Stop"

Write-Host "Building frontend..."
Push-Location frontend
npm run build
Pop-Location

function Build-Connected {
    Write-Host "Building Connected docker image..."
    docker build --build-arg CACHE_GRYPE_DB=false -t ghcr.io/jdmldm1/periscope-kubernetes:1.0.3-connected .

    Write-Host "Creating Connected Zarf package..."
    if (Test-Path .\zarf-package-periscope-amd64-1.0.3.tar.zst) {
        Remove-Item .\zarf-package-periscope-amd64-1.0.3.tar.zst -Force
    }
    # zarf.yaml is now Connected by default
    zarf package create --confirm
}

function Build-Airgap {
    Write-Host "Building Airgap docker image..."
    docker build --build-arg CACHE_GRYPE_DB=true -t ghcr.io/jdmldm1/periscope-kubernetes:1.0.3 .

    Write-Host "Creating Airgap Zarf package..."
    if (Test-Path .\zarf-package-periscope-airgap-amd64-1.0.3.tar.zst) {
        Remove-Item .\zarf-package-periscope-airgap-amd64-1.0.3.tar.zst -Force
    }
    
    # Temporarily swap manifests for Airgap
    Rename-Item -Path "zarf.yaml" -NewName "zarf-connected.tmp"
    try {
        Copy-Item -Path "zarf-airgap.yaml" -Destination "zarf.yaml"
        zarf package create --confirm
    }
    finally {
        if (Test-Path "zarf.yaml") {
            Remove-Item -Path "zarf.yaml" -Force
        }
        Rename-Item -Path "zarf-connected.tmp" -NewName "zarf.yaml"
    }
}

if ($Mode -eq "Connected") {
    Build-Connected
    Write-Host "Deploying Connected Zarf package..."
    zarf package deploy .\zarf-package-periscope-amd64-1.0.3.tar.zst --confirm
    
    Write-Host "Restarting deployment..."
    kubectl rollout restart deployment periscope -n periscope
}
elseif ($Mode -eq "Airgap") {
    Build-Airgap
    Write-Host "Deploying Airgap Zarf package..."
    zarf package deploy .\zarf-package-periscope-airgap-amd64-1.0.2.tar.zst --confirm
    
    Write-Host "Restarting deployment..."
    kubectl rollout restart deployment periscope -n periscope
}
elseif ($Mode -eq "Both") {
    Build-Connected
    Build-Airgap
    Write-Host "Finished compiling both Connected and Airgap Zarf packages."
}
