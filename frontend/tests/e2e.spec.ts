import { test, expect } from '@playwright/test';
test.describe('Periscope E2E QA', () => {
    test.beforeEach(async ({ page }) => {
        page.on('console', msg => console.log(`BROWSER LOG [${msg.type()}]: ${msg.text()}`));
        page.on('pageerror', err => console.log(`BROWSER ERROR: ${err.message}`));
        await page.goto('/', { waitUntil: 'networkidle' });
        await page.evaluate(() => {
            localStorage.clear();
            localStorage.setItem('sidebar_collapsed', JSON.stringify({ cluster: false, workloads: false, network: false, config: false, security: false, tools: false }));
        });
        await page.reload({ waitUntil: 'networkidle' });
        await expect(page.locator('.sidebar')).toBeVisible({ timeout: 15000 });
    });
    const sidebarClick = async (page: any, text: string) => {
        await page.locator('.sidebar .nav-item').filter({ hasText: text }).first().click();
        await page.waitForTimeout(500);
    };
    test('Dashboard loads and displays stats', async ({ page }) => {
        await sidebarClick(page, 'Dashboard');
        await expect(page.locator('.dashboard-charts-grid').first()).toBeVisible({ timeout: 10000 });
        await expect(page.locator('text=Cluster Health').or(page.locator('text=ACTIVE ISSUES')).first()).toBeVisible();
    });
    test('Topology view graph and list modes', async ({ page }) => {
        await sidebarClick(page, 'Topology');
        await expect(page.locator('.topology-view-wrapper').first()).toBeVisible({ timeout: 20000 });
        await page.locator('button[title="List View"]').click();
        await expect(page.locator('.topology-layout')).toBeVisible({ timeout: 10000 });
        await page.locator('button[title="Graph View"]').click();
        await expect(page.locator('.topology-graph-canvas').first()).toBeVisible({ timeout: 10000 });
    });
    test('Pods list and Hover Menu exhaustive checks', async ({ page }) => {
        await sidebarClick(page, 'Pods');
        const list = page.locator('.resource-list');
        const empty = page.locator('text=No resources found');
        await expect(list.or(empty)).toBeVisible({ timeout: 20000 });
        if (await list.isVisible()) {
            let firstRow = page.locator('.resource-row:has-text("local-path-provisioner")').first();
            if (!await firstRow.isVisible()) {
                firstRow = page.locator('.resource-row:has-text("periscope")').first();
            }
            if (!await firstRow.isVisible()) {
                firstRow = page.locator('.resource-row').first();
            }
            await firstRow.locator('button:has-text("Events")').click();
            await expect(page.locator('.modal-content')).toBeVisible();
            await expect(page.locator('.modal-tab.active:has-text("Events")')).toBeVisible();
            await expect(page.locator('.modal-body')).toBeVisible();
            await page.locator('.modal-header .btn-icon').click();
            await firstRow.locator('button:has-text("YAML")').click();
            await expect(page.locator('.modal-content')).toBeVisible();
            await expect(page.locator('.modal-tab.active:has-text("YAML")')).toBeVisible();
            await expect(page.locator('.editor-container')).toBeVisible();
            await page.locator('.modal-tab:has-text("Logs")').click();
            await expect(page.locator('.modal-tab.active:has-text("Logs")')).toBeVisible();
            await expect(page.locator('.terminal-container')).toBeVisible();
            await page.locator('.modal-tab:has-text("Console")').click();
            await expect(page.locator('.modal-tab.active:has-text("Console")')).toBeVisible();
            await expect(page.locator('.exec-terminal')).toBeVisible();
            await page.locator('.modal-tab:has-text("Files")').click();
            await expect(page.locator('.modal-tab.active:has-text("Files")')).toBeVisible();
            await expect(page.locator('.crd-table')).toBeVisible();
            await page.locator('.modal-tab:has-text("YAML")').click();
            await expect(page.locator('.modal-tab.active:has-text("YAML")')).toBeVisible();
            await page.locator('.modal-header .btn-icon').click();
            await expect(page.locator('.modal-content')).not.toBeVisible();
            await firstRow.locator('button:has-text("Files")').click();
            await expect(page.locator('.modal-content')).toBeVisible();
            await expect(page.locator('.modal-tab.active:has-text("Files")')).toBeVisible();
            await expect(page.locator('.crd-table')).toBeVisible();
            page.once('dialog', async (dialog) => {
                expect(dialog.message()).toContain('Enter folder name:');
                await dialog.accept('playwright-test-dir');
            });
            await page.locator('button:has-text("New Folder")').click();
            await expect(page.locator('tr:has-text("playwright-test-dir")')).toBeVisible({ timeout: 10000 });
            page.once('dialog', async (dialog) => {
                expect(dialog.message()).toContain('Delete folder playwright-test-dir?');
                await dialog.accept();
            });
            await page.locator('tr:has-text("playwright-test-dir") button:has-text("Del")').click();
            await expect(page.locator('tr:has-text("playwright-test-dir")')).not.toBeVisible({ timeout: 10000 });
            await page.locator('.modal-header .btn-icon').click();
            await expect(page.locator('.modal-content')).not.toBeVisible();
            await firstRow.locator('button:has-text("Logs")').click();
            await expect(page.locator('.modal-content')).toBeVisible();
            await expect(page.locator('.modal-tab.active:has-text("Logs")')).toBeVisible();
            await page.locator('.modal-header .btn-icon').click();
            await firstRow.locator('button:has-text("Console")').click();
            await expect(page.locator('.modal-content')).toBeVisible();
            await expect(page.locator('.modal-tab.active:has-text("Console")')).toBeVisible();
            await page.locator('.modal-header .btn-icon').click();
            await expect(firstRow.locator('button:has-text("Diagnose")')).toBeVisible();
        }
    });
    test('Deployments list and Hover Menu functionality', async ({ page }) => {
        await sidebarClick(page, 'Deployments');
        const list = page.locator('.resource-list');
        await expect(list.or(page.locator('text=No resources found'))).toBeVisible({ timeout: 15000 });
        if (await list.isVisible()) {
            const firstRow = page.locator('.resource-row').first();
            await expect(firstRow.locator('button:has-text("Scale")')).toBeVisible();
            await expect(firstRow.locator('button:has-text("Restart")')).toBeVisible();
            await expect(firstRow.locator('button:has-text("Pods")')).toBeVisible();
            await firstRow.locator('button:has-text("Edit")').click();
            await expect(page.locator('.modal-content')).toBeVisible();
            await expect(page.locator('.editor-container')).toBeVisible();
            await page.locator('.modal-header .btn-icon').click();
        }
    });
    test('Services list and Hover Menu functionality', async ({ page }) => {
        await sidebarClick(page, 'Services');
        const list = page.locator('.resource-list');
        await expect(list.or(page.locator('text=No resources found'))).toBeVisible({ timeout: 15000 });
        if (await list.isVisible()) {
            const firstRow = page.locator('.resource-row').first();
            await expect(firstRow.locator('button:has-text("Website")')).toBeVisible();
            await firstRow.locator('button:has-text("YAML")').click();
            await expect(page.locator('.modal-content')).toBeVisible();
            await page.locator('.modal-header .btn-icon').click();
        }
    });
    test('ConfigMaps list and Hover Menu functionality', async ({ page }) => {
        await sidebarClick(page, 'ConfigMaps');
        const list = page.locator('.resource-list');
        await expect(list.or(page.locator('text=No resources found'))).toBeVisible({ timeout: 15000 });
        if (await list.isVisible()) {
            const firstRow = page.locator('.resource-row').first();
            await expect(firstRow.locator('button:has-text("Edit")')).toBeVisible();
            await firstRow.locator('button:has-text("Events")').click();
            await expect(page.locator('.modal-content')).toBeVisible();
            await page.locator('.modal-header .btn-icon').click();
        }
    });
    test('Helm Releases list', async ({ page }) => {
        await sidebarClick(page, 'Helm Releases');
        await expect(page.locator('text=Active Releases')).toBeVisible();
        const rows = page.locator('.resource-row');
        const empty = page.locator('text=No releases found');
        await expect(rows.first().or(empty)).toBeVisible({ timeout: 15000 });
    });
    test('Zarf Packages list', async ({ page }) => {
        await sidebarClick(page, 'Zarf Packages');
        await expect(page.locator('h3:has-text("Deployed Packages")')).toBeVisible();
        const deployBtn = page.locator('button:has-text("Deploy New Package")');
        await expect(deployBtn).toBeVisible();
        await deployBtn.click();
        const modal = page.locator('.modal-content:has-text("Upload & Deploy Zarf Package")');
        await expect(modal).toBeVisible();
        await modal.locator('button:has-text("Close")').click();
        await expect(modal).not.toBeVisible();
    });
    test('Image Scanner page and Scan functionality', async ({ page }) => {
        await sidebarClick(page, 'Image SBOM');
        await expect(page.locator('h3:has-text("Real-time Container Vulnerabilities")')).toBeVisible({ timeout: 20000 });
        const autoScanCheckbox = page.locator('label:has-text("Auto-scan in background") input[type="checkbox"]');
        await expect(autoScanCheckbox).toBeVisible();
        const isChecked = await autoScanCheckbox.isChecked();
        await autoScanCheckbox.click();
        if (isChecked) {
            await expect(autoScanCheckbox).not.toBeChecked();
        }
        else {
            await expect(autoScanCheckbox).toBeChecked();
        }
        await autoScanCheckbox.click();
        if (isChecked) {
            await expect(autoScanCheckbox).toBeChecked();
        }
        else {
            await expect(autoScanCheckbox).not.toBeChecked();
        }
        await page.locator('button:has-text("Scanned Images")').click();
        const table = page.locator('.crd-table');
        await expect(table).toBeVisible({ timeout: 15000 });
        const firstRowScanBtn = table.locator('tbody tr button').first();
        await expect(firstRowScanBtn).toBeVisible({ timeout: 10000 });
        const btnText = await firstRowScanBtn.innerText();
        if (btnText === 'Scan' || btnText === 'Rescan') {
            await firstRowScanBtn.click();
            await expect(firstRowScanBtn).toHaveText(/Scanning...|DB Updating/);
        }
        const scanBtn = page.locator('button:has-text("Scan All Running Images")');
        if (await scanBtn.isVisible() && await scanBtn.isEnabled()) {
            await scanBtn.click();
            await expect(page.locator('button:has-text("Scanning Cluster...")').or(page.locator('button:has-text("Waiting for DB...")'))).toBeVisible({ timeout: 10000 });
        }
    });
    test('Kubescape Audit page and compliance scan linter functionality', async ({ page }) => {
        await sidebarClick(page, 'Kubescape Audit');
        await expect(page.locator('text=Security Compliance Scan')).toBeVisible({ timeout: 20000 });
        const scanBtn = page.locator('button:has-text("Run Compliance Scan")').first();
        await expect(scanBtn).toBeVisible({ timeout: 15000 });
        await scanBtn.click();
        await expect(page.locator('text=Compliance scan in progress...')).toBeVisible({ timeout: 10000 });
        await expect(page.locator('text=NSA Compliance').or(page.locator('text=NSA-CISA Compliance')).first()).toBeVisible({ timeout: 40000 });
        await expect(page.locator('text=C-0012').or(page.locator('text=C-0016')).first()).toBeVisible({ timeout: 10000 });
    });
});
