$ErrorActionPreference = "Stop"

Write-Host "Building frontend..."
Push-Location frontend
npm run build > $null
Pop-Location

Write-Host "Building docker image..."
docker build -t ghcr.io/jdmldm1/periscope-kubernetes:1.0.0 . > $null

Write-Host "Creating Zarf package..."
if (Test-Path .\zarf-package-periscope-amd64-1.0.0.tar.zst) {
    Remove-Item .\zarf-package-periscope-amd64-1.0.0.tar.zst -Force
}
zarf package create --skip-sbom --confirm > $null

Write-Host "Deploying Zarf package..."
zarf package deploy .\zarf-package-periscope-amd64-1.0.0.tar.zst --confirm > $null

Write-Host "Restarting deployment..."
kubectl rollout restart deployment periscope -n periscope > $null

Write-Host "Done!"
