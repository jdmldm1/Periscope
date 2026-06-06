# Get all configured remotes
$remotes = git remote

if ($remotes.Count -eq 0) {
    Write-Host "No git remotes configured for this repository." -ForegroundColor Yellow
    exit 0
}

# Get current branch
$branch = git branch --show-current

if ([string]::IsNullOrEmpty($branch)) {
    Write-Host "Could not determine current git branch. Ensure you are inside a git repository." -ForegroundColor Red
    exit 1
}

Write-Host "Pushing current branch '$branch' to all configured remotes..." -ForegroundColor Cyan

foreach ($remote in $remotes) {
    $remote = $remote.Trim()
    if ($remote) {
        Write-Host "-> Pushing to remote '$remote'..." -ForegroundColor Blue
        # Run git push, forwarding any arguments passed to this script
        git push $remote $branch $args
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✓ Successfully pushed to '$remote'" -ForegroundColor Green
        } else {
            Write-Host "✗ Failed to push to '$remote'" -ForegroundColor Red
        }
    }
}
