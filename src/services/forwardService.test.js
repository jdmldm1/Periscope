const test = require('node:test');
const assert = require('node:assert/strict');
const forwardService = require('./forwardService');

test('forwardService - initially empty list', () => {
    assert.deepEqual(forwardService.listForwards(), []);
});

test('forwardService - deleteForward returns false for nonexistent forward', () => {
    const deleted = forwardService.deleteForward('default/nonexistent/8080');
    assert.equal(deleted, false);
});

test('forwardService - manages active forwards life cycle', () => {
    const fakeServer = {
        closeCalled: false,
        close() {
            this.closeCalled = true;
        },
    };
    const id = 'default/my-pod/8080';
    forwardService.activeForwards[id] = {
        id,
        server: fakeServer,
        localPort: 34567,
        remotePort: 8080,
        podName: 'my-pod',
        namespace: 'default',
    };

    const list = forwardService.listForwards();
    assert.equal(list.length, 1);
    assert.equal(list[0].id, id);
    assert.equal(list[0].localPort, 34567);
    assert.equal(list[0].remotePort, 8080);
    assert.equal(list[0].podName, 'my-pod');
    assert.equal(list[0].namespace, 'default');

    const deleted = forwardService.deleteForward(id);
    assert.equal(deleted, true);
    assert.equal(fakeServer.closeCalled, true);
    assert.equal(forwardService.listForwards().length, 0);
});
