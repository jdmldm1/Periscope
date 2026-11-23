const test = require('node:test');
const assert = require('node:assert/strict');
const taskService = require('./taskService');

const waitFor = async (predicate) => {
    for (let i = 0; i < 100; i++) {
        if (predicate()) return;
        await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error('timed out waiting for task');
};

test('a successful task captures output and exit code', async () => {
    const id = taskService.startTask(process.execPath, ['-e', 'console.log("hello"); console.error("warn")']);
    await waitFor(() => taskService.getTask(id).status !== 'running');
    const task = taskService.getTask(id);
    assert.equal(task.status, 'success');
    assert.equal(task.exitCode, 0);
    assert.match(task.logs, /hello/);
    assert.match(task.logs, /warn/);
    assert.ok(task.endTime);
});

test('a failing task is marked failed and invokes onClose with the exit code', async () => {
    let closedWith;
    const id = taskService.startTask(process.execPath, ['-e', 'process.exit(3)'], process.cwd(), (code) => {
        closedWith = code;
    });
    await waitFor(() => closedWith !== undefined);
    assert.equal(closedWith, 3);
    assert.equal(taskService.getTask(id).status, 'failed');
});

test('a command that cannot be spawned fails and reports -1', async () => {
    const codes = [];
    const id = taskService.startTask('definitely-not-a-real-binary-xyz', [], process.cwd(), (code) => {
        codes.push(code);
    });
    await waitFor(() => codes.length > 0);
    assert.equal(codes[0], -1);
    assert.equal(taskService.getTask(id).status, 'failed');
    assert.match(taskService.getTask(id).logs, /Error:/);
});

test('arguments are passed without shell interpretation', async () => {
    const id = taskService.startTask(process.execPath, ['-e', 'console.log(process.argv[1])', '$(echo pwned); ls']);
    await waitFor(() => taskService.getTask(id).status !== 'running');
    assert.match(taskService.getTask(id).logs, /\$\(echo pwned\); ls/);
});

test('a throwing onClose callback does not crash the service', async () => {
    const id = taskService.startTask(process.execPath, ['-e', ''], process.cwd(), () => {
        throw new Error('callback failed');
    });
    await waitFor(() => taskService.getTask(id).status !== 'running');
    assert.equal(taskService.getTask(id).status, 'success');
});

test('listTasks and deleteTask manage the registry', async () => {
    const id = taskService.startTask(process.execPath, ['-e', '']);
    await waitFor(() => taskService.getTask(id).status !== 'running');
    assert.ok(taskService.listTasks().some((t) => t.id === id));
    assert.equal(taskService.deleteTask(id), true);
    assert.equal(taskService.deleteTask(id), false);
    assert.equal(taskService.getTask(id), undefined);
});

test('deleting a running task does not crash when its process later produces output and exits', async () => {
    let closed = false;
    const id = taskService.startTask(
        process.execPath,
        ['-e', 'setTimeout(() => { console.log("late"); }, 150)'],
        process.cwd(),
        () => {
            closed = true;
        },
    );
    assert.equal(taskService.deleteTask(id), true);
    await waitFor(() => closed);
    assert.equal(taskService.getTask(id), undefined);
});
