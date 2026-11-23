const { spawn } = require('child_process');
const logger = require('../utils/logger');
class TaskService {
    constructor() {
        this.activeTasks = {};
    }
    startTask(cmd, args, cwd = process.cwd(), onClose = null) {
        const taskId = `task-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        const child = spawn(cmd, args, { cwd, shell: false });
        const task = {
            id: taskId,
            command: `${cmd} ${args.join(' ')}`,
            status: 'running',
            logs: '',
            exitCode: null,
            startTime: new Date(),
        };
        this.activeTasks[taskId] = task;
        const appendLog = (data) => {
            task.logs += data.toString();
            if (task.logs.length > 1024 * 1024) {
                task.logs = task.logs.slice(-512 * 1024);
            }
        };
        child.stdout.on('data', appendLog);
        child.stderr.on('data', appendLog);
        child.on('close', (code) => {
            task.status = code === 0 ? 'success' : 'failed';
            task.exitCode = code;
            task.endTime = new Date();
            logger.info({ taskId, code }, 'Task completed');
            if (onClose) {
                try {
                    onClose(code);
                } catch (e) {
                    logger.error(e, 'onClose callback error');
                }
            }
        });
        child.on('error', (err) => {
            task.status = 'failed';
            task.logs += `\nError: ${err.message}\n`;
            task.endTime = new Date();
            logger.error({ taskId, error: err.message }, 'Task failed');
            if (onClose) {
                try {
                    onClose(-1);
                } catch (e) {
                    logger.error(e, 'onClose callback error');
                }
            }
        });
        return taskId;
    }
    getTask(id) {
        return this.activeTasks[id];
    }
    deleteTask(id) {
        if (this.activeTasks[id]) {
            delete this.activeTasks[id];
            return true;
        }
        return false;
    }
    listTasks() {
        return Object.values(this.activeTasks);
    }
}
module.exports = new TaskService();
