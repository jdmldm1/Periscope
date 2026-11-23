import { test, expect, type Page } from '@playwright/test';

const NAV_STATE = {
    cluster: false,
    workloads: false,
    network: false,
    config: false,
    security: false,
    operations: false,
    helm: false,
    tools: false,
};

const sidebarClick = async (page: Page, text: string) => {
    await page.locator('.sidebar .nav-item').filter({ hasText: text }).first().click();
};

const selectNamespace = async (page: Page, value: string) => {
    await page.locator('select.select-ns').last().selectOption(value);
};

test.beforeEach(async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    await page.evaluate((state) => {
        localStorage.clear();
        localStorage.setItem('sidebar_collapsed', JSON.stringify(state));
    }, NAV_STATE);
    await page.reload({ waitUntil: 'networkidle' });
    await expect(page.locator('.sidebar')).toBeVisible({ timeout: 15000 });
});

test.describe('Cluster insight views', () => {
    test('Events view filters by type and text', async ({ page }) => {
        await sidebarClick(page, 'Events');
        const filter = page.getByPlaceholder(/Filter by reason/);
        await expect(filter).toBeVisible();
        await expect(page.getByRole('button', { name: /Warnings/ })).toBeVisible();
        await expect(page.getByLabel('Group repeats')).toBeChecked();
        await filter.fill('zzz-no-such-event-zzz');
        await expect(page.getByText('No matching events.')).toBeVisible();
        await filter.fill('');
        await page.getByRole('button', { name: 'Normal' }).click();
        await page.getByRole('button', { name: 'All', exact: true }).click();
    });

    test('Resource Usage shows node capacity and the pod heatmap', async ({ page }) => {
        await sidebarClick(page, 'Resource Usage');
        await expect(page.getByRole('heading', { name: 'Nodes' })).toBeVisible();
        await expect(page.getByText(/allocatable/).first()).toBeVisible({ timeout: 20000 });
        await expect(page.getByRole('heading', { name: 'Pods' })).toBeVisible();
        await expect(page.locator('button[aria-label*=":"]').first()).toBeVisible();
        await page.getByRole('button', { name: 'Memory' }).click();
        await expect(page.getByText(/allocatable/).first()).toBeVisible();
        await expect(page.getByRole('heading', { name: /Right-sizing hints/ })).toBeVisible();
    });

    test('RBAC Explorer lists subjects and answers a who-can query', async ({ page }) => {
        await sidebarClick(page, 'RBAC Explorer');
        await expect(page.getByText(/\d+ subjects?/)).toBeVisible({ timeout: 20000 });
        await page.getByLabel('Admin / wildcard only').check();
        const admin = page.getByText('admin', { exact: true }).first();
        await expect(admin).toBeVisible();
        await page.getByLabel('Admin / wildcard only').uncheck();

        await page.getByRole('button', { name: 'Who can…?' }).click();
        await page.getByPlaceholder(/resource \(pods/).fill('secrets');
        await page.getByRole('button', { name: 'Evaluate' }).click();
        await expect(page.getByText(/\d+ subjects?/)).toBeVisible();
        const rows = page.locator('div[style*="cursor: pointer"]');
        await expect(rows.first()).toBeVisible({ timeout: 15000 });
        await rows.first().click();
        await expect(page.getByText(/via (Cluster)?RoleBinding/)).toBeVisible({ timeout: 15000 });
    });

    test('Certificates view loads and exposes its filters', async ({ page }) => {
        await sidebarClick(page, 'Certificates');
        await expect(page.getByRole('button', { name: 'Needs attention' })).toBeVisible();
        await expect(page.getByPlaceholder(/Filter by name/)).toBeVisible();
        const empty = page.getByText('No certificates match.');
        const entries = page.getByText(/(\d+d left|expired \d+d ago)/).first();
        await expect(empty.or(entries)).toBeVisible({ timeout: 20000 });
        await page.getByRole('button', { name: 'Needs attention' }).click();
        await page.getByRole('button', { name: 'Needs attention' }).click();
    });
});

test.describe('Command palette resource search', () => {
    test('finds a workload across namespaces and opens it', async ({ page }) => {
        await page.keyboard.press('Control+k');
        const input = page.getByPlaceholder(/Search resources, views/);
        await expect(input).toBeVisible();
        await input.fill('coredns');
        const hit = page.getByText(/coredns · deployments · /).first();
        await expect(hit).toBeVisible({ timeout: 15000 });
        await hit.click();
        await expect(page.locator('.resource-row').filter({ hasText: 'coredns' }).first()).toBeVisible({
            timeout: 15000,
        });
    });

    test('still opens views by alias', async ({ page }) => {
        await page.keyboard.press('Control+k');
        await page.getByPlaceholder(/Search resources, views/).fill(':certs');
        await page.keyboard.press('Enter');
        await expect(page.getByRole('button', { name: 'Needs attention' })).toBeVisible();
    });
});

test.describe('Workload operations', () => {
    const corednsRow = (page: Page) => page.locator('.resource-row').filter({ hasText: 'coredns' }).first();

    test('Deployment rollout history lists the running revision', async ({ page }) => {
        await sidebarClick(page, 'Deployments');
        await selectNamespace(page, 'kube-system');
        const row = corednsRow(page);
        await expect(row).toBeVisible({ timeout: 20000 });
        await row.hover();
        await row.locator('button:has-text("History")').click();
        await expect(page.locator('.modal-tab.active:has-text("Rollout")')).toBeVisible();
        await expect(page.getByText('current', { exact: true })).toBeVisible({ timeout: 15000 });
        await expect(page.getByText(/^#\d+/).first()).toBeVisible();
        const current = page.getByRole('button', { name: /Roll back/ }).first();
        await expect(current).toBeDisabled();
        await page.locator('.modal-header .btn-icon').click();
    });

    test('YAML editor can validate against the API server and diff against live', async ({ page }) => {
        await sidebarClick(page, 'Deployments');
        await selectNamespace(page, 'kube-system');
        const row = corednsRow(page);
        await expect(row).toBeVisible({ timeout: 20000 });
        await row.hover();
        await row.locator('button:has-text("Edit")').click();
        await expect(page.locator('.editor-container')).toBeVisible();
        await page.getByRole('button', { name: /Validate/ }).click();
        await expect(page.getByText(/(server dry run|dry run|Invalid|error)/i).first()).toBeVisible({
            timeout: 30000,
        });
        await page.getByRole('button', { name: /Diff vs live/ }).click();
        await expect(page.getByText(/Live ← → Your edits/)).toBeVisible({ timeout: 20000 });
    });

    test('Nodes can be cordoned and uncordoned', async ({ page }) => {
        page.on('dialog', (dialog) => void dialog.accept());
        await sidebarClick(page, 'Nodes');
        const row = page.locator('.resource-row').first();
        await expect(row).toBeVisible({ timeout: 20000 });
        await row.hover();
        const cordon = row.locator('button:has-text("Cordon")');
        const uncordon = row.locator('button:has-text("Uncordon")');
        await expect(cordon.or(uncordon)).toBeVisible();
        if (await uncordon.isVisible()) {
            await uncordon.click();
            await row.hover();
            await expect(row.locator('button:has-text("Cordon")').first()).toBeVisible({ timeout: 20000 });
        }
        await expect(row.locator('button:has-text("Drain")')).toBeVisible();
        try {
            await row.hover();
            await row.locator('button:has-text("Cordon")').first().click();
            await row.hover();
            await expect(row.locator('button:has-text("Uncordon")')).toBeVisible({ timeout: 30000 });
        } finally {
            await page.locator('.resource-row').first().hover();
            const again = page.locator('.resource-row').first().locator('button:has-text("Uncordon")');
            if (await again.isVisible()) await again.click();
        }
        await expect(page.locator('.resource-row').first().locator('button:has-text("Cordon")').first()).toBeVisible({
            timeout: 30000,
        });
    });

    test('StatefulSets and DaemonSets offer restart actions', async ({ page }) => {
        await sidebarClick(page, 'DaemonSets');
        await selectNamespace(page, 'all');
        const list = page.locator('.resource-list');
        const empty = page.locator('text=No resources found');
        await expect(list.or(empty)).toBeVisible({ timeout: 20000 });
        if (await list.isVisible()) {
            const ds = page.locator('.resource-row').first();
            await ds.hover();
            await expect(ds.locator('button:has-text("Restart")')).toBeVisible();
        }
        await sidebarClick(page, 'StatefulSets');
        await expect(list.or(empty)).toBeVisible({ timeout: 20000 });
        if (await list.isVisible()) {
            const first = page.locator('.resource-row').first();
            await first.hover();
            await expect(first.locator('button:has-text("Restart")')).toBeVisible();
            await expect(first.locator('button:has-text("Scale")')).toBeVisible();
        }
    });

    test('CRD explorer shows an API schema for a custom resource definition', async ({ page }) => {
        await sidebarClick(page, 'CRD Explorer');
        const crdRow = page.locator('.resource-row').first();
        const hasCrds = await crdRow
            .waitFor({ timeout: 15000 })
            .then(() => true)
            .catch(() => false);
        test.skip(!hasCrds, 'cluster has no CRDs');
        await crdRow.hover();
        await crdRow.locator('button:has-text("Schema")').click();
        await expect(page.locator('.modal-tab.active:has-text("Schema")')).toBeVisible();
        await expect(page.getByPlaceholder('Filter fields…')).toBeVisible({ timeout: 15000 });
    });
});
