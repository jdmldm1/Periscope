const express = require('express');
const router = express.Router();
const taskService = require('../services/taskService');

router.get('/:id/logs', (req, res) => {
    const task = taskService.getTask(req.params.id);
    if (!task) return res.status(404).json({ error: 'Task not found' });
    res.json(task);
});

router.delete('/:id', (req, res) => {
    const success = taskService.deleteTask(req.params.id);
    if (!success) return res.status(404).json({ error: 'Task not found' });
    res.json({ success: true });
});

router.get('/', (req, res) => {
    res.json(taskService.listTasks());
});

module.exports = router;
