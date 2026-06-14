import { test, expect } from '@playwright/test';

test.describe('Periscope E2E QA', () => {
  
  test.beforeEach(async ({ page }) => {
    page.on('console', msg => console.log(`BROWSER LOG [${msg.type()}]: ${msg.text()}`));
    page.on('pageerror', err => console.log(`BROWSER ERROR: ${err.message}`));
    
    await page.goto('/', { waitUntil: 'networkidle' });
    await page.evaluate(() => {
      localStorage.clear();
      // Ensure all sections are expanded by default for the test
      localStorage.setItem('sidebar_collapsed', JSON.stringify({ cluster: false, workloads: false, network: false, config: false, security: false, tools: false }));
    });
    await page.reload({ waitUntil: 'networkidle' });
    await expect(page.locator('.sidebar')).toBeVisible({ timeout: 15000 });
  });

  const sidebarClick = async (page: any, text: string) => {
    // We use a broader locator to find the nav item inside the sidebar
    await page.locator('.sidebar .nav-item').filter({ hasText: text }).first().click();
    await page.waitForTimeout(500);
  };

  test('Dashboard loads and displays stats', async ({ page }) => {
    await sidebarClick(page, 'Dashboard');
    await expect(page.locator('.stats-grid')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Active Pods')).toBeVisible();
  });

  test('Topology view graph and list modes', async ({ page }) => {
    await sidebarClick(page, 'Topology');
    // Wait for view container
    await expect(page.locator('.topology-view-wrapper').first()).toBeVisible({ timeout: 20000 });
    
    // Switch to List Mode (Columns)
    await page.locator('button[title="List View"]').click();
    await expect(page.locator('.topology-layout')).toBeVisible({ timeout: 10000 });
    
    // Switch back to Graph Mode
    await page.locator('button[title="Graph View"]').click();
    await expect(page.locator('.topology-graph-canvas').first()).toBeVisible({ timeout: 10000 });
  });

  test('Pods list and Hover Menu exhaustive checks', async ({ page }) => {
    await sidebarClick(page, 'Pods');
    
    const list = page.locator('.resource-list');
    const empty = page.locator('text=No resources found');
    await expect(list.or(empty)).toBeVisible({ timeout: 20000 });
    
    if (await list.isVisible()) {
      const firstRow = page.locator('.resource-row').first();
      
      // Events
      await firstRow.locator('button:has-text("Events")').click();
      await expect(page.locator('.modal-content')).toBeVisible();
      await expect(page.locator('.modal-tab.active:has-text("Events")')).toBeVisible();
      await expect(page.locator('.modal-body')).toBeVisible();
      await page.locator('.modal-header .btn-icon').click(); 
      
      // YAML
      await firstRow.locator('button:has-text("YAML")').click();
      await expect(page.locator('.modal-content')).toBeVisible();
      await expect(page.locator('.modal-tab.active:has-text("YAML")')).toBeVisible();
      await expect(page.locator('.editor-textarea')).toBeVisible();
      
      // Switch tabs: YAML -> Logs
      await page.locator('.modal-tab:has-text("Logs")').click();
      await expect(page.locator('.modal-tab.active:has-text("Logs")')).toBeVisible();
      await expect(page.locator('.terminal-container')).toBeVisible();

      // Switch tabs: Logs -> Console
      await page.locator('.modal-tab:has-text("Console")').click();
      await expect(page.locator('.modal-tab.active:has-text("Console")')).toBeVisible();
      await expect(page.locator('.exec-terminal')).toBeVisible();

      // Switch tabs: Console -> Files
      await page.locator('.modal-tab:has-text("Files")').click();
      await expect(page.locator('.modal-tab.active:has-text("Files")')).toBeVisible();
      await expect(page.locator('.crd-table')).toBeVisible();

      // Switch tabs: Files -> YAML
      await page.locator('.modal-tab:has-text("YAML")').click();
      await expect(page.locator('.modal-tab.active:has-text("YAML")')).toBeVisible();
      
      // Close modal
      await page.locator('.modal-header .btn-icon').click();
      await expect(page.locator('.modal-content')).not.toBeVisible();

      // Pod Files (Open directly from hover menu button)
      await firstRow.locator('button:has-text("Files")').click();
      await expect(page.locator('.modal-content')).toBeVisible();
      await expect(page.locator('.modal-tab.active:has-text("Files")')).toBeVisible();
      await expect(page.locator('.crd-table')).toBeVisible();
      await page.locator('.modal-header .btn-icon').click();
      await expect(page.locator('.modal-content')).not.toBeVisible();

      // Logs
      await firstRow.locator('button:has-text("Logs")').click();
      await expect(page.locator('.modal-content')).toBeVisible();
      await expect(page.locator('.modal-tab.active:has-text("Logs")')).toBeVisible();
      await page.locator('.modal-header .btn-icon').click(); 

      // Console
      await firstRow.locator('button:has-text("Console")').click();
      await expect(page.locator('.modal-content')).toBeVisible();
      await expect(page.locator('.modal-tab.active:has-text("Console")')).toBeVisible();
      await page.locator('.modal-header .btn-icon').click(); 
      
      // Diagnose
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
       await expect(page.locator('.editor-textarea')).not.toBeDisabled();
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
  });

  test('Image Scanner page and Scan functionality', async ({ page }) => {
    await sidebarClick(page, 'Image SBOM'); // CORRECT LABEL
    await expect(page.locator('h3:has-text("Real-time Container Vulnerabilities")')).toBeVisible({ timeout: 20000 });
    
    // Test the "Auto Scan" switch toggle
    const autoScanCheckbox = page.locator('label:has-text("Auto-scan in background") input[type="checkbox"]');
    await expect(autoScanCheckbox).toBeVisible();
    const isChecked = await autoScanCheckbox.isChecked();
    await autoScanCheckbox.click();
    if (isChecked) {
        await expect(autoScanCheckbox).not.toBeChecked();
    } else {
        await expect(autoScanCheckbox).toBeChecked();
    }
    // Click again to restore
    await autoScanCheckbox.click();
    if (isChecked) {
        await expect(autoScanCheckbox).toBeChecked();
    } else {
        await expect(autoScanCheckbox).not.toBeChecked();
    }

    // Switch to Scanned Images sub-tab
    await page.locator('button:has-text("Scanned Images")').click();
    
    // Wait for the table to become visible
    const table = page.locator('.crd-table');
    await expect(table).toBeVisible({ timeout: 15000 });

    // Test the "Rescan" / "Scan" button on a specific image row
    const firstRowScanBtn = table.locator('tbody tr button').first();
    await expect(firstRowScanBtn).toBeVisible({ timeout: 10000 });
    
    const btnText = await firstRowScanBtn.innerText();
    if (btnText === 'Scan' || btnText === 'Rescan') {
        await firstRowScanBtn.click();
        await expect(firstRowScanBtn).toHaveText(/Scanning...|DB Updating/);
    }

    // Test the "Scan All Running Images" button
    const scanBtn = page.locator('button:has-text("Scan All Running Images")');
    if (await scanBtn.isVisible() && await scanBtn.isEnabled()) {
        await scanBtn.click();
        // Wait to see if it turns to "Scanning Cluster..."
        await expect(page.locator('button:has-text("Scanning Cluster...")').or(page.locator('button:has-text("Waiting for DB...")'))).toBeVisible({ timeout: 10000 });
    }
  });

  test('Kubescape Audit page and compliance scan linter functionality', async ({ page }) => {
    await sidebarClick(page, 'Kubescape Audit');
    await expect(page.locator('text=Security Compliance Scan')).toBeVisible({ timeout: 20000 });
    
    // Locate the "Run Compliance Scan" button
    const scanBtn = page.locator('button:has-text("Run Compliance Scan")').first();
    await expect(scanBtn).toBeVisible({ timeout: 15000 });
    
    // Click it to trigger scan
    await scanBtn.click();
    
    // Expect loading state to appear
    await expect(page.locator('text=Compliance scan in progress...')).toBeVisible({ timeout: 10000 });
    
    // Expect scan to finish and display compliance score or controls
    await expect(page.locator('text=NSA-CISA Compliance').or(page.locator('text=MITRE ATT&CK Compliance'))).toBeVisible({ timeout: 40000 });
    await expect(page.locator('text=Privileged container').or(page.locator('text=HostPath mount'))).toBeVisible({ timeout: 10000 });
  });

});
