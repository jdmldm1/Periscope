const { spawn } = require('child_process');
const logger = require('../utils/logger');

class TaskService {
    constructor() {
        this.activeTasks = {};
    }

    startTask(cmd, args, cwd = process.cwd(), onClose = null) {
        const taskId = `task-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        // shell:false (the default) is critical: with shell:true, spawn would
        // concatenate cmd+args into a single shell string, re-introducing
        // command injection for any user-controlled arg (package paths, image
        // refs, etc.). Without a shell, each arg is passed verbatim to the
        // executable. Callers that genuinely need shell features pass an
        // explicit interpreter, e.g. startTask('sh', ['-c', script]).
        const child = spawn(cmd, args, { cwd, shell: false });

        this.activeTasks[taskId] = {
            id: taskId,
            command: `${cmd} ${args.join(' ')}`,
            status: 'running',
            logs: '',
            exitCode: null,
            startTime: new Date()
        };

        const appendLog = (data) => {
            this.activeTasks[taskId].logs += data.toString();
            // Limit log size to 1MB
            if (this.activeTasks[taskId].logs.length > 1024 * 1024) {
                this.activeTasks[taskId].logs = this.activeTasks[taskId].logs.slice(-512 * 1024);
            }
        };

        child.stdout.on('data', appendLog);
        child.stderr.on('data', appendLog);

        child.on('close', (code) => {
            this.activeTasks[taskId].status = code === 0 ? 'success' : 'failed';
            this.activeTasks[taskId].exitCode = code;
            this.activeTasks[taskId].endTime = new Date();
            logger.info({ taskId, code }, 'Task completed');
            if (onClose) {
                try { onClose(code); } catch (e) { logger.error(e, 'onClose callback error'); }
            }
        });

        child.on('error', (err) => {
            this.activeTasks[taskId].status = 'failed';
            this.activeTasks[taskId].logs += `\nError: ${err.message}\n`;
            this.activeTasks[taskId].endTime = new Date();
            logger.error({ taskId, error: err.message }, 'Task failed');
            if (onClose) {
                try { onClose(-1); } catch (e) { logger.error(e, 'onClose callback error'); }
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
